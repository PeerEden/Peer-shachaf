import type { RegisterInput } from '../../../shared/src/index.js';
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

export async function registerUser(
  db: Db,
  clock: Clock,
  input: RegisterInput,
  userAgent: string | null,
): Promise<{ user: UserRow; session: SessionInfo }> {
  const settings = (await db.select().from(leagueSettings))[0];
  if (!settings) throw badRequest('LEAGUE_NOT_SEEDED', 'הליגה עוד לא הוקמה');
  if (input.inviteCode.trim().toUpperCase() !== settings.inviteCode.toUpperCase()) {
    throw badRequest('BAD_INVITE_CODE', 'קוד הכניסה לליגה שגוי');
  }

  const clash = await db
    .select()
    .from(users)
    .where(or(eq(users.username, input.username), eq(users.phone, input.phone)));
  if (clash.some((u) => u.username === input.username)) {
    throw conflict('USERNAME_TAKEN', 'שם המשתמש כבר תפוס');
  }
  if (clash.some((u) => u.phone === input.phone)) {
    throw conflict('PHONE_TAKEN', 'מספר הטלפון כבר רשום במערכת');
  }

  // The founder of a fresh league becomes its admin: on hosts where the CLI
  // (`npm run promote-admin`) isn't reachable there would otherwise be nobody
  // able to enter teams, fixtures and results.
  const isFirstUser = (await db.select().from(users)).length === 0;

  const user = (
    await db
      .insert(users)
      .values({
        username: input.username,
        passwordHash: bcrypt.hashSync(input.password, BCRYPT_COST),
        displayName: input.displayName,
        phone: input.phone,
        role: isFirstUser ? 'ADMIN' : 'USER',
        createdAt: clock.now(),
      })
      .returning()
  )[0]!;

  return { user, session: await createSession(db, clock, user.id, userAgent) };
}

export async function loginUser(
  db: Db,
  clock: Clock,
  username: string,
  password: string,
  userAgent: string | null,
): Promise<{ user: UserRow; session: SessionInfo }> {
  const [user] = await db.select().from(users).where(eq(users.username, username));
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    throw unauthorized('שם משתמש או סיסמה שגויים');
  }
  return { user, session: await createSession(db, clock, user.id, userAgent) };
}

export async function createSession(
  db: Db,
  clock: Clock,
  userId: number,
  userAgent: string | null,
): Promise<SessionInfo> {
  const token = generateToken();
  const now = clock.now();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    tokenHash: sha256(token),
    userId,
    createdAt: now,
    expiresAt,
    lastSeenAt: now,
    userAgent,
  });
  return { token, expiresAt };
}

export async function resolveSession(
  db: Db,
  clock: Clock,
  token: string,
): Promise<{ user: UserRow; sessionRowId: number } | null> {
  const now = clock.now();
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, sha256(token)));
  if (!row) return null;
  if (row.session.expiresAt.getTime() <= now.getTime()) {
    await db.delete(sessions).where(eq(sessions.id, row.session.id));
    return null;
  }

  const consumed = SESSION_TTL_MS - (row.session.expiresAt.getTime() - now.getTime());
  if (consumed > SESSION_RENEW_AFTER_MS) {
    await db
      .update(sessions)
      .set({ expiresAt: new Date(now.getTime() + SESSION_TTL_MS), lastSeenAt: now })
      .where(eq(sessions.id, row.session.id));
  } else if (now.getTime() - row.session.lastSeenAt.getTime() > 60 * 60 * 1000) {
    await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, row.session.id));
  }

  return { user: row.user, sessionRowId: row.session.id };
}

export async function destroySession(db: Db, sessionRowId: number): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionRowId));
}

export async function purgeExpiredSessions(db: Db, clock: Clock): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, clock.now()));
}

export async function changePassword(
  db: Db,
  user: UserRow,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  if (!bcrypt.compareSync(currentPassword, user.passwordHash)) {
    throw badRequest('WRONG_PASSWORD', 'הסיסמה הנוכחית שגויה');
  }
  await db
    .update(users)
    .set({ passwordHash: bcrypt.hashSync(newPassword, BCRYPT_COST) })
    .where(eq(users.id, user.id));
}

export async function adminSetPassword(
  db: Db,
  targetUserId: number,
  newPassword: string,
): Promise<void> {
  await db
    .update(users)
    .set({ passwordHash: bcrypt.hashSync(newPassword, BCRYPT_COST) })
    .where(eq(users.id, targetUserId));
}

/** Invalidate every session of a user except (optionally) the current one. */
export async function destroyOtherSessions(
  db: Db,
  userId: number,
  keepSessionRowId?: number,
): Promise<void> {
  if (keepSessionRowId === undefined) {
    await db.delete(sessions).where(eq(sessions.userId, userId));
    return;
  }
  const rows = await db.select().from(sessions).where(eq(sessions.userId, userId));
  for (const row of rows) {
    if (row.id !== keepSessionRowId) {
      await db.delete(sessions).where(and(eq(sessions.id, row.id)));
    }
  }
}
