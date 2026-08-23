import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { eq } from 'drizzle-orm';
import { config } from '../config.js';
import type { Db } from '../db/index.js';
import { users } from '../db/schema.js';
import type { Clock } from '../lib/clock.js';
import { forbidden, unauthorized } from '../lib/http-error.js';
import { resolveSession, type SessionInfo } from './service.js';

export const SESSION_COOKIE = 'sid';

export function setSessionCookie(res: Response, session: SessionInfo): void {
  res.cookie(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    expires: session.expiresAt,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** Resolves the session cookie into req.user on every request (never rejects). */
export function attachUser(db: Db, clock: Clock): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const token = (req.cookies as Record<string, string | undefined>)[SESSION_COOKIE];
    if (token) {
      const resolved = resolveSession(db, clock, token);
      if (resolved) {
        req.user = resolved.user;
        req.sessionRowId = resolved.sessionRowId;
      }
    }
    if (!req.user && config.demoAutoLogin) {
      // Demo mode: sessions don't survive serverless instances anyway, so every
      // visitor is simply the seeded demo admin — no login screen at all.
      req.user = db.select().from(users).where(eq(users.username, 'dror')).get();
    }
    next();
  };
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) {
    next(unauthorized());
    return;
  }
  next();
};

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user) {
    next(unauthorized());
    return;
  }
  if (req.user.role !== 'ADMIN') {
    next(forbidden('ADMIN_ONLY', 'פעולה זו שמורה למנהל המערכת'));
    return;
  }
  next();
};
