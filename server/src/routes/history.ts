import { and, asc, desc, eq } from 'drizzle-orm';
import { Router } from 'express';
import type { AppDeps } from '../app.js';
import { requireAuth } from '../auth/middleware.js';
import { fixtures, rounds, roundUserStats, seasonHonors, seasons } from '../db/schema.js';
import { getActiveSeason } from '../engine/season.js';
import { toUserPublic } from '../lib/dto.js';
import { getUsersMap, toRoundDto } from '../services/round-view.js';

export function historyRoutes(deps: AppDeps): Router {
  const router = Router();
  const { db, clock } = deps;

  router.use(requireAuth);

  /** Closed rounds of the active season, newest first — the History index. */
  router.get('/history/rounds', (_req, res) => {
    const activeSeason = getActiveSeason(deps);
    const closed = db
      .select()
      .from(rounds)
      .where(
        activeSeason
          ? and(eq(rounds.status, 'closed'), eq(rounds.seasonId, activeSeason.id))
          : eq(rounds.status, 'closed'),
      )
      .orderBy(desc(rounds.number))
      .all();
    const usersMap = getUsersMap(db);
    const now = clock.now();

    const items = closed.map((round) => {
      const roundFixtures = db.select().from(fixtures).where(eq(fixtures.roundId, round.id)).all();
      const winners = db
        .select()
        .from(roundUserStats)
        .where(and(eq(roundUserStats.roundId, round.id), eq(roundUserStats.isRoundWinner, true)))
        .all()
        .map((s) => usersMap.get(s.userId))
        .filter((u) => u !== undefined)
        .map((u) => toUserPublic(u));
      return { ...toRoundDto(round, roundFixtures, now), winners };
    });
    res.json({ rounds: items });
  });

  router.get('/seasons', (_req, res) => {
    const rows = db.select().from(seasons).orderBy(desc(seasons.id)).all();
    res.json({
      seasons: rows.map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        startedAt: s.startedAt.getTime(),
        archivedAt: s.archivedAt?.getTime() ?? null,
      })),
    });
  });

  router.get('/seasons/:id/honors', (req, res) => {
    const seasonId = Number(req.params.id);
    const rows = db
      .select()
      .from(seasonHonors)
      .where(eq(seasonHonors.seasonId, seasonId))
      .orderBy(asc(seasonHonors.id))
      .all();
    res.json({
      honors: rows.map((h) => ({ titleCode: h.titleCode, displayName: h.displayName, value: h.value })),
    });
  });

  return router;
}
