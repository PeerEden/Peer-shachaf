import bcrypt from 'bcryptjs';
import { asc, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { type Db } from '../db/index.js';
import {
  fixtures,
  predictions,
  predictionScores,
  rounds,
  roundTitles,
  roundUserStats,
  seasonHonors,
  seasons,
  teams,
  users,
} from '../db/schema.js';
import { seedBase } from '../db/seed.js';
import { FixedClock } from '../lib/clock.js';
import { SYSTEM_ACTOR } from '../lib/audit.js';
import { createTestDb } from '../test/helpers.js';
import { createFixture } from './fixture-admin.js';
import { maybeCloseRound } from './round-lifecycle.js';
import { enterFinalResult, updateLiveScore } from './scoring-engine.js';
import { archiveSeason, startSeason } from './season.js';
import { computeSeasonTotals } from './standings.js';
import { computeCurrentTitles, computeStreaks } from './titles.js';
import type { EngineCtx } from './types.js';

const T0 = new Date('2026-08-20T10:00:00Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

interface Env {
  ctx: EngineCtx;
  db: Db;
  clock: FixedClock;
  seasonId: number;
  userIds: number[]; // [dror, avi, yossi]
  teamIds: number[];
}

async function createEnv(): Promise<Env> {
  const db = await createTestDb();
  const { seasonId } = await seedBase(db, { inviteCode: 'TEST1234' });
  const clock = new FixedClock(T0);
  const ctx: EngineCtx = { db, clock };

  const userIds: number[] = [];
  for (const [i, username] of ['dror', 'avi', 'yossi'].entries()) {
    const [user] = await db
      .insert(users)
      .values({
        username,
        passwordHash: bcrypt.hashSync('secret123', 4),
        displayName: username,
        phone: `05210000${i}1`,
      })
      .returning();
    userIds.push(user!.id);
  }
  const teamIds = (await db.select().from(teams).orderBy(asc(teams.id))).map((t) => t.id);
  return { ctx, db, clock, seasonId, userIds, teamIds };
}

async function roundByNumber(env: Env, number: number) {
  return (await env.db.select().from(rounds)).find((r) => r.number === number)!;
}

async function addFixture(env: Env, roundNumber: number, kickoffAt: Date, teamOffset = 0) {
  const round = await roundByNumber(env, roundNumber);
  return createFixture(
    env.ctx,
    {
      roundId: round.id,
      homeTeamId: env.teamIds[teamOffset * 2]!,
      awayTeamId: env.teamIds[teamOffset * 2 + 1]!,
      kickoffAt: kickoffAt.getTime(),
    },
    SYSTEM_ACTOR,
  );
}

async function predict(env: Env, userId: number, fixtureId: number, home: number, away: number) {
  await env.db
    .insert(predictions)
    .values({ userId, fixtureId, homePred: home, awayPred: away, updatedAt: env.clock.now() });
}

async function statsFor(env: Env, roundId: number, userId: number) {
  return (await env.db.select().from(roundUserStats)).find(
    (s) => s.roundId === roundId && s.userId === userId,
  )!;
}

async function titlesFor(env: Env, roundId: number, userId: number): Promise<string[]> {
  return (await env.db.select().from(roundTitles))
    .filter((t) => t.roundId === roundId && t.userId === userId)
    .map((t) => t.titleCode)
    .sort();
}

describe('engine', () => {
  let env: Env;

  beforeEach(async () => {
    env = await createEnv();
  });

  it('computes round lock from earliest kickoff', async () => {
    await addFixture(env, 1, new Date(T0.getTime() + 2 * DAY), 0);
    await addFixture(env, 1, new Date(T0.getTime() + 1 * DAY), 1);
    const round = await roundByNumber(env, 1);
    expect(round.lockAt?.getTime()).toBe(T0.getTime() + 1 * DAY);
  });

  it('scores predictions on final result and treats missing predictions as 0', async () => {
    const [dror, avi, yossi] = env.userIds as [number, number, number];
    const f1 = await addFixture(env, 1, new Date(T0.getTime() + 1 * DAY), 0);
    const f2 = await addFixture(env, 1, new Date(T0.getTime() + 1 * DAY + 2 * HOUR), 1);

    await predict(env, dror, f1.id, 2, 1); // exact → 3
    await predict(env, avi, f1.id, 1, 0); // outcome → 1
    await predict(env, yossi, f1.id, 1, 1); // wrong → 0
    await predict(env, dror, f2.id, 0, 0); // draw vs draw → 1
    await predict(env, avi, f2.id, 2, 2); // exact → 3
    // yossi skips f2 → 0 by absence

    env.clock.set(new Date(T0.getTime() + 2 * DAY));
    await enterFinalResult(env.ctx, f1.id, { homeScore: 2, awayScore: 1 }, SYSTEM_ACTOR);
    await enterFinalResult(env.ctx, f2.id, { homeScore: 2, awayScore: 2 }, SYSTEM_ACTOR);

    const scores = await env.db.select().from(predictionScores);
    const points = (u: number, f: number) =>
      scores.find((s) => s.userId === u && s.fixtureId === f)?.points;
    expect(points(dror, f1.id)).toBe(3);
    expect(points(avi, f1.id)).toBe(1);
    expect(points(yossi, f1.id)).toBe(0);
    expect(points(dror, f2.id)).toBe(1);
    expect(points(avi, f2.id)).toBe(3);
    expect(scores.find((s) => s.userId === yossi && s.fixtureId === f2.id)).toBeUndefined();

    // Round closed with correct stats: dror 4, avi 4, yossi 0 → shared rank 1,1,3
    const round1 = await roundByNumber(env, 1);
    expect(round1.status).toBe('closed');
    expect(await statsFor(env, round1.id, dror)).toMatchObject({
      points: 4,
      exactCount: 1,
      outcomeCount: 1,
      rankInRound: 1,
      isRoundWinner: true,
      seasonTotalAfter: 4,
      rankAfter: 1,
      rankBefore: null,
      movement: null,
    });
    expect(await statsFor(env, round1.id, avi)).toMatchObject({ rankInRound: 1, isRoundWinner: true });
    expect(await statsFor(env, round1.id, yossi)).toMatchObject({
      points: 0,
      rankInRound: 3,
      isRoundWinner: false,
    });

    // Multiple round winners + prophet titles; yossi gets the black round
    expect(await titlesFor(env, round1.id, dror)).toEqual(['round_prophet', 'round_winner']);
    expect(await titlesFor(env, round1.id, avi)).toEqual(['round_prophet', 'round_winner']);
    expect(await titlesFor(env, round1.id, yossi)).toEqual(['black_round']);

    // Next round opened automatically
    expect((await roundByNumber(env, 2)).status).toBe('open');
  });

  it('does not close the round while a game is still unfinished', async () => {
    const f1 = await addFixture(env, 1, new Date(T0.getTime() + 1 * DAY), 0);
    await addFixture(env, 1, new Date(T0.getTime() + 1 * DAY + 2 * HOUR), 1);
    await enterFinalResult(env.ctx, f1.id, { homeScore: 1, awayScore: 0 }, SYSTEM_ACTOR);
    expect((await roundByNumber(env, 1)).status).toBe('open');
    expect((await roundByNumber(env, 2)).status).toBe('pending');
  });

  it('closes a round over a cancelled game without awarding points for it', async () => {
    const [dror] = env.userIds as [number];
    const f1 = await addFixture(env, 1, new Date(T0.getTime() + 1 * DAY), 0);
    const f2 = await addFixture(env, 1, new Date(T0.getTime() + 1 * DAY + 2 * HOUR), 1);
    await predict(env, dror, f2.id, 1, 0);

    await env.db.update(fixtures).set({ status: 'cancelled' }).where(eq(fixtures.id, f2.id));
    await enterFinalResult(env.ctx, f1.id, { homeScore: 0, awayScore: 0 }, SYSTEM_ACTOR);

    expect((await roundByNumber(env, 1)).status).toBe('closed');
    expect((await env.db.select().from(predictionScores)).every((s) => s.fixtureId !== f2.id)).toBe(true);
  });

  it('tracks movement across rounds and awards the climber title', async () => {
    const [dror, avi, yossi] = env.userIds as [number, number, number];

    // Round 1: dror 3, avi 1, yossi 0 → ranks 1,2,3
    const f1 = await addFixture(env, 1, new Date(T0.getTime() + 1 * DAY), 0);
    await predict(env, dror, f1.id, 2, 0);
    await predict(env, avi, f1.id, 1, 0);
    await predict(env, yossi, f1.id, 0, 2);
    await enterFinalResult(env.ctx, f1.id, { homeScore: 2, awayScore: 0 }, SYSTEM_ACTOR);

    // Round 2: yossi 3, others 0 → totals dror 3, yossi 3, avi 1 → ranks 1,1,3
    const f2 = await addFixture(env, 2, new Date(T0.getTime() + 8 * DAY), 1);
    await predict(env, dror, f2.id, 1, 0);
    await predict(env, avi, f2.id, 2, 0);
    await predict(env, yossi, f2.id, 0, 1);
    await enterFinalResult(env.ctx, f2.id, { homeScore: 0, awayScore: 1 }, SYSTEM_ACTOR);

    const round2 = await roundByNumber(env, 2);
    expect(await statsFor(env, round2.id, yossi)).toMatchObject({
      rankBefore: 3,
      rankAfter: 1,
      movement: 2,
      isRoundWinner: true,
    });
    expect(await statsFor(env, round2.id, avi)).toMatchObject({ rankBefore: 2, rankAfter: 3, movement: -1 });
    expect(await titlesFor(env, round2.id, yossi)).toContain('climber');
  });

  it('heals closed-round snapshots after an admin correction', async () => {
    const [dror, avi] = env.userIds as [number, number];
    const f1 = await addFixture(env, 1, new Date(T0.getTime() + 1 * DAY), 0);
    await predict(env, dror, f1.id, 2, 0);
    await predict(env, avi, f1.id, 1, 1);
    await enterFinalResult(env.ctx, f1.id, { homeScore: 2, awayScore: 0 }, SYSTEM_ACTOR);

    const round1 = await roundByNumber(env, 1);
    expect((await statsFor(env, round1.id, dror)).points).toBe(3);
    expect((await statsFor(env, round1.id, avi)).points).toBe(0);

    // Correction: the game actually ended 1:1 → avi has the exact hit now
    await enterFinalResult(env.ctx, f1.id, { homeScore: 1, awayScore: 1 }, SYSTEM_ACTOR);
    expect(await statsFor(env, round1.id, dror)).toMatchObject({ points: 0, rankAfter: 2 });
    expect(await statsFor(env, round1.id, avi)).toMatchObject({ points: 3, rankAfter: 1, isRoundWinner: true });
  });

  it('updates live scores without persisting any points', async () => {
    const [dror] = env.userIds as [number];
    const f1 = await addFixture(env, 1, new Date(T0.getTime() + 1 * DAY), 0);
    await predict(env, dror, f1.id, 2, 0);

    env.clock.set(new Date(T0.getTime() + 1 * DAY + 20 * 60 * 1000));
    await updateLiveScore(env.ctx, f1.id, { homeScore: 1, awayScore: 0, liveMinute: "20'" }, SYSTEM_ACTOR);

    const fixture = (await env.db.select().from(fixtures).where(eq(fixtures.id, f1.id)))[0]!;
    expect(fixture.status).toBe('live');
    expect(fixture.liveMinute).toBe("20'");
    expect(await env.db.select().from(predictionScores)).toHaveLength(0);
    expect((await roundByNumber(env, 1)).status).toBe('open');
  });

  it('computes streaks and season titles', async () => {
    const [dror, avi] = env.userIds as [number, number];
    // Three fixtures; dror scores in all (streak 3), avi misses the middle one
    const fx = [];
    for (const i of [0, 1, 2]) {
      fx.push(await addFixture(env, 1, new Date(T0.getTime() + 1 * DAY + i * HOUR), i));
    }
    for (const [i, f] of fx.entries()) {
      await predict(env, dror, f.id, 1, 0);
      await predict(env, avi, f.id, i === 1 ? 0 : 2, i === 1 ? 2 : 0);
    }
    for (const f of fx) {
      await enterFinalResult(env.ctx, f.id, { homeScore: 1, awayScore: 0 }, SYSTEM_ACTOR);
    }

    const streaks = await computeStreaks(env.db, env.seasonId);
    expect(streaks.get(dror)).toMatchObject({ current: 3, longest: 3 });
    expect(streaks.get(avi)).toMatchObject({ current: 1, longest: 1 });

    const titles = await computeCurrentTitles(env.db, env.seasonId);
    expect(titles.get(dror)).toContain('leader');
    expect(titles.get(dror)).toContain('hot_streak');
    expect(titles.get(dror)).toContain('exact_king');
    expect(titles.get(avi) ?? []).not.toContain('leader');
  });

  it('archives a season with honors and starts a new one', async () => {
    const [dror, avi] = env.userIds as [number, number];
    const f1 = await addFixture(env, 1, new Date(T0.getTime() + 1 * DAY), 0);
    await predict(env, dror, f1.id, 2, 0);
    await predict(env, avi, f1.id, 1, 0);
    await enterFinalResult(env.ctx, f1.id, { homeScore: 2, awayScore: 0 }, SYSTEM_ACTOR);

    await expect(startSeason(env.ctx, '2027/28', SYSTEM_ACTOR)).rejects.toThrowError();

    await archiveSeason(env.ctx, env.seasonId, SYSTEM_ACTOR);
    const honors = await env.db.select().from(seasonHonors);
    const champion = honors.find((h) => h.titleCode === 'champion');
    expect(champion).toMatchObject({ userId: dror, displayName: 'dror', value: 3 });

    const newSeasonId = await startSeason(env.ctx, '2027/28', SYSTEM_ACTOR);
    const newRounds = (await env.db.select().from(rounds)).filter((r) => r.seasonId === newSeasonId);
    expect(newRounds).toHaveLength(26);
    expect(newRounds.find((r) => r.number === 1)?.status).toBe('open');
    expect((await env.db.select().from(seasons)).find((s) => s.id === env.seasonId)?.status).toBe(
      'archived',
    );
    // Old data still queryable
    expect((await computeSeasonTotals(env.db, env.seasonId)).find((t) => t.userId === dror)?.points).toBe(3);
  });

  it('fires engine events on close/open', async () => {
    const events: string[] = [];
    env.ctx.events = {
      onRoundClosed: (id) => events.push(`closed:${id}`),
      onRoundOpened: (id) => events.push(`opened:${id}`),
      onFixturePostponed: () => events.push('postponed'),
      onCompletionScheduled: () => events.push('completion'),
    };
    const f1 = await addFixture(env, 1, new Date(T0.getTime() + 1 * DAY), 0);
    await enterFinalResult(env.ctx, f1.id, { homeScore: 1, awayScore: 0 }, SYSTEM_ACTOR);
    const round1 = await roundByNumber(env, 1);
    const round2 = await roundByNumber(env, 2);
    expect(events).toEqual([`closed:${round1.id}`, `opened:${round2.id}`]);
  });

  it('closing is idempotent — maybeCloseRound on a closed round is a no-op', async () => {
    const f1 = await addFixture(env, 1, new Date(T0.getTime() + 1 * DAY), 0);
    await enterFinalResult(env.ctx, f1.id, { homeScore: 1, awayScore: 0 }, SYSTEM_ACTOR);
    const round1 = await roundByNumber(env, 1);
    expect(round1.status).toBe('closed');
    expect(await maybeCloseRound(env.ctx, round1.id)).toBe(false);
    expect((await roundByNumber(env, 2)).status).toBe('open');
  });
});
