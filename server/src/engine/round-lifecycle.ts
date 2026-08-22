import { and, asc, eq, inArray } from 'drizzle-orm';
import { fixtures, rounds, roundTitles, roundUserStats } from '../db/schema.js';
import type { EngineCtx } from './types.js';
import { assignSharedRanks, computeRoundTotals, computeSeasonTotalsUpToRound } from './standings.js';

type RoundRow = typeof rounds.$inferSelect;
type FixtureRow = typeof fixtures.$inferSelect;

/** Statuses in which a fixture no longer waits for anything in its round. */
const TERMINAL_FIXTURE_STATUSES = ['finished', 'cancelled', 'postponed'] as const;

/**
 * lock_at = earliest kickoff among the round's regular (non-completion)
 * fixtures that still count. Must be called inside any flow that creates,
 * reschedules, postpones or deletes a fixture.
 */
export function recomputeRoundLock(ctx: EngineCtx, roundId: number): void {
  const round = ctx.db.select().from(rounds).where(eq(rounds.id, roundId)).get();
  if (!round) return;
  // A lock that already fired is a historical fact: predictions were revealed
  // to everyone at that moment. It must never move (e.g. when the earliest
  // game is postponed mid-round), or the round would reopen for editing after
  // everyone saw each other's picks.
  if (round.lockAt !== null && round.lockAt.getTime() <= ctx.clock.now().getTime()) return;

  const fx = ctx.db.select().from(fixtures).where(eq(fixtures.roundId, roundId)).all();
  const relevant = fx.filter(
    (f) => !f.isCompletion && f.status !== 'postponed' && f.status !== 'cancelled',
  );
  const lockAt = relevant.length
    ? new Date(Math.min(...relevant.map((f) => f.kickoffAt.getTime())))
    : null;
  ctx.db.update(rounds).set({ lockAt }).where(eq(rounds.id, roundId)).run();
}

/** Can this user still enter/change a prediction for this fixture right now? */
export function isFixturePredictable(fixture: FixtureRow, round: RoundRow, now: Date): boolean {
  if (fixture.status !== 'scheduled') return false;
  if (fixture.isCompletion) {
    return (
      fixture.predictionOpenAt !== null &&
      now.getTime() >= fixture.predictionOpenAt.getTime() &&
      now.getTime() < fixture.kickoffAt.getTime()
    );
  }
  return (
    round.status === 'open' && round.lockAt !== null && now.getTime() < round.lockAt.getTime()
  );
}

/**
 * Privacy rule: everyone's predictions for a round become visible when the
 * round locks (first kickoff). A completion game's new predictions stay
 * hidden until its own kickoff.
 */
export function arePredictionsVisible(fixture: FixtureRow, round: RoundRow, now: Date): boolean {
  if (fixture.isCompletion) {
    return now.getTime() >= fixture.kickoffAt.getTime();
  }
  return round.lockAt !== null && now.getTime() >= round.lockAt.getTime();
}

export type RoundDerivedState = 'pending' | 'open' | 'locked' | 'live' | 'finished';

export function deriveRoundState(
  round: RoundRow,
  roundFixtures: FixtureRow[],
  now: Date,
): RoundDerivedState {
  if (round.status === 'pending') return 'pending';
  if (round.status === 'closed') return 'finished';
  if (round.lockAt === null || now.getTime() < round.lockAt.getTime()) return 'open';
  if (roundFixtures.some((f) => f.status === 'live')) return 'live';
  return 'locked';
}

/**
 * Closes the round if every regular fixture reached a terminal state.
 * Completion games never block their (already once-closed or still-open)
 * round. Returns true when the round transitioned to closed.
 */
export function maybeCloseRound(ctx: EngineCtx, roundId: number): boolean {
  const round = ctx.db.select().from(rounds).where(eq(rounds.id, roundId)).get();
  if (!round || round.status !== 'open') return false;

  const fx = ctx.db.select().from(fixtures).where(eq(fixtures.roundId, roundId)).all();
  const relevant = fx.filter((f) => !f.isCompletion);
  if (relevant.length === 0) return false;
  if (!relevant.every((f) => (TERMINAL_FIXTURE_STATUSES as readonly string[]).includes(f.status))) {
    return false;
  }

  ctx.db.transaction(() => {
    writeRoundSnapshot(ctx, round);
    ctx.db
      .update(rounds)
      .set({ status: 'closed', closedAt: ctx.clock.now() })
      .where(eq(rounds.id, round.id))
      .run();
  });
  ctx.events?.onRoundClosed(round.id);

  openNextRound(ctx, round.seasonId);
  return true;
}

/** Opens the lowest-numbered pending round (the spec: next window opens at final whistle). */
export function openNextRound(ctx: EngineCtx, seasonId: number): number | null {
  const next = ctx.db
    .select()
    .from(rounds)
    .where(and(eq(rounds.seasonId, seasonId), eq(rounds.status, 'pending')))
    .orderBy(asc(rounds.number))
    .get();
  if (!next) return null;
  ctx.db
    .update(rounds)
    .set({ status: 'open', openedAt: ctx.clock.now() })
    .where(eq(rounds.id, next.id))
    .run();
  ctx.events?.onRoundOpened(next.id);
  return next.id;
}

/**
 * Computes and stores the frozen round summary + standings snapshot
 * (round_user_stats) and the persisted round titles. Idempotent: deletes and
 * rewrites, so admin corrections can heal snapshots via recomputeClosedRounds.
 */
export function writeRoundSnapshot(ctx: EngineCtx, round: RoundRow): void {
  const { db } = ctx;
  const roundTotals = computeRoundTotals(db, round.id);
  // Completion games count toward a snapshot only if they were finalized
  // before this round's close moment (at first close: now).
  const completionCutoff = round.closedAt ?? ctx.clock.now();
  const seasonRanked = computeSeasonTotalsUpToRound(db, round.seasonId, round.number, completionCutoff);
  const seasonByUser = new Map(seasonRanked.map((t) => [t.userId, t]));

  const prevRound = db
    .select()
    .from(rounds)
    .where(and(eq(rounds.seasonId, round.seasonId), eq(rounds.status, 'closed')))
    .all()
    .filter((r) => r.number < round.number)
    .sort((a, b) => b.number - a.number)[0];
  const prevRanks = new Map<number, number>();
  if (prevRound) {
    for (const row of db
      .select()
      .from(roundUserStats)
      .where(eq(roundUserStats.roundId, prevRound.id))
      .all()) {
      prevRanks.set(row.userId, row.rankAfter);
    }
  }

  const sortedRound = [...roundTotals].sort((a, b) => b.points - a.points || a.userId - b.userId);
  const roundRanks = assignSharedRanks(sortedRound, (t) => t.points);
  const maxRoundPoints = sortedRound[0]?.points ?? 0;
  const minRoundPoints = sortedRound[sortedRound.length - 1]?.points ?? 0;
  const maxExactInRound = Math.max(0, ...sortedRound.map((t) => t.exactCount));

  db.delete(roundUserStats).where(eq(roundUserStats.roundId, round.id)).run();
  db.delete(roundTitles).where(eq(roundTitles.roundId, round.id)).run();

  const now = ctx.clock.now();
  const climbers: Array<{ userId: number; movement: number }> = [];

  sortedRound.forEach((entry, i) => {
    const season = seasonByUser.get(entry.userId);
    const rankAfter = season?.rank ?? sortedRound.length;
    const rankBefore = prevRanks.get(entry.userId) ?? null;
    const movement = rankBefore === null ? null : rankBefore - rankAfter;
    if (movement !== null && movement > 0) climbers.push({ userId: entry.userId, movement });

    db.insert(roundUserStats)
      .values({
        roundId: round.id,
        userId: entry.userId,
        points: entry.points,
        exactCount: entry.exactCount,
        outcomeCount: entry.outcomeCount,
        rankInRound: roundRanks[i]!,
        isRoundWinner: maxRoundPoints > 0 && entry.points === maxRoundPoints,
        seasonTotalAfter: season?.points ?? 0,
        rankAfter,
        rankBefore,
        movement,
      })
      .run();
  });

  const awardTitle = (userId: number, titleCode: string) => {
    db.insert(roundTitles)
      .values({ seasonId: round.seasonId, roundId: round.id, userId, titleCode, awardedAt: now })
      .run();
  };

  for (const entry of sortedRound) {
    if (maxRoundPoints > 0 && entry.points === maxRoundPoints) awardTitle(entry.userId, 'round_winner');
    if (maxExactInRound > 0 && entry.exactCount === maxExactInRound) awardTitle(entry.userId, 'round_prophet');
    if (minRoundPoints < maxRoundPoints && entry.points === minRoundPoints) awardTitle(entry.userId, 'black_round');
  }
  if (climbers.length > 0) {
    const best = Math.max(...climbers.map((c) => c.movement));
    for (const c of climbers) {
      if (c.movement === best) awardTitle(c.userId, 'climber');
    }
  }
}

/**
 * Heals every closed round's snapshot in order — called after an admin
 * corrects a result belonging to an already-closed round.
 */
export function recomputeClosedRounds(ctx: EngineCtx, seasonId: number): void {
  const closed = ctx.db
    .select()
    .from(rounds)
    .where(and(eq(rounds.seasonId, seasonId), eq(rounds.status, 'closed')))
    .orderBy(asc(rounds.number))
    .all();
  ctx.db.transaction(() => {
    for (const round of closed) writeRoundSnapshot(ctx, round);
  });
}

export function getRoundFixtures(ctx: EngineCtx, roundId: number): FixtureRow[] {
  return ctx.db
    .select()
    .from(fixtures)
    .where(eq(fixtures.roundId, roundId))
    .orderBy(asc(fixtures.kickoffAt), asc(fixtures.id))
    .all();
}

export function getRoundsByIds(ctx: EngineCtx, ids: number[]): Map<number, RoundRow> {
  if (ids.length === 0) return new Map();
  const rows = ctx.db.select().from(rounds).where(inArray(rounds.id, ids)).all();
  return new Map(rows.map((r) => [r.id, r]));
}
