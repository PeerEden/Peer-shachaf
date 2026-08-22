import type { StandingsEntry, TitleCode } from '@league/shared';
import { and, desc, eq } from 'drizzle-orm';
import { rounds, roundUserStats } from '../db/schema.js';
import { computeSeasonTotals } from '../engine/standings.js';
import { computeCurrentTitles } from '../engine/titles.js';
import type { EngineCtx } from '../engine/types.js';
import { toUserPublic } from '../lib/dto.js';
import { getUsersMap } from './round-view.js';

/** Ranks of the latest closed round (the baseline for ↑↓ movement badges). */
export function getPreviousRanks(ctx: EngineCtx, seasonId: number): Map<number, number> {
  const lastClosed = ctx.db
    .select()
    .from(rounds)
    .where(and(eq(rounds.seasonId, seasonId), eq(rounds.status, 'closed')))
    .orderBy(desc(rounds.number))
    .get();
  const map = new Map<number, number>();
  if (!lastClosed) return map;
  for (const row of ctx.db
    .select()
    .from(roundUserStats)
    .where(eq(roundUserStats.roundId, lastClosed.id))
    .all()) {
    map.set(row.userId, row.rankAfter);
  }
  return map;
}

/** Live season standings: totals over every stored score + current titles + movement. */
export function getStandingsView(ctx: EngineCtx, seasonId: number): StandingsEntry[] {
  const totals = computeSeasonTotals(ctx.db, seasonId);
  const titles = computeCurrentTitles(ctx.db, seasonId);
  const prevRanks = getPreviousRanks(ctx, seasonId);
  const usersMap = getUsersMap(ctx.db);

  return totals
    .map((t) => {
      const user = usersMap.get(t.userId);
      if (!user) return null;
      const previousRank = prevRanks.get(t.userId) ?? null;
      return {
        user: toUserPublic(user),
        totalPoints: t.points,
        exactCount: t.exactCount,
        outcomeCount: t.outcomeCount,
        rank: t.rank,
        previousRank,
        movement: previousRank === null ? null : previousRank - t.rank,
        titles: (titles.get(t.userId) ?? []) as TitleCode[],
      };
    })
    .filter((e): e is StandingsEntry => e !== null)
    .sort((a, b) => a.rank - b.rank || a.user.displayName.localeCompare(b.user.displayName, 'he'));
}
