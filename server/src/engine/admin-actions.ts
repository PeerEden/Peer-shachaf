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
export async function adminFixPrediction(
  ctx: EngineCtx,
  input: { userId: number; fixtureId: number; homePred: number; awayPred: number },
  actor: Actor,
): Promise<void> {
  const { db } = ctx;
  const [fixture] = await db.select().from(fixtures).where(eq(fixtures.id, input.fixtureId));
  if (!fixture) throw notFound('המשחק לא נמצא');
  if (fixture.status === 'cancelled' || fixture.status === 'postponed') {
    throw badRequest('FIXTURE_NOT_PREDICTABLE', 'אין ניחושים למשחק דחוי או מבוטל');
  }
  const [user] = await db.select().from(users).where(eq(users.id, input.userId));
  if (!user) throw notFound('המשתמש לא נמצא');

  const existing = (
    await db
      .select()
      .from(predictions)
      .where(eq(predictions.fixtureId, input.fixtureId))
  ).find((p) => p.userId === input.userId);

  await db.transaction(async (tx) => {
    const now = ctx.clock.now();
    await tx.insert(predictions)
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
      });
    await audit(
      tx,
      actor,
      'prediction.admin_fixed',
      'prediction',
      `${input.userId}:${input.fixtureId}`,
      existing ? { homePred: existing.homePred, awayPred: existing.awayPred } : null,
      { homePred: input.homePred, awayPred: input.awayPred },
    );
    if (fixture.status === 'finished') {
      await recomputeFixtureScores({ ...ctx, db: tx }, fixture);
    }
  });

  if (fixture.status === 'finished') {
    const [round] = await db.select().from(rounds).where(eq(rounds.id, fixture.roundId));
    if (round?.status === 'closed') await recomputeClosedRounds(ctx, round.seasonId);
  }
}

/**
 * Full participant removal (league rule): the user row is hard-deleted and
 * every FK cascades — predictions, scores, stats, sessions, subscriptions.
 * Closed-round snapshots are healed so past ranks make sense without them;
 * season honors and the audit log keep their denormalized name.
 */
export async function adminDeleteUser(ctx: EngineCtx, targetUserId: number, actor: Actor): Promise<{ avatarPath: string | null }> {
  const { db } = ctx;
  const [target] = await db.select().from(users).where(eq(users.id, targetUserId));
  if (!target) throw notFound('המשתמש לא נמצא');
  if (actor.id === target.id) throw badRequest('CANNOT_DELETE_SELF', 'מנהל לא יכול למחוק את עצמו');

  await db.transaction(async (tx) => {
    await tx.delete(users).where(eq(users.id, target.id));
    await audit(tx, actor, 'user.deleted', 'user', target.id, {
      username: target.username,
      displayName: target.displayName,
      phone: target.phone,
    }, null);
  });

  const activeSeasons = await db.select().from(rounds);
  const seasonIds = [...new Set(activeSeasons.map((r) => r.seasonId))];
  for (const seasonId of seasonIds) await recomputeClosedRounds(ctx, seasonId);

  return { avatarPath: target.avatarPath };
}

export async function adminSetRole(
  ctx: EngineCtx,
  targetUserId: number,
  role: 'USER' | 'ADMIN',
  actor: Actor,
): Promise<void> {
  const { db } = ctx;
  const [target] = await db.select().from(users).where(eq(users.id, targetUserId));
  if (!target) throw notFound('המשתמש לא נמצא');
  if (actor.id === target.id && role !== 'ADMIN') {
    throw badRequest('CANNOT_DEMOTE_SELF', 'מנהל לא יכול להוריד את ההרשאות של עצמו');
  }
  await db.update(users).set({ role }).where(eq(users.id, target.id));
  await audit(db, actor, 'user.role_changed', 'user', target.id, { role: target.role }, { role });
}
