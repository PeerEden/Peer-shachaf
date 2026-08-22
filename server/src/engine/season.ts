import { and, eq } from 'drizzle-orm';
import { rounds, roundUserStats, seasonHonors, seasons, users } from '../db/schema.js';
import { audit, type Actor } from '../lib/audit.js';
import { badRequest, notFound } from '../lib/http-error.js';
import { computeSeasonTotals } from './standings.js';
import type { EngineCtx } from './types.js';

export function getActiveSeason(ctx: EngineCtx) {
  return ctx.db.select().from(seasons).where(eq(seasons.status, 'active')).get() ?? null;
}

/**
 * Archives a season: writes honors (with denormalized names so they survive
 * user deletion) and freezes the season. History remains fully browsable.
 */
export function archiveSeason(ctx: EngineCtx, seasonId: number, actor: Actor): void {
  const { db } = ctx;
  const season = db.select().from(seasons).where(eq(seasons.id, seasonId)).get();
  if (!season) throw notFound('העונה לא נמצאה');
  if (season.status !== 'active') throw badRequest('SEASON_NOT_ACTIVE', 'העונה כבר בארכיון');

  const allUsers = new Map(db.select().from(users).all().map((u) => [u.id, u]));
  const nameOf = (userId: number) => allUsers.get(userId)?.displayName ?? `משתמש ${userId}`;

  db.transaction(() => {
    const totals = computeSeasonTotals(db, seasonId);
    const addHonor = (userId: number, titleCode: string, value: number | null) => {
      db.insert(seasonHonors)
        .values({ seasonId, userId, displayName: nameOf(userId), titleCode, value })
        .run();
    };

    for (const entry of totals) {
      if (entry.rank === 1 && entry.points > 0) addHonor(entry.userId, 'champion', entry.points);
    }

    const maxExact = Math.max(0, ...totals.map((t) => t.exactCount));
    if (maxExact > 0) {
      for (const entry of totals) {
        if (entry.exactCount === maxExact) addHonor(entry.userId, 'exact_king', entry.exactCount);
      }
    }

    const winsByUser = new Map<number, number>();
    let bestRound: { userId: number; points: number } | null = null;
    const statRows = db
      .select({ stat: roundUserStats })
      .from(roundUserStats)
      .innerJoin(rounds, eq(roundUserStats.roundId, rounds.id))
      .where(and(eq(rounds.seasonId, seasonId)))
      .all();
    for (const { stat } of statRows) {
      if (stat.isRoundWinner) winsByUser.set(stat.userId, (winsByUser.get(stat.userId) ?? 0) + 1);
      if (stat.points > 0 && (!bestRound || stat.points > bestRound.points)) {
        bestRound = { userId: stat.userId, points: stat.points };
      }
    }
    const maxWins = Math.max(0, ...winsByUser.values());
    if (maxWins > 0) {
      for (const [userId, wins] of winsByUser) {
        if (wins === maxWins) addHonor(userId, 'round_winner', wins);
      }
    }
    if (bestRound) {
      const prophetUsers = new Set<number>();
      for (const { stat } of statRows) {
        if (stat.points === bestRound.points && !prophetUsers.has(stat.userId)) {
          prophetUsers.add(stat.userId);
          addHonor(stat.userId, 'round_prophet', stat.points);
        }
      }
    }

    db.update(seasons)
      .set({ status: 'archived', archivedAt: ctx.clock.now() })
      .where(eq(seasons.id, seasonId))
      .run();
    audit(db, actor, 'season.archived', 'season', seasonId, { name: season.name }, null);
  });
}

/** Starts a fresh season (only when no season is active) with rounds 1–26. */
export function startSeason(ctx: EngineCtx, name: string, actor: Actor): number {
  const { db } = ctx;
  if (getActiveSeason(ctx)) {
    throw badRequest('SEASON_ALREADY_ACTIVE', 'יש כבר עונה פעילה — קודם יש להעביר אותה לארכיון');
  }
  return db.transaction(() => {
    const season = db.insert(seasons).values({ name, status: 'active', startedAt: ctx.clock.now() }).returning().get();
    for (let n = 1; n <= 26; n++) {
      db.insert(rounds)
        .values({
          seasonId: season.id,
          number: n,
          name: `מחזור ${n}`,
          phase: 'regular',
          status: n === 1 ? 'open' : 'pending',
          openedAt: n === 1 ? ctx.clock.now() : null,
        })
        .run();
    }
    audit(db, actor, 'season.started', 'season', season.id, null, { name });
    return season.id;
  });
}
