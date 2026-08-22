import { and, eq } from 'drizzle-orm';
import { Router } from 'express';
import type { AppDeps } from '../app.js';
import { requireAuth } from '../auth/middleware.js';
import { fixtures, predictions, rounds, roundUserStats, users } from '../db/schema.js';
import { getActiveSeason } from '../engine/season.js';
import { computeSeasonTotals } from '../engine/standings.js';
import { computeCurrentTitles, computeStreaks } from '../engine/titles.js';
import { toUserPublic } from '../lib/dto.js';
import { notFound } from '../lib/http-error.js';

export function statsRoutes(deps: AppDeps): Router {
  const router = Router();
  const { db } = deps;
  const ctx = deps;

  router.use(requireAuth);

  /** The personal stats page: totals, success rate, streaks, best/worst round. */
  router.get('/users/:id/stats', (req, res) => {
    const userId = Number(req.params.id);
    const user = db.select().from(users).where(eq(users.id, userId)).get();
    if (!user) throw notFound('המשתמש לא נמצא');

    const season = getActiveSeason(ctx);
    if (!season) {
      res.json({
        user: toUserPublic(user),
        totalPoints: 0, exactCount: 0, outcomeCount: 0, predictionsCount: 0,
        scoredFixturesCount: 0, successRate: 0, roundWins: 0,
        bestRound: null, worstRound: null, currentStreak: 0, longestStreak: 0,
        titles: [], rank: null,
      });
      return;
    }

    const totals = computeSeasonTotals(db, season.id).find((t) => t.userId === userId);
    const titles = computeCurrentTitles(db, season.id).get(userId) ?? [];
    const streaks = computeStreaks(db, season.id).get(userId) ?? { current: 0, longest: 0 };

    const predictionsCount = db
      .select({ id: predictions.id })
      .from(predictions)
      .innerJoin(fixtures, eq(predictions.fixtureId, fixtures.id))
      .where(and(eq(predictions.userId, userId), eq(fixtures.seasonId, season.id)))
      .all().length;

    const statRows = db
      .select({ stat: roundUserStats, round: rounds })
      .from(roundUserStats)
      .innerJoin(rounds, eq(roundUserStats.roundId, rounds.id))
      .where(and(eq(roundUserStats.userId, userId), eq(rounds.seasonId, season.id)))
      .all();
    const roundWins = statRows.filter((r) => r.stat.isRoundWinner).length;
    let bestRound: { roundId: number; roundName: string; points: number } | null = null;
    let worstRound: { roundId: number; roundName: string; points: number } | null = null;
    for (const { stat, round } of statRows) {
      if (!bestRound || stat.points > bestRound.points) {
        bestRound = { roundId: round.id, roundName: round.name, points: stat.points };
      }
      if (!worstRound || stat.points < worstRound.points) {
        worstRound = { roundId: round.id, roundName: round.name, points: stat.points };
      }
    }

    const scoredCount = totals?.scoredCount ?? 0;
    const hits = (totals?.exactCount ?? 0) + (totals?.outcomeCount ?? 0);

    res.json({
      user: toUserPublic(user),
      totalPoints: totals?.points ?? 0,
      exactCount: totals?.exactCount ?? 0,
      outcomeCount: totals?.outcomeCount ?? 0,
      predictionsCount,
      scoredFixturesCount: scoredCount,
      successRate: scoredCount > 0 ? Math.round((hits / scoredCount) * 100) : 0,
      roundWins,
      bestRound,
      worstRound,
      currentStreak: streaks.current,
      longestStreak: streaks.longest,
      titles,
      rank: totals?.rank ?? null,
    });
  });

  return router;
}
