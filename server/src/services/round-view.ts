import type {
  CompletionStatusEntry,
  FixtureDto,
  PredictionScoreDto,
  RoundDto,
  TeamDto,
} from '@league/shared';
import { asc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { fixtures, predictions, predictionScores, rounds, teams, users } from '../db/schema.js';
import {
  arePredictionsVisible,
  deriveRoundState,
} from '../engine/round-lifecycle.js';
import type { EngineCtx } from '../engine/types.js';
import { toUserPublic } from '../lib/dto.js';
import { notFound } from '../lib/http-error.js';

type RoundRow = typeof rounds.$inferSelect;
type FixtureRow = typeof fixtures.$inferSelect;
type UserRow = typeof users.$inferSelect;

export function getTeamsMap(db: Db): Map<number, TeamDto> {
  return new Map(
    db
      .select()
      .from(teams)
      .all()
      .map((t) => [
        t.id,
        { id: t.id, name: t.name, shortName: t.shortName, color: t.color, isActive: t.isActive },
      ]),
  );
}

export function getUsersMap(db: Db): Map<number, UserRow> {
  return new Map(db.select().from(users).all().map((u) => [u.id, u]));
}

export function toFixtureDto(fixture: FixtureRow, teamsMap: Map<number, TeamDto>): FixtureDto {
  const fallback = (id: number): TeamDto => ({
    id,
    name: `קבוצה ${id}`,
    shortName: `${id}`,
    color: '#888888',
    isActive: false,
  });
  return {
    id: fixture.id,
    roundId: fixture.roundId,
    homeTeam: teamsMap.get(fixture.homeTeamId) ?? fallback(fixture.homeTeamId),
    awayTeam: teamsMap.get(fixture.awayTeamId) ?? fallback(fixture.awayTeamId),
    kickoffAt: fixture.kickoffAt.getTime(),
    status: fixture.status,
    homeScore: fixture.homeScore,
    awayScore: fixture.awayScore,
    liveMinute: fixture.liveMinute,
    isCompletion: fixture.isCompletion,
    predictionOpenAt: fixture.predictionOpenAt?.getTime() ?? null,
  };
}

export function toRoundDto(round: RoundRow, roundFixtures: FixtureRow[], now: Date): RoundDto {
  const countable = roundFixtures.filter((f) => f.status !== 'cancelled' && f.status !== 'postponed');
  return {
    id: round.id,
    seasonId: round.seasonId,
    number: round.number,
    name: round.name,
    phase: round.phase,
    status: round.status,
    lockAt: round.lockAt?.getTime() ?? null,
    derivedState: deriveRoundState(round, roundFixtures, now),
    fixtureCount: countable.length,
    finishedCount: countable.filter((f) => f.status === 'finished').length,
  };
}

/** The fixtures a user is expected to predict before the round locks. */
export function predictableFixturesOfRound(roundFixtures: FixtureRow[]): FixtureRow[] {
  return roundFixtures.filter(
    (f) => !f.isCompletion && f.status !== 'cancelled' && f.status !== 'postponed',
  );
}

export function getCompletionStatus(
  db: Db,
  roundFixtures: FixtureRow[],
): CompletionStatusEntry[] {
  const relevant = predictableFixturesOfRound(roundFixtures);
  const fixtureIds = relevant.map((f) => f.id);
  const allUsers = db.select().from(users).all();
  const predictionRows = fixtureIds.length
    ? db.select().from(predictions).where(inArray(predictions.fixtureId, fixtureIds)).all()
    : [];
  const filledByUser = new Map<number, number>();
  for (const p of predictionRows) {
    filledByUser.set(p.userId, (filledByUser.get(p.userId) ?? 0) + 1);
  }
  return allUsers
    .map((user) => {
      const filled = filledByUser.get(user.id) ?? 0;
      return {
        user: toUserPublic(user),
        filled,
        total: relevant.length,
        done: relevant.length > 0 && filled === relevant.length,
      };
    })
    .sort((a, b) => Number(b.done) - Number(a.done) || a.user.displayName.localeCompare(b.user.displayName, 'he'));
}

export interface RoundPredictionEntry {
  fixtureId: number;
  userId: number;
  homePred: number;
  awayPred: number;
}

/**
 * The full, privacy-filtered view of one round. Others' predictions are only
 * serialized for fixtures where arePredictionsVisible() — the privacy rule
 * lives here on the server, never in the client.
 */
export function getRoundView(ctx: EngineCtx, roundId: number, viewer: UserRow) {
  const { db, clock } = ctx;
  const round = db.select().from(rounds).where(eq(rounds.id, roundId)).get();
  if (!round) throw notFound('המחזור לא נמצא');
  const now = clock.now();

  const roundFixtures = db
    .select()
    .from(fixtures)
    .where(eq(fixtures.roundId, roundId))
    .orderBy(asc(fixtures.kickoffAt), asc(fixtures.id))
    .all();
  const teamsMap = getTeamsMap(db);
  const usersMap = getUsersMap(db);
  const fixtureIds = roundFixtures.map((f) => f.id);

  const allPredictions = fixtureIds.length
    ? db.select().from(predictions).where(inArray(predictions.fixtureId, fixtureIds)).all()
    : [];
  const visibleFixtureIds = new Set(
    roundFixtures.filter((f) => arePredictionsVisible(f, round, now)).map((f) => f.id),
  );

  const visiblePredictions: Array<RoundPredictionEntry & { user: ReturnType<typeof toUserPublic> }> =
    [];
  for (const p of allPredictions) {
    if (p.userId === viewer.id || visibleFixtureIds.has(p.fixtureId)) {
      const user = usersMap.get(p.userId);
      if (!user) continue;
      visiblePredictions.push({
        fixtureId: p.fixtureId,
        userId: p.userId,
        homePred: p.homePred,
        awayPred: p.awayPred,
        user: toUserPublic(user),
      });
    }
  }

  const scoreRows = fixtureIds.length
    ? db
        .select()
        .from(predictionScores)
        .where(inArray(predictionScores.fixtureId, fixtureIds))
        .all()
    : [];
  const scores: PredictionScoreDto[] = scoreRows
    .filter((s) => visibleFixtureIds.has(s.fixtureId))
    .map((s) => ({
      fixtureId: s.fixtureId,
      userId: s.userId,
      points: s.points,
      isExact: s.isExact,
      isOutcome: s.isOutcome,
      isCompletion: s.isCompletion,
    }));

  return {
    round: toRoundDto(round, roundFixtures, now),
    fixtures: roundFixtures.map((f) => toFixtureDto(f, teamsMap)),
    predictions: visiblePredictions,
    scores,
    completionStatus: getCompletionStatus(db, roundFixtures),
  };
}

/** The single currently-open round of the active season (the league is sequential). */
export function getOpenRound(db: Db, seasonId: number): RoundRow | null {
  return (
    db
      .select()
      .from(rounds)
      .where(eq(rounds.seasonId, seasonId))
      .all()
      .filter((r) => r.status === 'open')
      .sort((a, b) => a.number - b.number)[0] ?? null
  );
}
