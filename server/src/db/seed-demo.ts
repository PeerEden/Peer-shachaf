/**
 * Demo data for local testing: three users (one admin), a finished round 1
 * with real scoring, and a locked round 2 with one game currently live —
 * so every screen has content immediately. Never run in production.
 */
import bcrypt from 'bcryptjs';
import { asc, eq } from 'drizzle-orm';
import { createFixture } from '../engine/fixture-admin.js';
import { enterFinalResult, updateLiveScore } from '../engine/scoring-engine.js';
import type { EngineCtx } from '../engine/types.js';
import { SYSTEM_ACTOR } from '../lib/audit.js';
import { SystemClock } from '../lib/clock.js';
import type { Db } from './index.js';
import { predictions, rounds, teams, users } from './schema.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export function seedDemo(db: Db): void {
  if (db.select().from(users).where(eq(users.username, 'dror')).get()) {
    console.log('ℹ️ Demo data already present — skipping.');
    return;
  }

  const clock = new SystemClock();
  const ctx: EngineCtx = { db, clock };
  const now = clock.now().getTime();

  const demoUsers = [
    { username: 'dror', displayName: 'דרור', phone: '0521000001', role: 'ADMIN' as const },
    { username: 'avi', displayName: 'אבי', phone: '0521000002', role: 'USER' as const },
    { username: 'yossi', displayName: 'יוסי', phone: '0521000003', role: 'USER' as const },
  ];
  const passwordHash = bcrypt.hashSync('demo123', 11);
  const [dror, avi, yossi] = demoUsers.map(
    (u) => db.insert(users).values({ ...u, passwordHash }).returning().get().id,
  ) as [number, number, number];

  const teamIds = db.select().from(teams).orderBy(asc(teams.id)).all().map((t) => t.id);
  const allRounds = db.select().from(rounds).orderBy(asc(rounds.number)).all();
  const round1 = allRounds.find((r) => r.number === 1)!;
  const round2 = allRounds.find((r) => r.number === 2)!;

  const predict = (userId: number, fixtureId: number, h: number, a: number) =>
    db.insert(predictions).values({ userId, fixtureId, homePred: h, awayPred: a, updatedAt: clock.now() }).run();

  // --- Round 1: played three days ago, fully finished ---
  const r1games = [0, 1, 2].map((i) =>
    createFixture(
      ctx,
      {
        roundId: round1.id,
        homeTeamId: teamIds[i * 2]!,
        awayTeamId: teamIds[i * 2 + 1]!,
        kickoffAt: now - 3 * DAY + i * 2 * HOUR,
      },
      SYSTEM_ACTOR,
    ),
  ) as [ReturnType<typeof createFixture>, ReturnType<typeof createFixture>, ReturnType<typeof createFixture>];

  predict(dror, r1games[0].id, 2, 1); // exact → 3
  predict(avi, r1games[0].id, 1, 0); // outcome → 1
  predict(yossi, r1games[0].id, 1, 1); // miss → 0
  predict(dror, r1games[1].id, 1, 1); // draw family → 1
  predict(avi, r1games[1].id, 0, 0); // exact → 3
  predict(yossi, r1games[1].id, 2, 0); // miss → 0
  predict(dror, r1games[2].id, 0, 2); // outcome → 1
  predict(avi, r1games[2].id, 1, 3); // exact → 3
  // yossi forgot the third game → 0

  enterFinalResult(ctx, r1games[0].id, { homeScore: 2, awayScore: 1 }, SYSTEM_ACTOR);
  enterFinalResult(ctx, r1games[1].id, { homeScore: 0, awayScore: 0 }, SYSTEM_ACTOR);
  enterFinalResult(ctx, r1games[2].id, { homeScore: 1, awayScore: 3 }, SYSTEM_ACTOR);
  // Round 1 closes itself and opens round 2.

  // --- Round 2: locked; one game live now, two later today/tomorrow ---
  const r2games = [
    createFixture(
      ctx,
      { roundId: round2.id, homeTeamId: teamIds[6]!, awayTeamId: teamIds[1]!, kickoffAt: now - 45 * 60 * 1000 },
      SYSTEM_ACTOR,
    ),
    createFixture(
      ctx,
      { roundId: round2.id, homeTeamId: teamIds[2]!, awayTeamId: teamIds[5]!, kickoffAt: now + 3 * HOUR },
      SYSTEM_ACTOR,
    ),
    createFixture(
      ctx,
      { roundId: round2.id, homeTeamId: teamIds[8]!, awayTeamId: teamIds[3]!, kickoffAt: now + 1 * DAY },
      SYSTEM_ACTOR,
    ),
  ] as [ReturnType<typeof createFixture>, ReturnType<typeof createFixture>, ReturnType<typeof createFixture>];

  predict(dror, r2games[0].id, 1, 0);
  predict(avi, r2games[0].id, 2, 2);
  predict(yossi, r2games[0].id, 0, 1);
  predict(dror, r2games[1].id, 2, 0);
  predict(avi, r2games[1].id, 1, 1);
  predict(yossi, r2games[1].id, 3, 1);
  predict(dror, r2games[2].id, 1, 1);
  predict(avi, r2games[2].id, 0, 2);
  predict(yossi, r2games[2].id, 2, 1);

  updateLiveScore(ctx, r2games[0].id, { homeScore: 1, awayScore: 0, liveMinute: "43'" }, SYSTEM_ACTOR);

  console.log('🎭 Demo data created:');
  console.log('   dror / demo123  (ADMIN)');
  console.log('   avi  / demo123');
  console.log('   yossi/ demo123');
  console.log('   Round 1 finished & scored, round 2 locked with a live game.');
}
