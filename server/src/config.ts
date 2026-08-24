import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(serverRoot, '..');

/** Vercel = ephemeral serverless demo: only /tmp is writable, HTTPS is guaranteed. */
const onVercel = !!process.env.VERCEL;

export const config = {
  port: Number(process.env.PORT ?? 3000),
  /**
   * Postgres connection string (Supabase). This is the entire deployment
   * contract: set it and the league has one shared database that outlives
   * every restart; leave it unset and there is nowhere to keep anything.
   */
  databaseUrl: process.env.DATABASE_URL,
  /** Everything mutable lives here: league.db, uploads/, vapid.json. Backup = copy this folder. */
  dataDir: process.env.DATA_DIR ?? (onVercel ? '/tmp/league-data' : path.join(repoRoot, 'data')),
  clientDist: path.join(repoRoot, 'client', 'dist'),
  /** Overrides the seeded invite code check is always against the DB; this seeds it. */
  inviteCode: process.env.INVITE_CODE,
  cookieSecure: process.env.COOKIE_SECURE === '1' || onVercel,
  /**
   * True while no real database is configured, so the UI can warn people
   * before they build a league on something that cannot keep it.
   */
  ephemeralStorage: !process.env.DATABASE_URL,
  /** Enables /api/dev time-travel endpoints. Never set in production. */
  devTools: process.env.DEV_TOOLS === '1',
  isTest: process.env.NODE_ENV === 'test',
} as const;

export function dataPath(...parts: string[]): string {
  return path.join(config.dataDir, ...parts);
}
