import type { TitleCode } from '../../../shared/src/index.js';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { fixtures, predictionScores, rounds, roundTitles } from '../db/schema.js';
import { computeSeasonTotals } from './standings.js';

export interface StreakInfo {
  current: number;
  longest: number;
}

/** Streaks of consecutive scored games with ≥1 point, ordered by kickoff. */
export function computeStreaks(db: Db, seasonId: number): Map<number, StreakInfo> {
  const rows = db
    .select({
      userId: predictionScores.userId,
      points: predictionScores.points,
      kickoffAt: fixtures.kickoffAt,
      fixtureId: predictionScores.fixtureId,
    })
    .from(predictionScores)
    .innerJoin(fixtures, eq(predictionScores.fixtureId, fixtures.id))
    .where(eq(predictionScores.seasonId, seasonId))
    .orderBy(asc(fixtures.kickoffAt), asc(predictionScores.fixtureId))
    .all();

  const byUser = new Map<number, StreakInfo & { run: number }>();
  for (const row of rows) {
    let info = byUser.get(row.userId);
    if (!info) {
      info = { current: 0, longest: 0, run: 0 };
      byUser.set(row.userId, info);
    }
    if (row.points > 0) {
      info.run += 1;
      if (info.run > info.longest) info.longest = info.run;
    } else {
      info.run = 0;
    }
  }
  const result = new Map<number, StreakInfo>();
  for (const [userId, info] of byUser) {
    result.set(userId, { current: info.run, longest: info.longest });
  }
  return result;
}

const HOT_STREAK_MIN = 3;

/**
 * Titles shown on the standings/profile right now:
 *  - Season-dynamic (computed fresh): 🏆 leader, 🎯 exact king, 🔥 hot streak
 *  - Latest closed round's persisted titles: 👑 winner, 🧙 prophet, 💀 black, 🚀 climber
 * A player can hold several titles at once (league rule).
 */
export function computeCurrentTitles(db: Db, seasonId: number): Map<number, TitleCode[]> {
  const titles = new Map<number, TitleCode[]>();
  const add = (userId: number, code: TitleCode) => {
    const list = titles.get(userId) ?? [];
    if (!list.includes(code)) list.push(code);
    titles.set(userId, list);
  };

  const totals = computeSeasonTotals(db, seasonId);
  for (const entry of totals) {
    if (entry.rank === 1 && entry.points > 0) add(entry.userId, 'leader');
  }

  const maxExact = Math.max(0, ...totals.map((t) => t.exactCount));
  if (maxExact > 0) {
    for (const entry of totals) {
      if (entry.exactCount === maxExact) add(entry.userId, 'exact_king');
    }
  }

  const streaks = computeStreaks(db, seasonId);
  const maxStreak = Math.max(0, ...[...streaks.values()].map((s) => s.current));
  if (maxStreak >= HOT_STREAK_MIN) {
    for (const [userId, info] of streaks) {
      if (info.current === maxStreak) add(userId, 'hot_streak');
    }
  }

  const latestClosed = db
    .select()
    .from(rounds)
    .where(and(eq(rounds.seasonId, seasonId), eq(rounds.status, 'closed')))
    .orderBy(desc(rounds.number))
    .get();
  if (latestClosed) {
    for (const row of db
      .select()
      .from(roundTitles)
      .where(eq(roundTitles.roundId, latestClosed.id))
      .all()) {
      add(row.userId, row.titleCode as TitleCode);
    }
  }

  return titles;
}
