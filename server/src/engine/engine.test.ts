import bcrypt from 'bcryptjs';
import { asc, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/index.js';
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

function createEnv(): Env {
  const db = createDb(':memory:');
  const { seasonId } = seedBase(db, { inviteCode: 'TEST1234' });
  const clock = new FixedClock(T0);
  const ctx: EngineCtx = { db, clock };

  const userIds = ['dror', 'avi', 'yossi'].map(
    (username, i) =>
      db
        .insert(users)
        .values({
          username,
          passwordHash: bcrypt.hashSync('secret123', 4),
          displayName: username,
          phone: `05210000${i}1`,
        })
        .returning()
        .get().id,
  );
  const teamIds = db.select().from(teams).orderBy(asc(teams.id)).all().map((t) => t.id);
  return { ctx, db, clock, seasonId, userIds, teamIds };
}

function roundByNumber(env: Env, number: number) {
  return env.db
    .select()
    .from(rounds)
    .all()
    .find((r) => r.number === number)!;
}

function addFixture(env: Env, roundNumber: number, kickoffAt: Date, teamOffset = 0) {
  const round = roundByNumber(env, roundNumber);
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

function predict(env: Env, userId: number, fixtureId: number, home: number, away: number) {
  env.db
    .insert(predictions)
    .values({ userId, fixtureId, homePred: home, awayPred: away, updatedAt: env.clock.now() })
    .run();
}

function statsFor(env: Env, roundId: number, userId: number) {
  return env.db
    .select()
    .from(roundUserStats)
    .all()
    .find((s) => s.roundId === roundId && s.userId === userId)!;
}

function titlesFor(env: Env, roundId: number, userId: number): string[] {
  return env.db
    .select()
    .from(roundTitles)
    .all()
    .filter((t) => t.roundId === roundId && t.userId === userId)
    .map((t) => t.titleCode)
    .sort();
}

describe('engine', () => {
  let env: Env;

  beforeEach(() => {
    env = createEnv();
  });

  it('computes round lock from earliest kickoff', () => {
    addFixture(env, 1, new Date(T0.getTime() + 2 * DAY), 0);
    addFixture(env, 1, new Date(T0.getTime() + 1 * DAY), 1);
    const round = roundByNumber(env, 1);
    expect(round.lockAt?.getTime()).toBe(T0.getTime() + 1 * DAY);
  });

  it('scores predictions on final result and treats missing predictions as 0', () => {
    const [dror, avi, yossi] = env.userIds as [number, number, number];
    const f1 = addFixture(env, 1, new Date(T0.getTime() + 1 * DAY), 0);
    const f2 = addFixture(env, 1, new Date(T0.getTime() + 1 * DAY + 2 * HOUR), 1);

    predict(env, dror, f1.id, 2, 1); // exact → 3
    predict(env, avi, f1.id, 1, 0); // outcome → 1
    predict(env, yossi, f1.id, 1, 1); // wrong → 0
    predict(env, dror, f2.id, 0, 0); // draw vs draw → 1
    predict(env, avi, f2.id, 2, 2); // exact → 3
    // yossi skips f2 → 0 by absence

    env.clock.set(new Date(T0.getTime() + 2 * DAY));
    enterFinalResult(env.ctx, f1.id, { homeScore: 2, awayScore: 1 }, SYSTEM_ACTOR);
    enterFinalResult(env.ctx, f2.id, { homeScore: 2, awayScore: 2 }, SYSTEM_ACTOR);

    const scores = env.db.select().from(predictionScores).all();
    const points = (u: number, f: number) =>
      scores.find((s) => s.userId === u && s.fixtureId === f)?.points;
    expect(points(dror, f1.id)).toBe(3);
    expect(points(avi, f1.id)).toBe(1);
    expect(points(yossi, f1.id)).toBe(0);
    expect(points(dror, f2.id)).toBe(1);
    expect(points(avi, f2.id)).toBe(3);
    expect(scores.find((s) => s.userId === yossi && s.fixtureId === f2.id)).toBeUndefined();

    // Round closed with correct stats: dror 4, avi 4, yossi 0 → shared rank 1,1,3
    const round1 = roundByNumber(env, 1);
    expect(round1.status).toBe('closed');
    expect(statsFor(env, round1.id, dror)).toMatchObject({
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
    expect(statsFor(env, round1.id, avi)).toMatchObject({ rankInRound: 1, isRoundWinner: true });
    expect(statsFor(env, round1.id, yossi)).toMatchObject({
      points: 0,
      rankInRound: 3,
      isRoundWinner: false,
    });

    // Multiple round winners + prophet titles; yossi gets the black round
    expect(titlesFor(env, round1.id, dror)).toEqual(['round_prophet', 'round_winner']);
    expect(titlesFor(env, round1.id, avi)).toEqual(['round_prophet', 'round_winner']);
    expect(titlesFor(env, round1.id, yossi)).toEqual(['black_round']);

    // Next round opened automatically
    expect(roundByNumber(env, 2).status).toBe('open');
  });

  it('does not close the round while a game is still unfinished', () => {
    const f1 = addFixture(env, 1, new Date(T0.getTime() + 1 * DAY), 0);
    addFixture(env, 1, new Date(T0.getTime() + 1 * DAY + 2 * HOUR), 1);
    enterFinalResult(env.ctx, f1.id, { homeScore: 1, awayScore: 0 }, SYSTEM_ACTOR);
    expect(roundByNumber(env, 1).status).toBe('open');
    expect(roundByNumber(env, 2).status).toBe('pending');
  });

  it('closes a round over a cancelled game without awarding points for it', () => {
    const [dror] = env.userIds as [number];
    const f1 = addFixture(env, 1, new Date(T0.getTime() + 1 * DAY), 0);
    const f2 = addFixture(env, 1, new Date(T0.getTime() + 1 * DAY + 2 * HOUR), 1);
    predict(env, dror, f2.id, 1, 0);

    env.db.update(fixtures).set({ status: 'cancelled' }).where(eq(fixtures.id, f2.id)).run();
    enterFinalResult(env.ctx, f1.id, { homeScore: 0, awayScore: 0 }, SYSTEM_ACTOR);

    expect(roundByNumber(env, 1).status).toBe('closed');
    expect(env.db.select().from(predictionScores).all().every((s) => s.fixtureId !== f2.id)).toBe(true);
  });

  it('tracks movement across rounds and awards the climber title', () => {
    const [dror, avi, yossi] = env.userIds as [number, number, number];

    // Round 1: dror 3, avi 1, yossi 0 → ranks 1,2,3
    const f1 = addFixture(env, 1, new Date(T0.getTime() + 1 * DAY), 0);
    predict(env, dror, f1.id, 2, 0);
    predict(env, avi, f1.id, 1, 0);
    predict(env, yossi, f1.id, 0, 2);
    enterFinalResult(env.ctx, f1.id, { homeScore: 2, awayScore: 0 }, SYSTEM_ACTOR);

    // Round 2: yossi 3, others 0 → totals dror 3, yossi 3, avi 1 → ranks 1,1,3
    const f2 = addFixture(env, 2, new Date(T0.getTime() + 8 * DAY), 1);
    predict(env, dror, f2.id, 1, 0);
    predict(env, avi, f2.id, 2, 0);
    predict(env, yossi, f2.id, 0, 1);
    enterFinalResult(env.ctx, f2.id, { homeScore: 0, awayScore: 1 }, SYSTEM_ACTOR);

    const round2 = roundByNumber(env, 2);
    expect(statsFor(env, round2.id, yossi)).toMatchObject({
      rankBefore: 3,
      rankAfter: 1,
      movement: 2,
      isRoundWinner: true,
    });
    expect(statsFor(env, round2.id, avi)).toMatchObject({ rankBefore: 2, rankAfter: 3, movement: -1 });
    expect(titlesFor(env, round2.id, yossi)).toContain('climber');
  });

  it('heals closed-round snapshots after an admin correction', () => {
    const [dror, avi] = env.userIds as [number, number];
    const f1 = addFixture(env, 1, new Date(T0.getTime() + 1 * DAY), 0);
    predict(env, dror, f1.id, 2, 0);
    predict(env, avi, f1.id, 1, 1);
    enterFinalResult(env.ctx, f1.id, { homeScore: 2, awayScore: 0 }, SYSTEM_ACTOR);

    const round1 = roundByNumber(env, 1);
    expect(statsFor(env, round1.id, dror).points).toBe(3);
    expect(statsFor(env, round1.id, avi).points).toBe(0);

    // Correction: the game actually ended 1:1 → avi has the exact hit now
    enterFinalResult(env.ctx, f1.id, { homeScore: 1, awayScore: 1 }, SYSTEM_ACTOR);
    expect(statsFor(env, round1.id, dror)).toMatchObject({ points: 0, rankAfter: 2 });
    expect(statsFor(env, round1.id, avi)).toMatchObject({ points: 3, rankAfter: 1, isRoundWinner: true });
  });

  it('updates live scores without persisting any points', () => {
    const [dror] = env.userIds as [number];
    const f1 = addFixture(env, 1, new Date(T0.getTime() + 1 * DAY), 0);
    predict(env, dror, f1.id, 2, 0);

    env.clock.set(new Date(T0.getTime() + 1 * DAY + 20 * 60 * 1000));
    updateLiveScore(env.ctx, f1.id, { homeScore: 1, awayScore: 0, liveMinute: "20'" }, SYSTEM_ACTOR);

    const fixture = env.db.select().from(fixtures).where(eq(fixtures.id, f1.id)).get()!;
    expect(fixture.status).toBe('live');
    expect(fixture.liveMinute).toBe("20'");
    expect(env.db.select().from(predictionScores).all()).toHaveLength(0);
    expect(roundByNumber(env, 1).status).toBe('open');
  });

  it('computes streaks and season titles', () => {
    const [dror, avi] = env.userIds as [number, number];
    // Three fixtures; dror scores in all (streak 3), avi misses the middle one
    const fx = [0, 1, 2].map((i) =>
      addFixture(env, 1, new Date(T0.getTime() + 1 * DAY + i * HOUR), i),
    );
    fx.forEach((f, i) => {
      predict(env, dror, f.id, 1, 0);
      predict(env, avi, f.id, i === 1 ? 0 : 2, i === 1 ? 2 : 0);
    });
    for (const f of fx) {
      enterFinalResult(env.ctx, f.id, { homeScore: 1, awayScore: 0 }, SYSTEM_ACTOR);
    }

    const streaks = computeStreaks(env.db, env.seasonId);
    expect(streaks.get(dror)).toMatchObject({ current: 3, longest: 3 });
    expect(streaks.get(avi)).toMatchObject({ current: 1, longest: 1 });

    const titles = computeCurrentTitles(env.db, env.seasonId);
    expect(titles.get(dror)).toContain('leader');
    expect(titles.get(dror)).toContain('hot_streak');
    expect(titles.get(dror)).toContain('exact_king');
    expect(titles.get(avi) ?? []).not.toContain('leader');
  });

  it('archives a season with honors and starts a new one', () => {
    const [dror, avi] = env.userIds as [number, number];
    const f1 = addFixture(env, 1, new Date(T0.getTime() + 1 * DAY), 0);
    predict(env, dror, f1.id, 2, 0);
    predict(env, avi, f1.id, 1, 0);
    enterFinalResult(env.ctx, f1.id, { homeScore: 2, awayScore: 0 }, SYSTEM_ACTOR);

    expect(() => startSeason(env.ctx, '2027/28', SYSTEM_ACTOR)).toThrowError();

    archiveSeason(env.ctx, env.seasonId, SYSTEM_ACTOR);
    const honors = env.db.select().from(seasonHonors).all();
    const champion = honors.find((h) => h.titleCode === 'champion');
    expect(champion).toMatchObject({ userId: dror, displayName: 'dror', value: 3 });

    const newSeasonId = startSeason(env.ctx, '2027/28', SYSTEM_ACTOR);
    const newRounds = env.db.select().from(rounds).all().filter((r) => r.seasonId === newSeasonId);
    expect(newRounds).toHaveLength(26);
    expect(newRounds.find((r) => r.number === 1)?.status).toBe('open');
    expect(env.db.select().from(seasons).all().find((s) => s.id === env.seasonId)?.status).toBe(
      'archived',
    );
    // Old data still queryable
    expect(computeSeasonTotals(env.db, env.seasonId).find((t) => t.userId === dror)?.points).toBe(3);
  });

  it('fires engine events on close/open', () => {
    const events: string[] = [];
    env.ctx.events = {
      onRoundClosed: (id) => events.push(`closed:${id}`),
      onRoundOpened: (id) => events.push(`opened:${id}`),
      onFixturePostponed: () => events.push('postponed'),
      onCompletionScheduled: () => events.push('completion'),
    };
    const f1 = addFixture(env, 1, new Date(T0.getTime() + 1 * DAY), 0);
    enterFinalResult(env.ctx, f1.id, { homeScore: 1, awayScore: 0 }, SYSTEM_ACTOR);
    const round1 = roundByNumber(env, 1);
    const round2 = roundByNumber(env, 2);
    expect(events).toEqual([`closed:${round1.id}`, `opened:${round2.id}`]);
  });

  it('closing is idempotent — maybeCloseRound on a closed round is a no-op', () => {
    const f1 = addFixture(env, 1, new Date(T0.getTime() + 1 * DAY), 0);
    enterFinalResult(env.ctx, f1.id, { homeScore: 1, awayScore: 0 }, SYSTEM_ACTOR);
    const round1 = roundByNumber(env, 1);
    expect(round1.status).toBe('closed');
    expect(maybeCloseRound(env.ctx, round1.id)).toBe(false);
    expect(roundByNumber(env, 2).status).toBe('open');
  });
});
