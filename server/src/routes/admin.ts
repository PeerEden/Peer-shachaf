import fs from 'node:fs';
import path from 'node:path';
import {
  fixtureSchema,
  liveUpdateSchema,
  passwordSchema,
  resultSchema,
  roundCreateSchema,
  teamSchema,
} from '../../../shared/src/index.js';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { Router, type Request } from 'express';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { requireAdmin } from '../auth/middleware.js';
import { adminSetPassword, destroyOtherSessions } from '../auth/service.js';
import { config, dataPath } from '../config.js';
import {
  auditLog,
  fixtures,
  leagueSettings,
  predictionScores,
  predictions,
  roundTitles,
  roundUserStats,
  rounds,
  seasonHonors,
  seasons,
  teams,
  users,
} from '../db/schema.js';
import { adminDeleteUser, adminFixPrediction, adminSetRole } from '../engine/admin-actions.js';
import { createFixture, deleteFixture, updateFixtureSchedule } from '../engine/fixture-admin.js';
import { cancelFixture, postponeFixture, rescheduleFixture } from '../engine/postpone.js';
import { enterFinalResult, updateLiveScore } from '../engine/scoring-engine.js';
import { openNextRound } from '../engine/round-lifecycle.js';
import { archiveSeason, startSeason } from '../engine/season.js';
import { audit, type Actor } from '../lib/audit.js';
import { toUserPrivate, toUserPublic } from '../lib/dto.js';
import { badRequest, notFound } from '../lib/http-error.js';
import { getTeamsMap, toFixtureDto, toRoundDto } from '../services/round-view.js';

function actorOf(req: Request): Actor {
  return { id: req.user!.id, name: req.user!.displayName };
}

const idParam = (raw: string | undefined) => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw notFound();
  return id;
};

export function adminRoutes(deps: AppDeps): Router {
  const router = Router();
  const { db } = deps;
  const ctx = deps;

  router.use(requireAdmin);

  // ---- Users ----
  router.get('/users', async (_req, res) => {
    const allUsers = await db.select().from(users);
    const allPredictions = await db.select({ userId: predictions.userId }).from(predictions);
    const counts = new Map<number, number>();
    for (const p of allPredictions) counts.set(p.userId, (counts.get(p.userId) ?? 0) + 1);
    res.json({
      users: allUsers.map((u) => ({ ...toUserPrivate(u), predictionsCount: counts.get(u.id) ?? 0 })),
    });
  });

  router.delete('/users/:id', async (req, res) => {
    const { avatarPath } = await adminDeleteUser(ctx, idParam(req.params.id), actorOf(req));
    if (avatarPath) fs.rmSync(path.join(dataPath('uploads'), avatarPath), { force: true });
    res.json({ ok: true });
  });

  router.post('/users/:id/promote', async (req, res) => {
    await adminSetRole(ctx, idParam(req.params.id), 'ADMIN', actorOf(req));
    res.json({ ok: true });
  });

  router.post('/users/:id/demote', async (req, res) => {
    await adminSetRole(ctx, idParam(req.params.id), 'USER', actorOf(req));
    res.json({ ok: true });
  });

  router.post('/users/:id/reset-password', async (req, res) => {
    const userId = idParam(req.params.id);
    const { newPassword } = z.object({ newPassword: passwordSchema }).parse(req.body);
    const [target] = await db.select().from(users).where(eq(users.id, userId));
    if (!target) throw notFound('המשתמש לא נמצא');
    await adminSetPassword(db, userId, newPassword);
    await destroyOtherSessions(db, userId);
    await audit(db, actorOf(req), 'user.password_reset', 'user', userId, null, null);
    res.json({ ok: true });
  });

  // ---- Teams ----
  router.get('/teams', async (_req, res) => {
    res.json({ teams: await db.select().from(teams) });
  });

  router.post('/teams', async (req, res) => {
    const input = teamSchema.parse(req.body);
    const [created] = await db
      .insert(teams)
      .values({ name: input.name, shortName: input.shortName, color: input.color })
      .returning();
    await audit(db, actorOf(req), 'team.created', 'team', created!.id, null, input);
    res.status(201).json({ team: created });
  });

  router.patch('/teams/:id', async (req, res) => {
    const teamId = idParam(req.params.id);
    const input = teamSchema.partial().parse(req.body);
    const [before] = await db.select().from(teams).where(eq(teams.id, teamId));
    if (!before) throw notFound('הקבוצה לא נמצאה');
    const [updated] = await db.update(teams).set(input).where(eq(teams.id, teamId)).returning();
    await audit(db, actorOf(req), 'team.updated', 'team', teamId, before, input);
    res.json({ team: updated });
  });

  router.delete('/teams/:id', async (req, res) => {
    const teamId = idParam(req.params.id);
    const [before] = await db.select().from(teams).where(eq(teams.id, teamId));
    if (!before) throw notFound('הקבוצה לא נמצאה');
    try {
      await db.delete(teams).where(eq(teams.id, teamId));
    } catch {
      throw badRequest('TEAM_IN_USE', 'לקבוצה יש משחקים — אפשר לסמן אותה כלא פעילה במקום');
    }
    await audit(db, actorOf(req), 'team.deleted', 'team', teamId, before, null);
    res.json({ ok: true });
  });

  // ---- Rounds ----
  router.post('/rounds', async (req, res) => {
    const input = roundCreateSchema.parse(req.body);
    const [created] = await db
      .insert(rounds)
      .values({ ...input, status: 'pending' })
      .returning();
    await audit(db, actorOf(req), 'round.created', 'round', created!.id, null, input);
    res.status(201).json({ round: created });
  });

  router.patch('/rounds/:id', async (req, res) => {
    const roundId = idParam(req.params.id);
    const input = z.object({ name: z.string().trim().min(1).max(30) }).parse(req.body);
    const [before] = await db.select().from(rounds).where(eq(rounds.id, roundId));
    if (!before) throw notFound('המחזור לא נמצא');
    const [updated] = await db.update(rounds).set(input).where(eq(rounds.id, roundId)).returning();
    await audit(db, actorOf(req), 'round.updated', 'round', roundId, { name: before.name }, input);
    res.json({ round: updated });
  });

  /** Safety hatch: manually open the next pending round (normally automatic). */
  router.post('/rounds/open-next', async (req, res) => {
    const season = (await db.select().from(rounds)).find((r) => r.status === 'open');
    if (season) throw badRequest('ROUND_ALREADY_OPEN', 'כבר יש מחזור פתוח');
    const [anyRound] = await db.select().from(rounds).orderBy(desc(rounds.id));
    if (!anyRound) throw notFound('אין מחזורים');
    const opened = await openNextRound(ctx, anyRound.seasonId);
    await audit(db, actorOf(req), 'round.manually_opened', 'round', opened, null, null);
    res.json({ openedRoundId: opened });
  });

  // ---- Fixtures ----
  router.post('/fixtures', async (req, res) => {
    const input = fixtureSchema.parse(req.body);
    const fixture = await createFixture(ctx, input, actorOf(req));
    res.status(201).json({ fixture });
  });

  router.patch('/fixtures/:id', async (req, res) => {
    const input = z
      .object({
        kickoffAt: z.number().int().positive().optional(),
        homeTeamId: z.number().int().positive().optional(),
        awayTeamId: z.number().int().positive().optional(),
      })
      .parse(req.body);
    const fixture = await updateFixtureSchedule(ctx, idParam(req.params.id), input, actorOf(req));
    res.json({ fixture });
  });

  router.delete('/fixtures/:id', async (req, res) => {
    await deleteFixture(ctx, idParam(req.params.id), actorOf(req));
    res.json({ ok: true });
  });

  router.post('/fixtures/:id/result', async (req, res) => {
    const input = resultSchema.parse(req.body);
    await enterFinalResult(ctx, idParam(req.params.id), input, actorOf(req));
    res.json({ ok: true });
  });

  router.patch('/fixtures/:id/live', async (req, res) => {
    const input = liveUpdateSchema.parse(req.body);
    await updateLiveScore(ctx, idParam(req.params.id), input, actorOf(req));
    res.json({ ok: true });
  });

  router.post('/fixtures/:id/postpone', async (req, res) => {
    await postponeFixture(ctx, idParam(req.params.id), actorOf(req));
    res.json({ ok: true });
  });

  router.post('/fixtures/:id/reschedule', async (req, res) => {
    const { kickoffAt } = z.object({ kickoffAt: z.number().int().positive() }).parse(req.body);
    await rescheduleFixture(ctx, idParam(req.params.id), kickoffAt, actorOf(req));
    res.json({ ok: true });
  });

  router.post('/fixtures/:id/cancel', async (req, res) => {
    await cancelFixture(ctx, idParam(req.params.id), actorOf(req));
    res.json({ ok: true });
  });

  /**
   * Everything needed to fill in predictions by hand for one round: its
   * fixtures (with the real result so far), every player, and every existing
   * prediction. Admin-only, so unlike the player-facing round view this is
   * deliberately NOT filtered by the round-lock privacy rule.
   */
  router.get('/rounds/:id/predictions', async (req, res) => {
    const roundId = idParam(req.params.id);
    const [round] = await db.select().from(rounds).where(eq(rounds.id, roundId));
    if (!round) throw notFound('המחזור לא נמצא');

    const roundFixtures = await db
      .select()
      .from(fixtures)
      .where(eq(fixtures.roundId, roundId))
      .orderBy(asc(fixtures.kickoffAt), asc(fixtures.id));
    const fixtureIds = roundFixtures.map((f) => f.id);
    const rows = fixtureIds.length
      ? await db.select().from(predictions).where(inArray(predictions.fixtureId, fixtureIds))
      : [];
    const teamsMap = await getTeamsMap(db);

    res.json({
      round: toRoundDto(round, roundFixtures, deps.clock.now()),
      fixtures: roundFixtures.map((f) => toFixtureDto(f, teamsMap)),
      users: (await db.select().from(users)).map(toUserPublic),
      predictions: rows.map((p) => ({
        userId: p.userId,
        fixtureId: p.fixtureId,
        homePred: p.homePred,
        awayPred: p.awayPred,
      })),
    });
  });

  // ---- Exceptional prediction fix ----
  router.put('/predictions', async (req, res) => {
    const input = z
      .object({
        userId: z.number().int().positive(),
        fixtureId: z.number().int().positive(),
        homePred: z.number().int().min(0).max(99),
        awayPred: z.number().int().min(0).max(99),
      })
      .parse(req.body);
    await adminFixPrediction(ctx, input, actorOf(req));
    res.json({ ok: true });
  });

  // ---- Audit log ----
  router.get('/audit', async (_req, res) => {
    const entries = await db.select().from(auditLog).orderBy(desc(auditLog.id)).limit(200);
    res.json({
      entries: entries.map((e) => ({
        id: e.id,
        actorName: e.actorName,
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId,
        before: e.beforeJson ? JSON.parse(e.beforeJson) : null,
        after: e.afterJson ? JSON.parse(e.afterJson) : null,
        createdAt: e.createdAt.getTime(),
      })),
    });
  });

  // ---- Seasons & settings ----
  router.post('/seasons/:id/archive', async (req, res) => {
    await archiveSeason(ctx, idParam(req.params.id), actorOf(req));
    res.json({ ok: true });
  });

  router.post('/seasons', async (req, res) => {
    const { name } = z.object({ name: z.string().trim().min(4).max(20) }).parse(req.body);
    const seasonId = await startSeason(ctx, name, actorOf(req));
    res.status(201).json({ seasonId });
  });

  router.patch('/settings', async (req, res) => {
    const input = z
      .object({
        inviteCode: z.string().trim().min(4).max(20).optional(),
        leagueName: z.string().trim().min(2).max(40).optional(),
      })
      .parse(req.body);
    const before = (await db.select().from(leagueSettings))[0];
    if (!before) throw notFound();
    const [updated] = await db
      .update(leagueSettings)
      .set(input)
      .where(eq(leagueSettings.id, before.id))
      .returning();
    await audit(db, actorOf(req), 'settings.updated', 'settings', before.id, {
      inviteCode: before.inviteCode,
      leagueName: before.leagueName,
    }, input);
    res.json({ settings: { inviteCode: updated!.inviteCode, leagueName: updated!.leagueName } });
  });

  router.get('/settings', async (_req, res) => {
    const settings = (await db.select().from(leagueSettings))[0];
    res.json({
      settings: settings
        ? { inviteCode: settings.inviteCode, leagueName: settings.leagueName }
        : null,
    });
  });

  /**
   * Portable snapshot of the whole league as JSON — the Postgres equivalent
   * of "copy the database file". It includes password hashes, exactly as the
   * old file-level backup did, so a restore brings everyone's logins with it.
   */
  router.get('/backup', async (_req, res) => {
    const [
      settings,
      allSeasons,
      allTeams,
      allUsers,
      allRounds,
      allFixtures,
      allPredictions,
      allScores,
      allRoundStats,
      allRoundTitles,
      allHonors,
    ] = await Promise.all([
      db.select().from(leagueSettings),
      db.select().from(seasons),
      db.select().from(teams),
      db.select().from(users),
      db.select().from(rounds),
      db.select().from(fixtures),
      db.select().from(predictions),
      db.select().from(predictionScores),
      db.select().from(roundUserStats),
      db.select().from(roundTitles),
      db.select().from(seasonHonors),
    ]);

    res.setHeader('Content-Disposition', 'attachment; filename="league-backup.json"');
    res.json({
      exportedAt: deps.clock.now().toISOString(),
      leagueSettings: settings,
      seasons: allSeasons,
      teams: allTeams,
      users: allUsers,
      rounds: allRounds,
      fixtures: allFixtures,
      predictions: allPredictions,
      predictionScores: allScores,
      roundUserStats: allRoundStats,
      roundTitles: allRoundTitles,
      seasonHonors: allHonors,
    });
  });

  // ---- Dev time-travel (only when DEV_TOOLS=1) ----
  if (config.devTools) {
    router.post('/dev/clock', (req, res) => {
      const { offsetMs } = z.object({ offsetMs: z.number().int() }).parse(req.body);
      const clock = deps.clock as { offsetMs?: number };
      if (typeof clock.offsetMs === 'number') {
        clock.offsetMs = offsetMs;
        res.json({ ok: true, now: deps.clock.now().getTime() });
      } else {
        throw badRequest('CLOCK_NOT_OFFSETTABLE', 'השרת לא רץ עם שעון ניתן להזזה');
      }
    });
  }

  return router;
}
