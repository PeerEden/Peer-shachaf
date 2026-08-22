import { eq } from 'drizzle-orm';
import { fixtures, predictions, rounds, users } from '../db/schema.js';
import { audit, type Actor } from '../lib/audit.js';
import { badRequest, notFound } from '../lib/http-error.js';
import { recomputeClosedRounds } from './round-lifecycle.js';
import { recomputeFixtureScores } from './scoring-engine.js';
import type { EngineCtx } from './types.js';

/**
 * Exceptional admin correction of a user's prediction — bypasses the round
 * lock by design (league rule: admin may fix in edge cases), always audited.
 * If the fixture is already finished, points are recomputed and closed-round
 * snapshots healed.
 */
export function adminFixPrediction(
  ctx: EngineCtx,
  input: { userId: number; fixtureId: number; homePred: number; awayPred: number },
  actor: Actor,
): void {
  const { db } = ctx;
  const fixture = db.select().from(fixtures).where(eq(fixtures.id, input.fixtureId)).get();
  if (!fixture) throw notFound('המשחק לא נמצא');
  if (fixture.status === 'cancelled' || fixture.status === 'postponed') {
    throw badRequest('FIXTURE_NOT_PREDICTABLE', 'אין ניחושים למשחק דחוי או מבוטל');
  }
  const user = db.select().from(users).where(eq(users.id, input.userId)).get();
  if (!user) throw notFound('המשתמש לא נמצא');

  const existing = db
    .select()
    .from(predictions)
    .where(eq(predictions.fixtureId, input.fixtureId))
    .all()
    .find((p) => p.userId === input.userId);

  db.transaction(() => {
    const now = ctx.clock.now();
    db.insert(predictions)
      .values({
        userId: input.userId,
        fixtureId: input.fixtureId,
        homePred: input.homePred,
        awayPred: input.awayPred,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [predictions.userId, predictions.fixtureId],
        set: { homePred: input.homePred, awayPred: input.awayPred, updatedAt: now },
      })
      .run();
    audit(
      db,
      actor,
      'prediction.admin_fixed',
      'prediction',
      `${input.userId}:${input.fixtureId}`,
      existing ? { homePred: existing.homePred, awayPred: existing.awayPred } : null,
      { homePred: input.homePred, awayPred: input.awayPred },
    );
    if (fixture.status === 'finished') {
      recomputeFixtureScores(ctx, fixture);
    }
  });

  if (fixture.status === 'finished') {
    const round = db.select().from(rounds).where(eq(rounds.id, fixture.roundId)).get();
    if (round?.status === 'closed') recomputeClosedRounds(ctx, round.seasonId);
  }
}

/**
 * Full participant removal (league rule): the user row is hard-deleted and
 * every FK cascades — predictions, scores, stats, sessions, subscriptions.
 * Closed-round snapshots are healed so past ranks make sense without them;
 * season honors and the audit log keep their denormalized name.
 */
export function adminDeleteUser(ctx: EngineCtx, targetUserId: number, actor: Actor): { avatarPath: string | null } {
  const { db } = ctx;
  const target = db.select().from(users).where(eq(users.id, targetUserId)).get();
  if (!target) throw notFound('המשתמש לא נמצא');
  if (actor.id === target.id) throw badRequest('CANNOT_DELETE_SELF', 'מנהל לא יכול למחוק את עצמו');

  db.transaction(() => {
    db.delete(users).where(eq(users.id, target.id)).run();
    audit(db, actor, 'user.deleted', 'user', target.id, {
      username: target.username,
      displayName: target.displayName,
      phone: target.phone,
    }, null);
  });

  const activeSeasons = db.select().from(rounds).all();
  const seasonIds = [...new Set(activeSeasons.map((r) => r.seasonId))];
  for (const seasonId of seasonIds) recomputeClosedRounds(ctx, seasonId);

  return { avatarPath: target.avatarPath };
}

export function adminSetRole(
  ctx: EngineCtx,
  targetUserId: number,
  role: 'USER' | 'ADMIN',
  actor: Actor,
): void {
  const { db } = ctx;
  const target = db.select().from(users).where(eq(users.id, targetUserId)).get();
  if (!target) throw notFound('המשתמש לא נמצא');
  if (actor.id === target.id && role !== 'ADMIN') {
    throw badRequest('CANNOT_DEMOTE_SELF', 'מנהל לא יכול להוריד את ההרשאות של עצמו');
  }
  db.update(users).set({ role }).where(eq(users.id, target.id)).run();
  audit(db, actor, 'user.role_changed', 'user', target.id, { role: target.role }, { role });
}
