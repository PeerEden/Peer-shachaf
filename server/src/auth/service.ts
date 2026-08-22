import type { RegisterInput } from '@league/shared';
import bcrypt from 'bcryptjs';
import { and, eq, lt, or } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { leagueSettings, sessions, users } from '../db/schema.js';
import type { Clock } from '../lib/clock.js';
import { generateToken, sha256 } from '../lib/crypto.js';
import { badRequest, conflict, unauthorized } from '../lib/http-error.js';

const SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000;
/** Extend the session when more than this much of its lifetime was consumed. */
const SESSION_RENEW_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
const BCRYPT_COST = 11;

type UserRow = typeof users.$inferSelect;

export interface SessionInfo {
  token: string;
  expiresAt: Date;
}

export function registerUser(
  db: Db,
  clock: Clock,
  input: RegisterInput,
  userAgent: string | null,
): { user: UserRow; session: SessionInfo } {
  const settings = db.select().from(leagueSettings).all()[0];
  if (!settings) throw badRequest('LEAGUE_NOT_SEEDED', 'הליגה עוד לא הוקמה');
  if (input.inviteCode.trim().toUpperCase() !== settings.inviteCode.toUpperCase()) {
    throw badRequest('BAD_INVITE_CODE', 'קוד הכניסה לליגה שגוי');
  }

  const clash = db
    .select()
    .from(users)
    .where(or(eq(users.username, input.username), eq(users.phone, input.phone)))
    .all();
  if (clash.some((u) => u.username === input.username)) {
    throw conflict('USERNAME_TAKEN', 'שם המשתמש כבר תפוס');
  }
  if (clash.some((u) => u.phone === input.phone)) {
    throw conflict('PHONE_TAKEN', 'מספר הטלפון כבר רשום במערכת');
  }

  const user = db
    .insert(users)
    .values({
      username: input.username,
      passwordHash: bcrypt.hashSync(input.password, BCRYPT_COST),
      displayName: input.displayName,
      phone: input.phone,
      createdAt: clock.now(),
    })
    .returning()
    .get();

  return { user, session: createSession(db, clock, user.id, userAgent) };
}

export function loginUser(
  db: Db,
  clock: Clock,
  username: string,
  password: string,
  userAgent: string | null,
): { user: UserRow; session: SessionInfo } {
  const user = db.select().from(users).where(eq(users.username, username)).get();
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    throw unauthorized('שם משתמש או סיסמה שגויים');
  }
  return { user, session: createSession(db, clock, user.id, userAgent) };
}

export function createSession(
  db: Db,
  clock: Clock,
  userId: number,
  userAgent: string | null,
): SessionInfo {
  const token = generateToken();
  const now = clock.now();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  db.insert(sessions)
    .values({
      tokenHash: sha256(token),
      userId,
      createdAt: now,
      expiresAt,
      lastSeenAt: now,
      userAgent,
    })
    .run();
  return { token, expiresAt };
}

export function resolveSession(
  db: Db,
  clock: Clock,
  token: string,
): { user: UserRow; sessionRowId: number } | null {
  const now = clock.now();
  const row = db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, sha256(token)))
    .get();
  if (!row) return null;
  if (row.session.expiresAt.getTime() <= now.getTime()) {
    db.delete(sessions).where(eq(sessions.id, row.session.id)).run();
    return null;
  }

  const consumed = SESSION_TTL_MS - (row.session.expiresAt.getTime() - now.getTime());
  if (consumed > SESSION_RENEW_AFTER_MS) {
    db.update(sessions)
      .set({ expiresAt: new Date(now.getTime() + SESSION_TTL_MS), lastSeenAt: now })
      .where(eq(sessions.id, row.session.id))
      .run();
  } else if (now.getTime() - row.session.lastSeenAt.getTime() > 60 * 60 * 1000) {
    db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, row.session.id)).run();
  }

  return { user: row.user, sessionRowId: row.session.id };
}

export function destroySession(db: Db, sessionRowId: number): void {
  db.delete(sessions).where(eq(sessions.id, sessionRowId)).run();
}

export function purgeExpiredSessions(db: Db, clock: Clock): void {
  db.delete(sessions).where(lt(sessions.expiresAt, clock.now())).run();
}

export function changePassword(
  db: Db,
  user: UserRow,
  currentPassword: string,
  newPassword: string,
): void {
  if (!bcrypt.compareSync(currentPassword, user.passwordHash)) {
    throw badRequest('WRONG_PASSWORD', 'הסיסמה הנוכחית שגויה');
  }
  db.update(users)
    .set({ passwordHash: bcrypt.hashSync(newPassword, BCRYPT_COST) })
    .where(eq(users.id, user.id))
    .run();
}

export function adminSetPassword(db: Db, targetUserId: number, newPassword: string): void {
  db.update(users)
    .set({ passwordHash: bcrypt.hashSync(newPassword, BCRYPT_COST) })
    .where(eq(users.id, targetUserId))
    .run();
}

/** Invalidate every session of a user except (optionally) the current one. */
export function destroyOtherSessions(db: Db, userId: number, keepSessionRowId?: number): void {
  if (keepSessionRowId === undefined) {
    db.delete(sessions).where(eq(sessions.userId, userId)).run();
    return;
  }
  const rows = db.select().from(sessions).where(eq(sessions.userId, userId)).all();
  for (const row of rows) {
    if (row.id !== keepSessionRowId) {
      db.delete(sessions).where(and(eq(sessions.id, row.id))).run();
    }
  }
}
