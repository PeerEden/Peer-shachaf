import bcrypt from 'bcryptjs';
import { asc, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/index.js';
import {
  auditLog,
  fixtures,
  predictions,
  predictionScores,
  rounds,
  roundUserStats,
  teams,
  users,
} from '../db/schema.js';
import { seedBase } from '../db/seed.js';
import { FixedClock } from '../lib/clock.js';
import { SYSTEM_ACTOR, type Actor } from '../lib/audit.js';
import { adminDeleteUser, adminFixPrediction } from './admin-actions.js';
import { createFixture, deleteFixture } from './fixture-admin.js';
import { arePredictionsVisible, isFixturePredictable } from './round-lifecycle.js';
import { cancelFixture, postponeFixture, rescheduleFixture } from './postpone.js';
import { enterFinalResult } from './scoring-engine.js';
import { computeSeasonTotals } from './standings.js';
import type { EngineCtx } from './types.js';

const T0 = new Date('2026-08-20T10:00:00Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

interface Env {
  ctx: EngineCtx;
  db: Db;
  clock: FixedClock;
  seasonId: number;
  dror: number;
  avi: number;
  admin: Actor;
}

function createEnv(): Env {
  const db = createDb(':memory:');
  const { seasonId } = seedBase(db, { inviteCode: 'TEST1234' });
  const clock = new FixedClock(T0);
  const ctx: EngineCtx = { db, clock };
  const [dror, avi] = ['dror', 'avi'].map(
    (username, i) =>
      db
        .insert(users)
        .values({
          username,
          passwordHash: bcrypt.hashSync('x', 4),
          displayName: username,
          phone: `05299000${i}1`,
        })
        .returning()
        .get().id,
  ) as [number, number];
  return { ctx, db, clock, seasonId, dror, avi, admin: SYSTEM_ACTOR };
}

function addFixture(env: Env, roundNumber: number, kickoffAt: Date, teamOffset = 0) {
  const round = env.db.select().from(rounds).all().find((r) => r.number === roundNumber)!;
  const teamIds = env.db.select().from(teams).orderBy(asc(teams.id)).all().map((t) => t.id);
  return createFixture(
    env.ctx,
    {
      roundId: round.id,
      homeTeamId: teamIds[teamOffset * 2]!,
      awayTeamId: teamIds[teamOffset * 2 + 1]!,
      kickoffAt: kickoffAt.getTime(),
    },
    env.admin,
  );
}

function predict(env: Env, userId: number, fixtureId: number, h: number, a: number) {
  env.db
    .insert(predictions)
    .values({ userId, fixtureId, homePred: h, awayPred: a, updatedAt: env.clock.now() })
    .run();
}

describe('postpone / cancel / completion', () => {
  let env: Env;

  beforeEach(() => {
    env = createEnv();
  });

  it('voids predictions and moves the lock when the earliest game is postponed pre-lock', () => {
    const f1 = addFixture(env, 1, new Date(T0.getTime() + 1 * DAY), 0);
    const f2 = addFixture(env, 1, new Date(T0.getTime() + 2 * DAY), 1);
    predict(env, env.dror, f1.id, 2, 1);

    postponeFixture(env.ctx, f1.id, env.admin);

    expect(env.db.select().from(predictions).all()).toHaveLength(0);
    const round1 = env.db.select().from(rounds).all().find((r) => r.number === 1)!;
    expect(round1.lockAt?.getTime()).toBe(f2.kickoffAt.getTime());
    const voidedAudit = env.db
      .select()
      .from(auditLog)
      .all()
      .find((a) => a.action === 'fixture.postponed_predictions_voided');
    expect(voidedAudit?.beforeJson).toContain('"homePred":2');
  });

  it('closes the round without the postponed game and banks the other points', () => {
    const f1 = addFixture(env, 1, new Date(T0.getTime() + 1 * DAY), 0);
    const f2 = addFixture(env, 1, new Date(T0.getTime() + 1 * DAY + 2 * HOUR), 1);
    predict(env, env.dror, f1.id, 1, 0);
    predict(env, env.dror, f2.id, 3, 0);

    enterFinalResult(env.ctx, f1.id, { homeScore: 1, awayScore: 0 }, env.admin);
    expect(env.db.select().from(rounds).all().find((r) => r.number === 1)!.status).toBe('open');

    postponeFixture(env.ctx, f2.id, env.admin);

    const round1 = env.db.select().from(rounds).all().find((r) => r.number === 1)!;
    expect(round1.status).toBe('closed');
    const stat = env.db
      .select()
      .from(roundUserStats)
      .all()
      .find((s) => s.roundId === round1.id && s.userId === env.dror)!;
    expect(stat.points).toBe(3); // exact on f1; postponed f2 contributes nothing
    expect(env.db.select().from(rounds).all().find((r) => r.number === 2)!.status).toBe('open');
  });

  it('reschedules a postponed game as a completion game with a 7-day window', () => {
    const f1 = addFixture(env, 1, new Date(T0.getTime() + 1 * DAY), 0);
    addFixture(env, 1, new Date(T0.getTime() + 1 * DAY + 2 * HOUR), 1);
    postponeFixture(env.ctx, f1.id, env.admin);

    const newKickoff = T0.getTime() + 30 * DAY;
    rescheduleFixture(env.ctx, f1.id, newKickoff, env.admin);

    const fixture = env.db.select().from(fixtures).where(eq(fixtures.id, f1.id)).get()!;
    const round1 = env.db.select().from(rounds).all().find((r) => r.number === 1)!;
    expect(fixture).toMatchObject({ status: 'scheduled', isCompletion: true });
    expect(fixture.predictionOpenAt?.getTime()).toBe(newKickoff - 7 * DAY);

    // Not yet predictable (window opens in 23 days)
    expect(isFixturePredictable(fixture, round1, env.clock.now())).toBe(false);
    env.clock.set(new Date(newKickoff - 6 * DAY));
    expect(isFixturePredictable(fixture, round1, env.clock.now())).toBe(true);
    env.clock.set(new Date(newKickoff + 1));
    expect(isFixturePredictable(fixture, round1, env.clock.now())).toBe(false);

    // The completion game never blocks/locks its round
    expect(round1.lockAt?.getTime()).toBe(T0.getTime() + 1 * DAY + 2 * HOUR);
  });

  it('adds completion-game points to season totals without touching the frozen snapshot', () => {
    const f1 = addFixture(env, 1, new Date(T0.getTime() + 1 * DAY), 0);
    const f2 = addFixture(env, 1, new Date(T0.getTime() + 1 * DAY + 2 * HOUR), 1);
    predict(env, env.dror, f1.id, 1, 0);
    predict(env, env.avi, f1.id, 0, 2);

    postponeFixture(env.ctx, f2.id, env.admin);
    enterFinalResult(env.ctx, f1.id, { homeScore: 1, awayScore: 0 }, env.admin); // closes round 1

    const round1 = env.db.select().from(rounds).all().find((r) => r.number === 1)!;
    expect(round1.status).toBe('closed');
    const frozenBefore = env.db
      .select()
      .from(roundUserStats)
      .all()
      .find((s) => s.roundId === round1.id && s.userId === env.dror)!;
    expect(frozenBefore.points).toBe(3);

    // Completion game: new predictions, then played weeks later
    const newKickoff = T0.getTime() + 30 * DAY;
    rescheduleFixture(env.ctx, f2.id, newKickoff, env.admin);
    env.clock.set(new Date(newKickoff - 2 * DAY));
    predict(env, env.avi, f2.id, 2, 2);
    env.clock.set(new Date(newKickoff + 2 * HOUR));
    enterFinalResult(env.ctx, f2.id, { homeScore: 2, awayScore: 2 }, env.admin);

    // Season totals include the completion exact hit
    const totals = computeSeasonTotals(env.db, env.seasonId);
    expect(totals.find((t) => t.userId === env.avi)?.points).toBe(3);
    // Frozen round summary unchanged (closes without it — league rule)
    const frozenAfter = env.db
      .select()
      .from(roundUserStats)
      .all()
      .find((s) => s.roundId === round1.id && s.userId === env.avi)!;
    expect(frozenAfter.points).toBe(0);
    // Score row tagged as completion, attached to the original round
    const score = env.db
      .select()
      .from(predictionScores)
      .all()
      .find((s) => s.fixtureId === f2.id && s.userId === env.avi)!;
    expect(score).toMatchObject({ isCompletion: true, roundId: round1.id, points: 3 });
  });

  it('cancels a game: predictions voided, no points ever, round closes without it', () => {
    const f1 = addFixture(env, 1, new Date(T0.getTime() + 1 * DAY), 0);
    const f2 = addFixture(env, 1, new Date(T0.getTime() + 1 * DAY + 2 * HOUR), 1);
    predict(env, env.dror, f2.id, 1, 0);

    enterFinalResult(env.ctx, f1.id, { homeScore: 0, awayScore: 1 }, env.admin);
    cancelFixture(env.ctx, f2.id, env.admin);

    const round1 = env.db.select().from(rounds).all().find((r) => r.number === 1)!;
    expect(round1.status).toBe('closed');
    expect(env.db.select().from(predictionScores).all().filter((s) => s.fixtureId === f2.id)).toHaveLength(0);
    expect(() => enterFinalResult(env.ctx, f2.id, { homeScore: 1, awayScore: 0 }, env.admin)).toThrowError();
  });

  it('lets the admin fix a prediction after lock, with audit and score healing', () => {
    const f1 = addFixture(env, 1, new Date(T0.getTime() + 1 * DAY), 0);
    predict(env, env.dror, f1.id, 0, 2);
    enterFinalResult(env.ctx, f1.id, { homeScore: 2, awayScore: 0 }, env.admin); // round closes, dror 0 pts

    adminFixPrediction(
      env.ctx,
      { userId: env.dror, fixtureId: f1.id, homePred: 2, awayPred: 0 },
      { id: null, name: 'admin' },
    );

    const score = env.db
      .select()
      .from(predictionScores)
      .all()
      .find((s) => s.userId === env.dror && s.fixtureId === f1.id)!;
    expect(score.points).toBe(3);
    const round1 = env.db.select().from(rounds).all().find((r) => r.number === 1)!;
    const stat = env.db
      .select()
      .from(roundUserStats)
      .all()
      .find((s) => s.roundId === round1.id && s.userId === env.dror)!;
    expect(stat.points).toBe(3);
    expect(
      env.db.select().from(auditLog).all().some((a) => a.action === 'prediction.admin_fixed'),
    ).toBe(true);
  });

  it('never moves a lock that already fired — post-lock postpone keeps the round locked and revealed', () => {
    const f1 = addFixture(env, 1, new Date(T0.getTime() + 1 * DAY), 0);
    const f2 = addFixture(env, 1, new Date(T0.getTime() + 2 * DAY), 1);
    predict(env, env.dror, f1.id, 1, 0);
    predict(env, env.dror, f2.id, 2, 0);

    // The round locked at f1's kickoff; everyone's predictions were revealed.
    env.clock.set(new Date(T0.getTime() + 1 * DAY + 40 * 60 * 1000));
    // f1 is abandoned mid-game and postponed.
    postponeFixture(env.ctx, f1.id, env.admin);

    const round1 = env.db.select().from(rounds).all().find((r) => r.number === 1)!;
    // Lock must NOT jump to f2's kickoff — it already fired.
    expect(round1.lockAt?.getTime()).toBe(T0.getTime() + 1 * DAY);
    const fixture2 = env.db.select().from(fixtures).where(eq(fixtures.id, f2.id)).get()!;
    expect(isFixturePredictable(fixture2, round1, env.clock.now())).toBe(false);
    expect(arePredictionsVisible(fixture2, round1, env.clock.now())).toBe(true);
  });

  it('excludes completion points from snapshots closed before the game was played, including after healing', () => {
    const fA = addFixture(env, 1, new Date(T0.getTime() + 1 * DAY), 0);
    const fB = addFixture(env, 1, new Date(T0.getTime() + 1 * DAY + 2 * HOUR), 1);
    predict(env, env.dror, fA.id, 1, 0);
    predict(env, env.avi, fA.id, 0, 2);

    postponeFixture(env.ctx, fB.id, env.admin);
    env.clock.set(new Date(T0.getTime() + 1 * DAY + 4 * HOUR));
    enterFinalResult(env.ctx, fA.id, { homeScore: 1, awayScore: 0 }, env.admin); // r1 closes: dror 3, avi 0

    // Completion game played weeks later — avi hits an exact
    const newKickoff = T0.getTime() + 30 * DAY;
    rescheduleFixture(env.ctx, fB.id, newKickoff, env.admin);
    env.clock.set(new Date(newKickoff - 2 * DAY));
    predict(env, env.avi, fB.id, 2, 2);
    env.clock.set(new Date(newKickoff + 2 * HOUR));
    enterFinalResult(env.ctx, fB.id, { homeScore: 2, awayScore: 2 }, env.admin);

    // Round 2 closes AFTER the completion game — its snapshot includes it
    const fC = addFixture(env, 2, new Date(newKickoff + 1 * DAY), 2);
    predict(env, env.dror, fC.id, 1, 0);
    env.clock.set(new Date(newKickoff + 1 * DAY + 3 * HOUR));
    enterFinalResult(env.ctx, fC.id, { homeScore: 1, awayScore: 0 }, env.admin);

    const round1 = env.db.select().from(rounds).all().find((r) => r.number === 1)!;
    const round2 = env.db.select().from(rounds).all().find((r) => r.number === 2)!;
    const stat = (roundId: number, userId: number) =>
      env.db.select().from(roundUserStats).all().find((s) => s.roundId === roundId && s.userId === userId)!;

    expect(stat(round1.id, env.avi).seasonTotalAfter).toBe(0); // frozen — no completion points
    expect(stat(round2.id, env.avi).seasonTotalAfter).toBe(3); // closed after — includes them

    // Healing (identical correction of fA) must not fold completion points into round 1
    enterFinalResult(env.ctx, fA.id, { homeScore: 1, awayScore: 0 }, env.admin);
    expect(stat(round1.id, env.avi).seasonTotalAfter).toBe(0);
    expect(stat(round1.id, env.avi).rankAfter).toBe(2);
    expect(stat(round2.id, env.avi).seasonTotalAfter).toBe(3);
    // Live season totals always include completion points
    expect(computeSeasonTotals(env.db, env.seasonId).find((t) => t.userId === env.avi)?.points).toBe(3);
  });

  it('closes the round when the last unfinished game is deleted', () => {
    const f1 = addFixture(env, 1, new Date(T0.getTime() + 1 * DAY), 0);
    const f2 = addFixture(env, 1, new Date(T0.getTime() + 1 * DAY + 2 * HOUR), 1);
    enterFinalResult(env.ctx, f1.id, { homeScore: 1, awayScore: 0 }, env.admin);
    expect(env.db.select().from(rounds).all().find((r) => r.number === 1)!.status).toBe('open');

    deleteFixture(env.ctx, f2.id, env.admin);
    expect(env.db.select().from(rounds).all().find((r) => r.number === 1)!.status).toBe('closed');
    expect(env.db.select().from(rounds).all().find((r) => r.number === 2)!.status).toBe('open');
  });

  it('hard-deletes a user and heals closed-round ranks', () => {
    const f1 = addFixture(env, 1, new Date(T0.getTime() + 1 * DAY), 0);
    predict(env, env.dror, f1.id, 0, 2); // 0 pts (result 2:0)
    predict(env, env.avi, f1.id, 2, 0); // 3 pts
    enterFinalResult(env.ctx, f1.id, { homeScore: 2, awayScore: 0 }, env.admin);

    adminDeleteUser(env.ctx, env.avi, { id: null, name: 'admin' });

    expect(env.db.select().from(users).all().map((u) => u.username)).toEqual(['dror']);
    expect(env.db.select().from(predictions).all().every((p) => p.userId !== env.avi)).toBe(true);
    expect(env.db.select().from(predictionScores).all().every((s) => s.userId !== env.avi)).toBe(true);
    const round1 = env.db.select().from(rounds).all().find((r) => r.number === 1)!;
    const stats = env.db.select().from(roundUserStats).all().filter((s) => s.roundId === round1.id);
    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({ userId: env.dror, rankInRound: 1, rankAfter: 1 });
  });
});
