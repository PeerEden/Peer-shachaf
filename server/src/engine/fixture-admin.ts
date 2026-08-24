import { eq } from 'drizzle-orm';
import { fixtures, rounds, teams } from '../db/schema.js';
import { audit, type Actor } from '../lib/audit.js';
import { badRequest, notFound } from '../lib/http-error.js';
import { maybeCloseRound, recomputeClosedRounds, recomputeRoundLock } from './round-lifecycle.js';
import type { EngineCtx } from './types.js';

type FixtureRow = typeof fixtures.$inferSelect;

export async function createFixture(
  ctx: EngineCtx,
  input: { roundId: number; homeTeamId: number; awayTeamId: number; kickoffAt: number },
  actor: Actor,
): Promise<FixtureRow> {
  const { db } = ctx;
  const [round] = await db.select().from(rounds).where(eq(rounds.id, input.roundId));
  if (!round) throw notFound('המחזור לא נמצא');
  if (round.status === 'closed') {
    throw badRequest('ROUND_CLOSED', 'לא ניתן להוסיף משחק למחזור שהסתיים');
  }
  for (const teamId of [input.homeTeamId, input.awayTeamId]) {
    if (!(await db.select().from(teams).where(eq(teams.id, teamId)))[0]) {
      throw notFound('קבוצה לא נמצאה');
    }
  }

  const fixture = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(fixtures)
      .values({
        roundId: round.id,
        seasonId: round.seasonId,
        homeTeamId: input.homeTeamId,
        awayTeamId: input.awayTeamId,
        kickoffAt: new Date(input.kickoffAt),
        createdAt: ctx.clock.now(),
      })
      .returning();
    await recomputeRoundLock({ ...ctx, db: tx }, round.id);
    await audit(tx, actor, 'fixture.created', 'fixture', created!.id, null, input);
    return created!;
  });
  return fixture;
}

export async function updateFixtureSchedule(
  ctx: EngineCtx,
  fixtureId: number,
  input: { kickoffAt?: number; homeTeamId?: number; awayTeamId?: number },
  actor: Actor,
): Promise<FixtureRow> {
  const { db } = ctx;
  const [fixture] = await db.select().from(fixtures).where(eq(fixtures.id, fixtureId));
  if (!fixture) throw notFound('המשחק לא נמצא');
  if (fixture.status !== 'scheduled') {
    throw badRequest('FIXTURE_NOT_EDITABLE', 'ניתן לערוך רק משחק שטרם התחיל');
  }

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(fixtures)
      .set({
        ...(input.kickoffAt !== undefined ? { kickoffAt: new Date(input.kickoffAt) } : {}),
        ...(input.homeTeamId !== undefined ? { homeTeamId: input.homeTeamId } : {}),
        ...(input.awayTeamId !== undefined ? { awayTeamId: input.awayTeamId } : {}),
        ...(fixture.isCompletion && input.kickoffAt !== undefined
          ? { predictionOpenAt: new Date(input.kickoffAt - 7 * 24 * 60 * 60 * 1000) }
          : {}),
      })
      .where(eq(fixtures.id, fixture.id))
      .returning();
    await recomputeRoundLock({ ...ctx, db: tx }, fixture.roundId);
    await audit(tx, actor, 'fixture.updated', 'fixture', fixture.id, {
      kickoffAt: fixture.kickoffAt.getTime(),
      homeTeamId: fixture.homeTeamId,
      awayTeamId: fixture.awayTeamId,
    }, input);
    return updated!;
  });
}

export async function deleteFixture(ctx: EngineCtx, fixtureId: number, actor: Actor): Promise<void> {
  const { db } = ctx;
  const [fixture] = await db.select().from(fixtures).where(eq(fixtures.id, fixtureId));
  if (!fixture) throw notFound('המשחק לא נמצא');
  const [round] = await db.select().from(rounds).where(eq(rounds.id, fixture.roundId));

  await db.transaction(async (tx) => {
    await tx.delete(fixtures).where(eq(fixtures.id, fixture.id));
    await recomputeRoundLock({ ...ctx, db: tx }, fixture.roundId);
    await audit(tx, actor, 'fixture.deleted', 'fixture', fixture.id, fixture, null);
  });
  if (round?.status === 'closed') {
    await recomputeClosedRounds(ctx, round.seasonId);
  } else {
    // The deleted game may have been the last unfinished one — let the round close.
    await maybeCloseRound(ctx, fixture.roundId);
  }
}
