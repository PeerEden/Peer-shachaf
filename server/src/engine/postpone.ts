import { eq } from 'drizzle-orm';
import { fixtures, predictions, predictionScores } from '../db/schema.js';
import { audit, type Actor } from '../lib/audit.js';
import { badRequest, notFound } from '../lib/http-error.js';
import { maybeCloseRound, recomputeRoundLock } from './round-lifecycle.js';
import type { EngineCtx } from './types.js';

const COMPLETION_REOPEN_MS = 7 * 24 * 60 * 60 * 1000;

function getFixtureOrThrow(ctx: EngineCtx, fixtureId: number) {
  const fixture = ctx.db.select().from(fixtures).where(eq(fixtures.id, fixtureId)).get();
  if (!fixture) throw notFound('המשחק לא נמצא');
  return fixture;
}

/** Copies a fixture's predictions into the audit log, then deletes them (league rule: voided). */
function voidPredictions(ctx: EngineCtx, fixtureId: number, actor: Actor, reason: string): void {
  const rows = ctx.db.select().from(predictions).where(eq(predictions.fixtureId, fixtureId)).all();
  if (rows.length > 0) {
    audit(
      ctx.db,
      actor,
      reason,
      'fixture',
      fixtureId,
      rows.map((p) => ({ userId: p.userId, homePred: p.homePred, awayPred: p.awayPred })),
      null,
    );
    ctx.db.delete(predictions).where(eq(predictions.fixtureId, fixtureId)).run();
  }
  ctx.db.delete(predictionScores).where(eq(predictionScores.fixtureId, fixtureId)).run();
}

/**
 * A game is postponed: original predictions are voided, the game leaves the
 * round's accounting (the round can close without it), and the round lock
 * moves if this was the earliest kickoff and the round hasn't locked yet.
 */
export function postponeFixture(ctx: EngineCtx, fixtureId: number, actor: Actor): void {
  const fixture = getFixtureOrThrow(ctx, fixtureId);
  if (fixture.status !== 'scheduled' && fixture.status !== 'live') {
    throw badRequest('FIXTURE_NOT_POSTPONABLE', 'ניתן לדחות רק משחק שטרם הסתיים');
  }

  ctx.db.transaction(() => {
    voidPredictions(ctx, fixture.id, actor, 'fixture.postponed_predictions_voided');
    ctx.db
      .update(fixtures)
      .set({ status: 'postponed', homeScore: null, awayScore: null, liveMinute: null })
      .where(eq(fixtures.id, fixture.id))
      .run();
    recomputeRoundLock(ctx, fixture.roundId);
    audit(ctx.db, actor, 'fixture.postponed', 'fixture', fixture.id, { status: fixture.status }, { status: 'postponed' });
  });

  ctx.events?.onFixturePostponed(fixture.id);
  maybeCloseRound(ctx, fixture.roundId);
}

/**
 * A postponed game gets a new date → it becomes a completion game (משחק
 * השלמה): predictions reopen 7 days before the new kickoff, stay private
 * until that kickoff, and its points join the season total when it ends.
 */
export function rescheduleFixture(
  ctx: EngineCtx,
  fixtureId: number,
  newKickoffMs: number,
  actor: Actor,
): void {
  const fixture = getFixtureOrThrow(ctx, fixtureId);
  if (fixture.status !== 'postponed') {
    throw badRequest('FIXTURE_NOT_POSTPONED', 'ניתן לקבוע מועד חדש רק למשחק דחוי');
  }
  if (newKickoffMs <= ctx.clock.now().getTime()) {
    throw badRequest('KICKOFF_IN_PAST', 'המועד החדש חייב להיות בעתיד');
  }

  ctx.db.transaction(() => {
    ctx.db
      .update(fixtures)
      .set({
        status: 'scheduled',
        isCompletion: true,
        kickoffAt: new Date(newKickoffMs),
        predictionOpenAt: new Date(newKickoffMs - COMPLETION_REOPEN_MS),
        homeScore: null,
        awayScore: null,
        liveMinute: null,
        finalizedAt: null,
      })
      .where(eq(fixtures.id, fixture.id))
      .run();
    recomputeRoundLock(ctx, fixture.roundId);
    audit(ctx.db, actor, 'fixture.rescheduled', 'fixture', fixture.id, {
      kickoffAt: fixture.kickoffAt.getTime(),
    }, { kickoffAt: newKickoffMs, isCompletion: true });
  });

  ctx.events?.onCompletionScheduled(fixture.id);
}

/** A cancelled game never awards points; its predictions are voided. */
export function cancelFixture(ctx: EngineCtx, fixtureId: number, actor: Actor): void {
  const fixture = getFixtureOrThrow(ctx, fixtureId);
  if (fixture.status === 'finished' || fixture.status === 'cancelled') {
    throw badRequest('FIXTURE_NOT_CANCELLABLE', 'לא ניתן לבטל משחק שכבר הסתיים');
  }

  ctx.db.transaction(() => {
    voidPredictions(ctx, fixture.id, actor, 'fixture.cancelled_predictions_voided');
    ctx.db
      .update(fixtures)
      .set({ status: 'cancelled', homeScore: null, awayScore: null, liveMinute: null })
      .where(eq(fixtures.id, fixture.id))
      .run();
    recomputeRoundLock(ctx, fixture.roundId);
    audit(ctx.db, actor, 'fixture.cancelled', 'fixture', fixture.id, { status: fixture.status }, { status: 'cancelled' });
  });

  maybeCloseRound(ctx, fixture.roundId);
}
