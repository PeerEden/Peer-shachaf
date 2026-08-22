import fs from 'node:fs';
import path from 'node:path';
import { changePasswordSchema, updateProfileSchema } from '../../../shared/src/index.js';
import { and, eq, ne } from 'drizzle-orm';
import { Router } from 'express';
import multer from 'multer';
import type { AppDeps } from '../app.js';
import { requireAuth } from '../auth/middleware.js';
import { changePassword, destroyOtherSessions } from '../auth/service.js';
import { dataPath } from '../config.js';
import { users } from '../db/schema.js';
import { toUserPrivate } from '../lib/dto.js';
import { badRequest, conflict } from '../lib/http-error.js';

const AVATAR_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype in AVATAR_TYPES);
  },
});

export function profileRoutes(deps: AppDeps): Router {
  const router = Router();
  const { db } = deps;

  router.use(requireAuth);

  router.patch('/', (req, res) => {
    const user = req.user!;
    const input = updateProfileSchema.parse(req.body);

    if (input.phone && input.phone !== user.phone) {
      const clash = db
        .select()
        .from(users)
        .where(and(eq(users.phone, input.phone), ne(users.id, user.id)))
        .get();
      if (clash) throw conflict('PHONE_TAKEN', 'מספר הטלפון כבר רשום במערכת');
    }

    const updated = db
      .update(users)
      .set({
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
      })
      .where(eq(users.id, user.id))
      .returning()
      .get();
    res.json({ user: toUserPrivate(updated) });
  });

  router.post('/password', (req, res) => {
    const user = req.user!;
    const input = changePasswordSchema.parse(req.body);
    changePassword(db, user, input.currentPassword, input.newPassword);
    destroyOtherSessions(db, user.id, req.sessionRowId);
    res.json({ ok: true });
  });

  router.post('/avatar', upload.single('avatar'), (req, res) => {
    const user = req.user!;
    if (!req.file) throw badRequest('BAD_AVATAR', 'קובץ תמונה לא תקין (עד 5MB, JPG/PNG/WebP)');

    const ext = AVATAR_TYPES[req.file.mimetype]!;
    const filename = `avatar-${user.id}-${Date.now()}.${ext}`;
    const uploadsDir = dataPath('uploads');
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.writeFileSync(path.join(uploadsDir, filename), req.file.buffer);

    if (user.avatarPath) {
      fs.rmSync(path.join(uploadsDir, user.avatarPath), { force: true });
    }

    const updated = db
      .update(users)
      .set({ avatarPath: filename })
      .where(eq(users.id, user.id))
      .returning()
      .get();
    res.json({ user: toUserPrivate(updated) });
  });

  return router;
}
