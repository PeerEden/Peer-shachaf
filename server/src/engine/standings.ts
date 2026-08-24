import { and, eq, lte, or } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { fixtures, predictionScores, rounds, users } from '../db/schema.js';

export interface UserTotals {
  userId: number;
  points: number;
  exactCount: number;
  outcomeCount: number;
  scoredCount: number;
}

export interface RankedTotals extends UserTotals {
  rank: number;
}

/**
 * Standard competition ranking with shared ranks and no tiebreakers
 * (per league rules: equal points = shared place). Input must be sorted
 * by the caller; this assigns 1,1,3-style ranks by the score function.
 */
export function assignSharedRanks<T>(sortedDesc: T[], score: (item: T) => number): number[] {
  const ranks: number[] = [];
  for (let i = 0; i < sortedDesc.length; i++) {
    if (i > 0 && score(sortedDesc[i]!) === score(sortedDesc[i - 1]!)) {
      ranks.push(ranks[i - 1]!);
    } else {
      ranks.push(i + 1);
    }
  }
  return ranks;
}

async function totalsFromRows(
  db: Db,
  rows: Array<{ userId: number; points: number; isExact: boolean; isOutcome: boolean }>,
): Promise<UserTotals[]> {
  const byUser = new Map<number, UserTotals>();
  for (const user of await db.select().from(users)) {
    byUser.set(user.id, { userId: user.id, points: 0, exactCount: 0, outcomeCount: 0, scoredCount: 0 });
  }
  for (const row of rows) {
    let entry = byUser.get(row.userId);
    if (!entry) {
      entry = { userId: row.userId, points: 0, exactCount: 0, outcomeCount: 0, scoredCount: 0 };
      byUser.set(row.userId, entry);
    }
    entry.points += row.points;
    entry.scoredCount += 1;
    if (row.isExact) entry.exactCount += 1;
    if (row.isOutcome && !row.isExact) entry.outcomeCount += 1;
  }
  return [...byUser.values()];
}

/** Season totals over every score currently in the DB (completion games included). */
export async function computeSeasonTotals(db: Db, seasonId: number): Promise<RankedTotals[]> {
  const rows = await db
    .select({
      userId: predictionScores.userId,
      points: predictionScores.points,
      isExact: predictionScores.isExact,
      isOutcome: predictionScores.isOutcome,
    })
    .from(predictionScores)
    .where(eq(predictionScores.seasonId, seasonId));
  return rankTotals(await totalsFromRows(db, rows));
}

/**
 * Season totals for a closed-round snapshot: regular scores count when their
 * round number is ≤ maxRoundNumber; completion-game scores are attributed to
 * their original round, so they additionally count only if the game was
 * finalized before this snapshot's close moment (completionCutoff). This
 * keeps snapshot healing (after admin corrections) from retroactively
 * injecting completion points into rounds that closed before the game was
 * even played — the league rule says those points join season totals only.
 */
export async function computeSeasonTotalsUpToRound(
  db: Db,
  seasonId: number,
  maxRoundNumber: number,
  completionCutoff: Date,
): Promise<RankedTotals[]> {
  const rows = await db
    .select({
      userId: predictionScores.userId,
      points: predictionScores.points,
      isExact: predictionScores.isExact,
      isOutcome: predictionScores.isOutcome,
    })
    .from(predictionScores)
    .innerJoin(rounds, eq(predictionScores.roundId, rounds.id))
    .innerJoin(fixtures, eq(predictionScores.fixtureId, fixtures.id))
    .where(
      and(
        eq(predictionScores.seasonId, seasonId),
        lte(rounds.number, maxRoundNumber),
        or(
          eq(predictionScores.isCompletion, false),
          lte(fixtures.finalizedAt, completionCutoff),
        ),
      ),
    );
  return rankTotals(await totalsFromRows(db, rows));
}

function rankTotals(totals: UserTotals[]): RankedTotals[] {
  const sorted = [...totals].sort((a, b) => b.points - a.points || a.userId - b.userId);
  const ranks = assignSharedRanks(sorted, (t) => t.points);
  return sorted.map((t, i) => ({ ...t, rank: ranks[i]! }));
}

/** Per-user stats for one round, excluding completion-game scores (frozen summary rule). */
export async function computeRoundTotals(db: Db, roundId: number): Promise<UserTotals[]> {
  const rows = await db
    .select({
      userId: predictionScores.userId,
      points: predictionScores.points,
      isExact: predictionScores.isExact,
      isOutcome: predictionScores.isOutcome,
    })
    .from(predictionScores)
    .where(and(eq(predictionScores.roundId, roundId), eq(predictionScores.isCompletion, false)));
  return await totalsFromRows(db, rows);
}
