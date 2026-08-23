import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { Router } from 'express';
import type { AppDeps } from '../app.js';
import { requireAuth } from '../auth/middleware.js';
import { fixtures, leagueSettings, predictions, rounds, roundUserStats } from '../db/schema.js';
import { getActiveSeason } from '../engine/season.js';
import { toUserPrivate, toUserPublic } from '../lib/dto.js';
import {
  getCompletionStatus,
  getOpenRound,
  getTeamsMap,
  getUsersMap,
  predictableFixturesOfRound,
  toFixtureDto,
  toRoundDto,
} from '../services/round-view.js';
import { getStandingsView } from '../services/standings-view.js';

export function standingsRoutes(deps: AppDeps): Router {
  const router = Router();
  const { db, clock } = deps;
  const ctx = deps;

  router.use(requireAuth);

  router.get('/standings', (_req, res) => {
    const season = getActiveSeason(ctx);
    res.json({ standings: season ? getStandingsView(ctx, season.id) : [] });
  });

  /** One aggregate call for the Home screen. */
  router.get('/home', (req, res) => {
    const user = req.user!;
    const season = getActiveSeason(ctx);
    const settings = db.select().from(leagueSettings).all()[0];
    const now = clock.now();

    if (!season) {
      res.json({
        me: toUserPrivate(user),
        leagueName: settings?.leagueName ?? '0 מושג בכדורגל',
        seasonName: null,
        standings: [],
        activeRound: null,
        liveNow: false,
        lastClosedRound: null,
        completionFixtures: [],
      });
      return;
    }

    const standings = getStandingsView(ctx, season.id);
    const teamsMap = getTeamsMap(db);

    const open = getOpenRound(db, season.id);
    let activeRound = null;
    if (open) {
      const roundFixtures = db
        .select()
        .from(fixtures)
        .where(eq(fixtures.roundId, open.id))
        .orderBy(asc(fixtures.kickoffAt), asc(fixtures.id))
        .all();
      const relevant = predictableFixturesOfRound(roundFixtures);
      const myPredictions = relevant.length
        ? db
            .select()
            .from(predictions)
            .where(
              and(
                eq(predictions.userId, user.id),
                inArray(predictions.fixtureId, relevant.map((f) => f.id)),
              ),
            )
            .all()
        : [];
      activeRound = {
        round: toRoundDto(open, roundFixtures, now),
        myFilled: myPredictions.length,
        total: relevant.length,
        completionStatus: getCompletionStatus(db, roundFixtures),
        // Scores are public the moment they happen (only predictions are
        // private), so Home can always show the round's games and results.
        fixtures: roundFixtures.map((f) => toFixtureDto(f, teamsMap)),
      };
    }

    const liveNow = db
      .select()
      .from(fixtures)
      .where(and(eq(fixtures.seasonId, season.id), eq(fixtures.status, 'live')))
      .all().length > 0;

    const lastClosed = db
      .select()
      .from(rounds)
      .where(and(eq(rounds.seasonId, season.id), eq(rounds.status, 'closed')))
      .orderBy(desc(rounds.number))
      .get();
    let lastClosedRound = null;
    if (lastClosed) {
      const usersMap = getUsersMap(db);
      const winners = db
        .select()
        .from(roundUserStats)
        .where(eq(roundUserStats.roundId, lastClosed.id))
        .all()
        .filter((s) => s.isRoundWinner)
        .map((s) => usersMap.get(s.userId))
        .filter((u) => u !== undefined)
        .map((u) => toUserPublic(u));
      lastClosedRound = { id: lastClosed.id, name: lastClosed.name, winners };
    }

    // Completion games (משחקי השלמה) that are open or upcoming for prediction
    const completionRows = db
      .select()
      .from(fixtures)
      .where(
        and(
          eq(fixtures.seasonId, season.id),
          eq(fixtures.isCompletion, true),
          eq(fixtures.status, 'scheduled'),
        ),
      )
      .all();
    const myCompletionPreds = new Map(
      completionRows.length
        ? db
            .select()
            .from(predictions)
            .where(
              and(
                eq(predictions.userId, user.id),
                inArray(predictions.fixtureId, completionRows.map((f) => f.id)),
              ),
            )
            .all()
            .map((p) => [p.fixtureId, { homePred: p.homePred, awayPred: p.awayPred }])
        : [],
    );

    res.json({
      me: toUserPrivate(user),
      leagueName: settings?.leagueName ?? '0 מושג בכדורגל',
      seasonName: season.name,
      standings,
      activeRound,
      liveNow,
      lastClosedRound,
      completionFixtures: completionRows.map((f) => ({
        ...toFixtureDto(f, teamsMap),
        myPrediction: myCompletionPreds.get(f.id) ?? null,
      })),
    });
  });

  return router;
}
