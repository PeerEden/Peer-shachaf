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
import { desc, eq } from 'drizzle-orm';
import { Router, type Request } from 'express';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { requireAdmin } from '../auth/middleware.js';
import { adminSetPassword, destroyOtherSessions } from '../auth/service.js';
import { config, dataPath } from '../config.js';
import { backupTo } from '../db/index.js';
import {
  auditLog,
  fixtures,
  leagueSettings,
  predictions,
  rounds,
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
import { toUserPrivate } from '../lib/dto.js';
import { badRequest, notFound } from '../lib/http-error.js';

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
  router.get('/users', (_req, res) => {
    const allUsers = db.select().from(users).all();
    const allPredictions = db.select({ userId: predictions.userId }).from(predictions).all();
    const counts = new Map<number, number>();
    for (const p of allPredictions) counts.set(p.userId, (counts.get(p.userId) ?? 0) + 1);
    res.json({
      users: allUsers.map((u) => ({ ...toUserPrivate(u), predictionsCount: counts.get(u.id) ?? 0 })),
    });
  });

  router.delete('/users/:id', (req, res) => {
    const { avatarPath } = adminDeleteUser(ctx, idParam(req.params.id), actorOf(req));
    if (avatarPath) fs.rmSync(path.join(dataPath('uploads'), avatarPath), { force: true });
    res.json({ ok: true });
  });

  router.post('/users/:id/promote', (req, res) => {
    adminSetRole(ctx, idParam(req.params.id), 'ADMIN', actorOf(req));
    res.json({ ok: true });
  });

  router.post('/users/:id/demote', (req, res) => {
    adminSetRole(ctx, idParam(req.params.id), 'USER', actorOf(req));
    res.json({ ok: true });
  });

  router.post('/users/:id/reset-password', (req, res) => {
    const userId = idParam(req.params.id);
    const { newPassword } = z.object({ newPassword: passwordSchema }).parse(req.body);
    const target = db.select().from(users).where(eq(users.id, userId)).get();
    if (!target) throw notFound('המשתמש לא נמצא');
    adminSetPassword(db, userId, newPassword);
    destroyOtherSessions(db, userId);
    audit(db, actorOf(req), 'user.password_reset', 'user', userId, null, null);
    res.json({ ok: true });
  });

  // ---- Teams ----
  router.get('/teams', (_req, res) => {
    res.json({ teams: db.select().from(teams).all() });
  });

  router.post('/teams', (req, res) => {
    const input = teamSchema.parse(req.body);
    const created = db
      .insert(teams)
      .values({ name: input.name, shortName: input.shortName, color: input.color })
      .returning()
      .get();
    audit(db, actorOf(req), 'team.created', 'team', created.id, null, input);
    res.status(201).json({ team: created });
  });

  router.patch('/teams/:id', (req, res) => {
    const teamId = idParam(req.params.id);
    const input = teamSchema.partial().parse(req.body);
    const before = db.select().from(teams).where(eq(teams.id, teamId)).get();
    if (!before) throw notFound('הקבוצה לא נמצאה');
    const updated = db.update(teams).set(input).where(eq(teams.id, teamId)).returning().get();
    audit(db, actorOf(req), 'team.updated', 'team', teamId, before, input);
    res.json({ team: updated });
  });

  router.delete('/teams/:id', (req, res) => {
    const teamId = idParam(req.params.id);
    const before = db.select().from(teams).where(eq(teams.id, teamId)).get();
    if (!before) throw notFound('הקבוצה לא נמצאה');
    try {
      db.delete(teams).where(eq(teams.id, teamId)).run();
    } catch {
      throw badRequest('TEAM_IN_USE', 'לקבוצה יש משחקים — אפשר לסמן אותה כלא פעילה במקום');
    }
    audit(db, actorOf(req), 'team.deleted', 'team', teamId, before, null);
    res.json({ ok: true });
  });

  // ---- Rounds ----
  router.post('/rounds', (req, res) => {
    const input = roundCreateSchema.parse(req.body);
    const created = db
      .insert(rounds)
      .values({ ...input, status: 'pending' })
      .returning()
      .get();
    audit(db, actorOf(req), 'round.created', 'round', created.id, null, input);
    res.status(201).json({ round: created });
  });

  router.patch('/rounds/:id', (req, res) => {
    const roundId = idParam(req.params.id);
    const input = z.object({ name: z.string().trim().min(1).max(30) }).parse(req.body);
    const before = db.select().from(rounds).where(eq(rounds.id, roundId)).get();
    if (!before) throw notFound('המחזור לא נמצא');
    const updated = db.update(rounds).set(input).where(eq(rounds.id, roundId)).returning().get();
    audit(db, actorOf(req), 'round.updated', 'round', roundId, { name: before.name }, input);
    res.json({ round: updated });
  });

  /** Safety hatch: manually open the next pending round (normally automatic). */
  router.post('/rounds/open-next', (req, res) => {
    const season = db.select().from(rounds).all().find((r) => r.status === 'open');
    if (season) throw badRequest('ROUND_ALREADY_OPEN', 'כבר יש מחזור פתוח');
    const anyRound = db.select().from(rounds).orderBy(desc(rounds.id)).get();
    if (!anyRound) throw notFound('אין מחזורים');
    const opened = openNextRound(ctx, anyRound.seasonId);
    audit(db, actorOf(req), 'round.manually_opened', 'round', opened, null, null);
    res.json({ openedRoundId: opened });
  });

  // ---- Fixtures ----
  router.post('/fixtures', (req, res) => {
    const input = fixtureSchema.parse(req.body);
    const fixture = createFixture(ctx, input, actorOf(req));
    res.status(201).json({ fixture });
  });

  router.patch('/fixtures/:id', (req, res) => {
    const input = z
      .object({
        kickoffAt: z.number().int().positive().optional(),
        homeTeamId: z.number().int().positive().optional(),
        awayTeamId: z.number().int().positive().optional(),
      })
      .parse(req.body);
    const fixture = updateFixtureSchedule(ctx, idParam(req.params.id), input, actorOf(req));
    res.json({ fixture });
  });

  router.delete('/fixtures/:id', (req, res) => {
    deleteFixture(ctx, idParam(req.params.id), actorOf(req));
    res.json({ ok: true });
  });

  router.post('/fixtures/:id/result', (req, res) => {
    const input = resultSchema.parse(req.body);
    enterFinalResult(ctx, idParam(req.params.id), input, actorOf(req));
    res.json({ ok: true });
  });

  router.patch('/fixtures/:id/live', (req, res) => {
    const input = liveUpdateSchema.parse(req.body);
    updateLiveScore(ctx, idParam(req.params.id), input, actorOf(req));
    res.json({ ok: true });
  });

  router.post('/fixtures/:id/postpone', (req, res) => {
    postponeFixture(ctx, idParam(req.params.id), actorOf(req));
    res.json({ ok: true });
  });

  router.post('/fixtures/:id/reschedule', (req, res) => {
    const { kickoffAt } = z.object({ kickoffAt: z.number().int().positive() }).parse(req.body);
    rescheduleFixture(ctx, idParam(req.params.id), kickoffAt, actorOf(req));
    res.json({ ok: true });
  });

  router.post('/fixtures/:id/cancel', (req, res) => {
    cancelFixture(ctx, idParam(req.params.id), actorOf(req));
    res.json({ ok: true });
  });

  // ---- Exceptional prediction fix ----
  router.put('/predictions', (req, res) => {
    const input = z
      .object({
        userId: z.number().int().positive(),
        fixtureId: z.number().int().positive(),
        homePred: z.number().int().min(0).max(99),
        awayPred: z.number().int().min(0).max(99),
      })
      .parse(req.body);
    adminFixPrediction(ctx, input, actorOf(req));
    res.json({ ok: true });
  });

  // ---- Audit log ----
  router.get('/audit', (_req, res) => {
    const entries = db.select().from(auditLog).orderBy(desc(auditLog.id)).limit(200).all();
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
  router.post('/seasons/:id/archive', (req, res) => {
    archiveSeason(ctx, idParam(req.params.id), actorOf(req));
    res.json({ ok: true });
  });

  router.post('/seasons', (req, res) => {
    const { name } = z.object({ name: z.string().trim().min(4).max(20) }).parse(req.body);
    const seasonId = startSeason(ctx, name, actorOf(req));
    res.status(201).json({ seasonId });
  });

  router.patch('/settings', (req, res) => {
    const input = z
      .object({
        inviteCode: z.string().trim().min(4).max(20).optional(),
        leagueName: z.string().trim().min(2).max(40).optional(),
      })
      .parse(req.body);
    const before = db.select().from(leagueSettings).all()[0];
    if (!before) throw notFound();
    const updated = db
      .update(leagueSettings)
      .set(input)
      .where(eq(leagueSettings.id, before.id))
      .returning()
      .get();
    audit(db, actorOf(req), 'settings.updated', 'settings', before.id, {
      inviteCode: before.inviteCode,
      leagueName: before.leagueName,
    }, input);
    res.json({ settings: { inviteCode: updated.inviteCode, leagueName: updated.leagueName } });
  });

  router.get('/settings', (_req, res) => {
    const settings = db.select().from(leagueSettings).all()[0];
    res.json({
      settings: settings
        ? { inviteCode: settings.inviteCode, leagueName: settings.leagueName }
        : null,
    });
  });

  router.get('/backup', (req, res, next) => {
    const dest = dataPath(`backup-${Date.now()}.db`);
    backupTo(db, dest)
      .then(() => {
        res.download(dest, 'league-backup.db', () => {
          fs.rmSync(dest, { force: true });
        });
      })
      .catch(next);
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
