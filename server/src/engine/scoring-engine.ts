import { scorePrediction } from '../../../shared/src/index.js';
import { eq } from 'drizzle-orm';
import { fixtures, predictions, predictionScores, rounds } from '../db/schema.js';
import { audit, type Actor } from '../lib/audit.js';
import { badRequest, notFound } from '../lib/http-error.js';
import { maybeCloseRound, recomputeClosedRounds } from './round-lifecycle.js';
import type { EngineCtx } from './types.js';

type FixtureRow = typeof fixtures.$inferSelect;

function getFixtureOrThrow(ctx: EngineCtx, fixtureId: number): FixtureRow {
  const fixture = ctx.db.select().from(fixtures).where(eq(fixtures.id, fixtureId)).get();
  if (!fixture) throw notFound('המשחק לא נמצא');
  return fixture;
}

/** Recomputes stored final points for every prediction on a finished fixture. */
export function recomputeFixtureScores(ctx: EngineCtx, fixture: FixtureRow): void {
  if (fixture.homeScore === null || fixture.awayScore === null) return;
  const result = { home: fixture.homeScore, away: fixture.awayScore };
  const now = ctx.clock.now();
  const rows = ctx.db.select().from(predictions).where(eq(predictions.fixtureId, fixture.id)).all();

  ctx.db.delete(predictionScores).where(eq(predictionScores.fixtureId, fixture.id)).run();
  for (const prediction of rows) {
    const scored = scorePrediction({ home: prediction.homePred, away: prediction.awayPred }, result);
    ctx.db
      .insert(predictionScores)
      .values({
        userId: prediction.userId,
        fixtureId: fixture.id,
        roundId: fixture.roundId,
        seasonId: fixture.seasonId,
        points: scored.points,
        isExact: scored.isExact,
        isOutcome: scored.isOutcome,
        isCompletion: fixture.isCompletion,
        computedAt: now,
      })
      .run();
  }
}

/**
 * Admin enters (or corrects) a final result. Scores every prediction, then
 * either closes the round (all regular games terminal) or — when the round
 * is already closed and this is a correction — heals the closed snapshots.
 * A completion game's first result does NOT rewrite frozen snapshots: its
 * points flow into the live season totals only (league rule).
 */
export function enterFinalResult(
  ctx: EngineCtx,
  fixtureId: number,
  result: { homeScore: number; awayScore: number },
  actor: Actor,
): void {
  const fixture = getFixtureOrThrow(ctx, fixtureId);
  if (fixture.status === 'cancelled' || fixture.status === 'postponed') {
    throw badRequest('FIXTURE_NOT_PLAYABLE', 'לא ניתן להזין תוצאה למשחק דחוי או מבוטל');
  }
  const wasFinished = fixture.status === 'finished';

  const updated = ctx.db.transaction(() => {
    const next = ctx.db
      .update(fixtures)
      .set({
        homeScore: result.homeScore,
        awayScore: result.awayScore,
        status: 'finished',
        liveMinute: null,
        finalizedAt: fixture.finalizedAt ?? ctx.clock.now(),
      })
      .where(eq(fixtures.id, fixture.id))
      .returning()
      .get();
    recomputeFixtureScores(ctx, next);
    audit(
      ctx.db,
      actor,
      wasFinished ? 'fixture.result_corrected' : 'fixture.result_entered',
      'fixture',
      fixture.id,
      { homeScore: fixture.homeScore, awayScore: fixture.awayScore, status: fixture.status },
      { homeScore: result.homeScore, awayScore: result.awayScore, status: 'finished' },
    );
    return next;
  });

  const round = ctx.db.select().from(rounds).where(eq(rounds.id, updated.roundId)).get();
  if (!round) return;

  if (round.status === 'closed') {
    const isFirstCompletionResult = updated.isCompletion && !wasFinished;
    if (!isFirstCompletionResult) {
      recomputeClosedRounds(ctx, round.seasonId);
    }
  } else {
    maybeCloseRound(ctx, round.id);
  }
}

/** Admin updates the running score/minute during a game (shown on the Live screen). */
export function updateLiveScore(
  ctx: EngineCtx,
  fixtureId: number,
  update: { homeScore: number; awayScore: number; liveMinute: string },
  actor: Actor,
): void {
  const fixture = getFixtureOrThrow(ctx, fixtureId);
  if (fixture.status !== 'scheduled' && fixture.status !== 'live') {
    throw badRequest('FIXTURE_NOT_PLAYABLE', 'לא ניתן לעדכן תוצאה חיה למשחק הזה');
  }
  ctx.db
    .update(fixtures)
    .set({
      status: 'live',
      homeScore: update.homeScore,
      awayScore: update.awayScore,
      liveMinute: update.liveMinute,
    })
    .where(eq(fixtures.id, fixture.id))
    .run();
  audit(ctx.db, actor, 'fixture.live_updated', 'fixture', fixture.id, null, update);
}
