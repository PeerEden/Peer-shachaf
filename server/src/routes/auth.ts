import { loginSchema, registerSchema } from '../../../shared/src/index.js';
import { Router } from 'express';
import type { AppDeps } from '../app.js';
import {
  clearSessionCookie,
  requireAuth,
  setSessionCookie,
} from '../auth/middleware.js';
import { destroySession, loginUser, registerUser } from '../auth/service.js';
import { toUserPrivate } from '../lib/dto.js';
import { rateLimit } from '../lib/rate-limit.js';

export function authRoutes(deps: AppDeps): Router {
  const router = Router();
  const { db, clock } = deps;
  const authLimiter = rateLimit(clock, { max: 20, windowMs: 15 * 60 * 1000 });

  router.post('/register', authLimiter, (req, res) => {
    const input = registerSchema.parse(req.body);
    const { user, session } = registerUser(db, clock, input, req.get('user-agent') ?? null);
    setSessionCookie(res, session);
    res.status(201).json({ user: toUserPrivate(user) });
  });

  router.post('/login', authLimiter, (req, res) => {
    const input = loginSchema.parse(req.body);
    const { user, session } = loginUser(
      db,
      clock,
      input.username,
      input.password,
      req.get('user-agent') ?? null,
    );
    setSessionCookie(res, session);
    res.json({ user: toUserPrivate(user) });
  });

  router.post('/logout', requireAuth, (req, res) => {
    if (req.sessionRowId !== undefined) destroySession(db, req.sessionRowId);
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  router.get('/me', (req, res) => {
    res.json({ user: req.user ? toUserPrivate(req.user) : null });
  });

  return router;
}
