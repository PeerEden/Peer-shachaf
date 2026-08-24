import { and, eq } from 'drizzle-orm';
import { rounds, roundUserStats, seasonHonors, seasons, users } from '../db/schema.js';
import { audit, type Actor } from '../lib/audit.js';
import { badRequest, notFound } from '../lib/http-error.js';
import { computeSeasonTotals } from './standings.js';
import type { EngineCtx } from './types.js';

export async function getActiveSeason(ctx: EngineCtx) {
  return (await ctx.db.select().from(seasons).where(eq(seasons.status, 'active')))[0] ?? null;
}

/**
 * Archives a season: writes honors (with denormalized names so they survive
 * user deletion) and freezes the season. History remains fully browsable.
 */
export async function archiveSeason(ctx: EngineCtx, seasonId: number, actor: Actor): Promise<void> {
  const { db } = ctx;
  const [season] = await db.select().from(seasons).where(eq(seasons.id, seasonId));
  if (!season) throw notFound('העונה לא נמצאה');
  if (season.status !== 'active') throw badRequest('SEASON_NOT_ACTIVE', 'העונה כבר בארכיון');

  const allUsers = new Map((await db.select().from(users)).map((u) => [u.id, u]));
  const nameOf = (userId: number) => allUsers.get(userId)?.displayName ?? `משתמש ${userId}`;

  await db.transaction(async (tx) => {
    const totals = await computeSeasonTotals(tx, seasonId);
    const addHonor = async (userId: number, titleCode: string, value: number | null) => {
      await tx.insert(seasonHonors)
        .values({ seasonId, userId, displayName: nameOf(userId), titleCode, value });
    };

    for (const entry of totals) {
      if (entry.rank === 1 && entry.points > 0) await addHonor(entry.userId, 'champion', entry.points);
    }

    const maxExact = Math.max(0, ...totals.map((t) => t.exactCount));
    if (maxExact > 0) {
      for (const entry of totals) {
        if (entry.exactCount === maxExact) await addHonor(entry.userId, 'exact_king', entry.exactCount);
      }
    }

    const winsByUser = new Map<number, number>();
    let bestRound: { userId: number; points: number } | null = null;
    const statRows = await tx
      .select({ stat: roundUserStats })
      .from(roundUserStats)
      .innerJoin(rounds, eq(roundUserStats.roundId, rounds.id))
      .where(and(eq(rounds.seasonId, seasonId)));
    for (const { stat } of statRows) {
      if (stat.isRoundWinner) winsByUser.set(stat.userId, (winsByUser.get(stat.userId) ?? 0) + 1);
      if (stat.points > 0 && (!bestRound || stat.points > bestRound.points)) {
        bestRound = { userId: stat.userId, points: stat.points };
      }
    }
    const maxWins = Math.max(0, ...winsByUser.values());
    if (maxWins > 0) {
      for (const [userId, wins] of winsByUser) {
        if (wins === maxWins) await addHonor(userId, 'round_winner', wins);
      }
    }
    if (bestRound) {
      const prophetUsers = new Set<number>();
      for (const { stat } of statRows) {
        if (stat.points === bestRound.points && !prophetUsers.has(stat.userId)) {
          prophetUsers.add(stat.userId);
          await addHonor(stat.userId, 'round_prophet', stat.points);
        }
      }
    }

    await tx.update(seasons)
      .set({ status: 'archived', archivedAt: ctx.clock.now() })
      .where(eq(seasons.id, seasonId));
    await audit(tx, actor, 'season.archived', 'season', seasonId, { name: season.name }, null);
  });
}

/** Starts a fresh season (only when no season is active) with rounds 1–26. */
export async function startSeason(ctx: EngineCtx, name: string, actor: Actor): Promise<number> {
  const { db } = ctx;
  if (await getActiveSeason(ctx)) {
    throw badRequest('SEASON_ALREADY_ACTIVE', 'יש כבר עונה פעילה — קודם יש להעביר אותה לארכיון');
  }
  return db.transaction(async (tx) => {
    const [season] = await tx.insert(seasons).values({ name, status: 'active', startedAt: ctx.clock.now() }).returning();
    for (let n = 1; n <= 26; n++) {
      await tx.insert(rounds)
        .values({
          seasonId: season!.id,
          number: n,
          name: `מחזור ${n}`,
          phase: 'regular',
          status: n === 1 ? 'open' : 'pending',
          openedAt: n === 1 ? ctx.clock.now() : null,
        });
    }
    await audit(tx, actor, 'season.started', 'season', season!.id, null, { name });
    return season!.id;
  });
}
