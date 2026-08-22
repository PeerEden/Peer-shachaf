import { scorePrediction } from '@league/shared';
import { and, eq, inArray } from 'drizzle-orm';
import { Router } from 'express';
import type { AppDeps } from '../app.js';
import { requireAuth } from '../auth/middleware.js';
import { fixtures, predictions, rounds } from '../db/schema.js';
import { arePredictionsVisible } from '../engine/round-lifecycle.js';
import { getActiveSeason } from '../engine/season.js';
import { assignSharedRanks, computeSeasonTotals } from '../engine/standings.js';
import { toUserPublic } from '../lib/dto.js';
import { getTeamsMap, getUsersMap, toFixtureDto } from '../services/round-view.js';

export function liveRoutes(deps: AppDeps): Router {
  const router = Router();
  const { db } = deps;
  const ctx = deps;

  router.use(requireAuth);

  /**
   * The Live screen payload: in-play fixtures with everyone's predictions and
   * provisional points, plus the "if the games ended now" table. Nothing here
   * is ever persisted — provisional points are computed on the fly.
   */
  router.get('/live', (_req, res) => {
    const season = getActiveSeason(ctx);
    if (!season) {
      res.json({ fixtures: [], table: [], hasLive: false });
      return;
    }

    const liveFixtures = db
      .select()
      .from(fixtures)
      .where(and(eq(fixtures.seasonId, season.id), eq(fixtures.status, 'live')))
      .all();
    const teamsMap = getTeamsMap(db);
    const usersMap = getUsersMap(db);

    const livePredictions = liveFixtures.length
      ? db
          .select()
          .from(predictions)
          .where(inArray(predictions.fixtureId, liveFixtures.map((f) => f.id)))
          .all()
      : [];

    const roundsById = new Map(
      liveFixtures.length
        ? db
            .select()
            .from(rounds)
            .where(inArray(rounds.id, [...new Set(liveFixtures.map((f) => f.roundId))]))
            .all()
            .map((r) => [r.id, r])
        : [],
    );
    const now = deps.clock.now();

    const provisionalByUser = new Map<number, number>();
    const fixtureViews = liveFixtures.map((fixture) => {
      // Defense in depth: if an admin marks a game live before the round
      // actually locked, predictions (and their provisional points) stay hidden.
      const round = roundsById.get(fixture.roundId);
      if (!round || !arePredictionsVisible(fixture, round, now)) {
        return { ...toFixtureDto(fixture, teamsMap), predictions: [] };
      }
      const current =
        fixture.homeScore !== null && fixture.awayScore !== null
          ? { home: fixture.homeScore, away: fixture.awayScore }
          : { home: 0, away: 0 };
      const rows = livePredictions
        .filter((p) => p.fixtureId === fixture.id)
        .map((p) => {
          const scored = scorePrediction({ home: p.homePred, away: p.awayPred }, current);
          provisionalByUser.set(p.userId, (provisionalByUser.get(p.userId) ?? 0) + scored.points);
          const user = usersMap.get(p.userId);
          return user
            ? {
                user: toUserPublic(user),
                homePred: p.homePred,
                awayPred: p.awayPred,
                provisionalPoints: scored.points,
                isExact: scored.isExact,
              }
            : null;
        })
        .filter((r) => r !== null)
        .sort((a, b) => b.provisionalPoints - a.provisionalPoints || a.user.displayName.localeCompare(b.user.displayName, 'he'));
      return { ...toFixtureDto(fixture, teamsMap), predictions: rows };
    });

    const banked = computeSeasonTotals(db, season.id);
    const merged = banked.map((entry) => ({
      userId: entry.userId,
      bankedPoints: entry.points,
      currentRank: entry.rank,
      provisionalPoints: provisionalByUser.get(entry.userId) ?? 0,
      totalIfEndedNow: entry.points + (provisionalByUser.get(entry.userId) ?? 0),
    }));
    const sorted = [...merged].sort((a, b) => b.totalIfEndedNow - a.totalIfEndedNow || a.userId - b.userId);
    const ranks = assignSharedRanks(sorted, (e) => e.totalIfEndedNow);

    const table = sorted
      .map((entry, i) => {
        const user = usersMap.get(entry.userId);
        if (!user) return null;
        return {
          user: toUserPublic(user),
          bankedPoints: entry.bankedPoints,
          provisionalPoints: entry.provisionalPoints,
          totalIfEndedNow: entry.totalIfEndedNow,
          rankIfEndedNow: ranks[i]!,
          currentRank: entry.currentRank,
        };
      })
      .filter((e) => e !== null);

    res.json({ fixtures: fixtureViews, table, hasLive: liveFixtures.length > 0 });
  });

  return router;
}
