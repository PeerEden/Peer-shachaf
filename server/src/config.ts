import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(serverRoot, '..');

/** Vercel = ephemeral serverless demo: only /tmp is writable, HTTPS is guaranteed. */
const onVercel = !!process.env.VERCEL;

export const config = {
  port: Number(process.env.PORT ?? 3000),
  /** Everything mutable lives here: league.db, uploads/, vapid.json. Backup = copy this folder. */
  dataDir: process.env.DATA_DIR ?? (onVercel ? '/tmp/league-data' : path.join(repoRoot, 'data')),
  clientDist: path.join(repoRoot, 'client', 'dist'),
  /** Overrides the seeded invite code check is always against the DB; this seeds it. */
  inviteCode: process.env.INVITE_CODE,
  cookieSecure: process.env.COOKIE_SECURE === '1' || onVercel,
  /** Demo mode: visitors are auto-signed-in as the demo admin — no login screen. */
  demoAutoLogin: process.env.DEMO_AUTO_LOGIN === '1' || onVercel,
  /** Enables /api/dev time-travel endpoints. Never set in production. */
  devTools: process.env.DEV_TOOLS === '1',
  isTest: process.env.NODE_ENV === 'test',
} as const;

export function dataPath(...parts: string[]): string {
  return path.join(config.dataDir, ...parts);
}
