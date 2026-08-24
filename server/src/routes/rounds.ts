import { predictionSchema } from '../../../shared/src/index.js';
import { asc, eq } from 'drizzle-orm';
import { Router } from 'express';
import type { AppDeps } from '../app.js';
import { requireAuth } from '../auth/middleware.js';
import { fixtures, predictions, rounds, roundTitles, roundUserStats } from '../db/schema.js';
import { isFixturePredictable } from '../engine/round-lifecycle.js';
import { getActiveSeason } from '../engine/season.js';
import { toUserPublic } from '../lib/dto.js';
import { badRequest, forbidden, notFound } from '../lib/http-error.js';
import {
  getOpenRound,
  getRoundView,
  getUsersMap,
  predictableFixturesOfRound,
  toRoundDto,
} from '../services/round-view.js';

export function roundsRoutes(deps: AppDeps): Router {
  const router = Router();
  const { db, clock } = deps;
  const ctx = deps;

  router.use(requireAuth);

  router.get('/rounds', async (_req, res) => {
    const season = await getActiveSeason(ctx);
    if (!season) {
      res.json({ rounds: [] });
      return;
    }
    const allRounds = await db
      .select()
      .from(rounds)
      .where(eq(rounds.seasonId, season.id))
      .orderBy(asc(rounds.number));
    const allFixtures = await db.select().from(fixtures).where(eq(fixtures.seasonId, season.id));
    const now = clock.now();
    res.json({
      rounds: allRounds.map((r) =>
        toRoundDto(r, allFixtures.filter((f) => f.roundId === r.id), now),
      ),
    });
  });

  router.get('/rounds/current', async (req, res) => {
    const season = await getActiveSeason(ctx);
    const open = season ? await getOpenRound(db, season.id) : null;
    if (!open) {
      res.json({ round: null });
      return;
    }
    res.json(await getRoundView(ctx, open.id, req.user!));
  });

  router.get('/rounds/:id', async (req, res) => {
    const roundId = Number(req.params.id);
    if (!Number.isInteger(roundId)) throw notFound();
    res.json(await getRoundView(ctx, roundId, req.user!));
  });

  router.get('/rounds/:id/summary', async (req, res) => {
    const roundId = Number(req.params.id);
    const [round] = await db.select().from(rounds).where(eq(rounds.id, roundId));
    if (!round) throw notFound('המחזור לא נמצא');
    if (round.status !== 'closed') throw badRequest('ROUND_NOT_CLOSED', 'המחזור עוד לא הסתיים');

    const usersMap = await getUsersMap(db);
    const stats = await db.select().from(roundUserStats).where(eq(roundUserStats.roundId, roundId));
    const titles = await db.select().from(roundTitles).where(eq(roundTitles.roundId, roundId));
    const titlesByUser = new Map<number, string[]>();
    for (const t of titles) {
      titlesByUser.set(t.userId, [...(titlesByUser.get(t.userId) ?? []), t.titleCode]);
    }

    const entries = stats
      .map((s) => {
        const user = usersMap.get(s.userId);
        if (!user) return null;
        return {
          user: toUserPublic(user),
          points: s.points,
          exactCount: s.exactCount,
          outcomeCount: s.outcomeCount,
          rankInRound: s.rankInRound,
          isRoundWinner: s.isRoundWinner,
          seasonTotalAfter: s.seasonTotalAfter,
          rankAfter: s.rankAfter,
          rankBefore: s.rankBefore,
          movement: s.movement,
          titles: titlesByUser.get(s.userId) ?? [],
        };
      })
      .filter((e) => e !== null)
      .sort((a, b) => a.rankInRound - b.rankInRound);

    res.json({
      round: toRoundDto(
        round,
        await db.select().from(fixtures).where(eq(fixtures.roundId, roundId)),
        clock.now(),
      ),
      entries,
    });
  });

  router.put('/predictions/:fixtureId', async (req, res) => {
    const user = req.user!;
    const fixtureId = Number(req.params.fixtureId);
    const input = predictionSchema.parse(req.body);

    const [fixture] = await db.select().from(fixtures).where(eq(fixtures.id, fixtureId));
    if (!fixture) throw notFound('המשחק לא נמצא');
    const [round] = await db.select().from(rounds).where(eq(rounds.id, fixture.roundId));
    if (!round) throw notFound('המחזור לא נמצא');

    if (!isFixturePredictable(fixture, round, clock.now())) {
      throw forbidden('ROUND_LOCKED', 'המחזור נעול — כבר אי אפשר לשנות ניחושים');
    }

    const now = clock.now();
    const [saved] = await db
      .insert(predictions)
      .values({
        userId: user.id,
        fixtureId,
        homePred: input.homePred,
        awayPred: input.awayPred,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [predictions.userId, predictions.fixtureId],
        set: { homePred: input.homePred, awayPred: input.awayPred, updatedAt: now },
      })
      .returning();

    res.json({
      prediction: {
        fixtureId: saved!.fixtureId,
        userId: saved!.userId,
        homePred: saved!.homePred,
        awayPred: saved!.awayPred,
        updatedAt: saved!.updatedAt.getTime(),
      },
    });
  });

  /** "סיימתי לנחש" — validates the round is fully filled; returns what's missing. */
  router.post('/rounds/:id/done', async (req, res) => {
    const user = req.user!;
    const roundId = Number(req.params.id);
    const [round] = await db.select().from(rounds).where(eq(rounds.id, roundId));
    if (!round) throw notFound('המחזור לא נמצא');

    const roundFixtures = await db.select().from(fixtures).where(eq(fixtures.roundId, roundId));
    const relevant = predictableFixturesOfRound(roundFixtures);
    const mine = new Set(
      (
        await db
          .select()
          .from(predictions)
          .where(eq(predictions.userId, user.id))
      ).map((p) => p.fixtureId),
    );
    const missing = relevant.filter((f) => !mine.has(f.id)).map((f) => f.id);
    res.json({ complete: missing.length === 0, missing, total: relevant.length });
  });

  return router;
}
