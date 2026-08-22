import bcrypt from 'bcryptjs';
import { asc, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/index.js';
import { notificationLog, predictions, pushSubscriptions, rounds, teams, users } from '../db/schema.js';
import { seedBase } from '../db/seed.js';
import { createFixture } from '../engine/fixture-admin.js';
import { postponeFixture, rescheduleFixture } from '../engine/postpone.js';
import { enterFinalResult } from '../engine/scoring-engine.js';
import type { EngineCtx } from '../engine/types.js';
import { FixedClock } from '../lib/clock.js';
import { SYSTEM_ACTOR } from '../lib/audit.js';
import { buildPushEvents } from './events.js';
import { PushScheduler } from './scheduler.js';
import { PushService, type PushTransport } from './sender.js';

const T0 = new Date('2026-08-20T10:00:00Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

interface Env {
  db: Db;
  clock: FixedClock;
  ctx: EngineCtx;
  scheduler: PushScheduler;
  push: PushService;
  sent: Array<{ endpoint: string; payload: { title: string } }>;
  userIds: [number, number];
  lockAt: number;
  fixtureIds: [number, number];
}

function createEnv(): Env {
  const db = createDb(':memory:');
  seedBase(db, { inviteCode: 'TEST1234' });
  const clock = new FixedClock(T0);
  const sent: Env['sent'] = [];
  const transport: PushTransport = async (subscription, payload) => {
    sent.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload) as { title: string } });
  };
  const push = new PushService(db, transport, 'test-key');
  const scheduler = new PushScheduler(db, push);
  const ctx: EngineCtx = { db, clock, events: buildPushEvents(db, push) };

  const userIds = ['dror', 'avi'].map(
    (username, i) =>
      db
        .insert(users)
        .values({
          username,
          passwordHash: bcrypt.hashSync('x', 4),
          displayName: username,
          phone: `05277000${i}1`,
        })
        .returning()
        .get().id,
  ) as [number, number];
  for (const userId of userIds) {
    db.insert(pushSubscriptions)
      .values({ userId, endpoint: `https://push.example/${userId}`, p256dh: 'k', auth: 'a' })
      .run();
  }

  const round1 = db.select().from(rounds).all().find((r) => r.number === 1)!;
  const teamIds = db.select().from(teams).orderBy(asc(teams.id)).all().map((t) => t.id);
  const lockAt = T0.getTime() + 2 * DAY;
  const f1 = createFixture(
    ctx,
    { roundId: round1.id, homeTeamId: teamIds[0]!, awayTeamId: teamIds[1]!, kickoffAt: lockAt },
    SYSTEM_ACTOR,
  );
  const f2 = createFixture(
    ctx,
    { roundId: round1.id, homeTeamId: teamIds[2]!, awayTeamId: teamIds[3]!, kickoffAt: lockAt + 2 * HOUR },
    SYSTEM_ACTOR,
  );
  // dror predicted everything; avi predicted nothing
  for (const f of [f1, f2]) {
    db.insert(predictions)
      .values({ userId: userIds[0], fixtureId: f.id, homePred: 1, awayPred: 0, updatedAt: clock.now() })
      .run();
  }

  return { db, clock, ctx, scheduler, push, sent, userIds, lockAt, fixtureIds: [f1.id, f2.id] };
}

const titles = (env: Env) => env.sent.map((s) => s.payload.title);

describe('push scheduler', () => {
  let env: Env;

  beforeEach(() => {
    env = createEnv();
  });

  it('sends nothing before the 24h window', async () => {
    await env.scheduler.tick(new Date(env.lockAt - 25 * HOUR));
    expect(env.sent).toHaveLength(0);
  });

  it('sends the 24h reminder to everyone, exactly once, restart-safe', async () => {
    const at = new Date(env.lockAt - 23 * HOUR);
    await env.scheduler.tick(at);
    expect(env.sent).toHaveLength(2);
    expect(titles(env)[0]).toContain('ננעל מחר');

    // Same tick again + a "restarted server" (new scheduler over same DB)
    await env.scheduler.tick(at);
    await new PushScheduler(env.db, env.push).tick(at);
    expect(env.sent).toHaveLength(2);
  });

  it('sends 3h/30m reminders only to users with missing predictions', async () => {
    await env.scheduler.tick(new Date(env.lockAt - 23 * HOUR)); // 24h → both
    env.sent.length = 0;

    await env.scheduler.tick(new Date(env.lockAt - 2 * HOUR)); // 3h window
    expect(env.sent).toHaveLength(1);
    expect(env.sent[0]!.endpoint).toBe(`https://push.example/${env.userIds[1]}`);
    expect(titles(env)[0]).toContain('3 שעות');

    env.sent.length = 0;
    await env.scheduler.tick(new Date(env.lockAt - 10 * 60 * 1000)); // 30m window
    expect(env.sent).toHaveLength(1);
    expect(titles(env)[0]).toContain('חצי שעה');
  });

  it('re-arms reminders with the new time when the lock moves pre-lock', async () => {
    await env.scheduler.tick(new Date(env.lockAt - 23 * HOUR));
    const firstBatch = titles(env).filter((t) => t.includes('ננעל מחר')).length;
    expect(firstBatch).toBe(2);

    // The earliest game is postponed BEFORE the lock → lockAt moves 2h later
    postponeFixture(env.ctx, env.fixtureIds[0], SYSTEM_ACTOR);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const newLockAt = env.lockAt + 2 * HOUR;

    await env.scheduler.tick(new Date(newLockAt - 23 * HOUR));
    const secondBatch = titles(env).filter((t) => t.includes('ננעל מחר')).length;
    expect(secondBatch).toBe(4); // fresh reminders for the new lock time
  });

  it('drops reminders that became stale during downtime', async () => {
    await env.scheduler.tick(new Date(env.lockAt + HOUR));
    expect(env.sent).toHaveLength(0);
  });

  it('notifies on round close and next round opening', async () => {
    enterFinalResult(env.ctx, env.fixtureIds[0], { homeScore: 1, awayScore: 0 }, SYSTEM_ACTOR);
    enterFinalResult(env.ctx, env.fixtureIds[1], { homeScore: 2, awayScore: 2 }, SYSTEM_ACTOR);
    await new Promise((resolve) => setTimeout(resolve, 10)); // fire-and-forget events settle

    const allTitles = titles(env);
    expect(allTitles.some((t) => t.includes('הסתיים'))).toBe(true);
    expect(allTitles.some((t) => t.includes('נפתח לניחושים'))).toBe(true);
    const summaryBody = env.sent.find((s) => s.payload.title.includes('הסתיים'))!.payload as {
      body?: string;
    };
    expect(summaryBody.body).toContain('dror');
  });

  it('notifies on postpone and reschedule, then reminds when the window opens', async () => {
    postponeFixture(env.ctx, env.fixtureIds[1], SYSTEM_ACTOR);
    const newKickoff = T0.getTime() + 30 * DAY;
    rescheduleFixture(env.ctx, env.fixtureIds[1], newKickoff, SYSTEM_ACTOR);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(titles(env).some((t) => t.includes('נדחה'))).toBe(true);
    expect(titles(env).some((t) => t.includes('מועד חדש'))).toBe(true);

    env.sent.length = 0;
    await env.scheduler.tick(new Date(newKickoff - 6 * DAY));
    expect(titles(env).some((t) => t.includes('משחק השלמה פתוח'))).toBe(true);
    // Idempotent on repeat
    const count = env.sent.length;
    await env.scheduler.tick(new Date(newKickoff - 6 * DAY + 60 * 1000));
    expect(env.sent).toHaveLength(count);
  });

  it('prunes dead subscriptions on 410 and logs the outcome', async () => {
    const dead: PushTransport = async () => {
      const error = new Error('gone') as Error & { statusCode: number };
      error.statusCode = 410;
      throw error;
    };
    const push = new PushService(env.db, dead, 'k');
    await push.sendEvent({
      eventKey: 'test:1',
      userId: env.userIds[0],
      type: 'lock_24h',
      title: 't',
      body: 'b',
    });
    expect(
      env.db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, env.userIds[0]))
        .all(),
    ).toHaveLength(0);
    const log = env.db.select().from(notificationLog).all().find((l) => l.eventKey === 'test:1');
    expect(log?.status).toBe('failed');
  });
});
