import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.js';

export { schema };

// Bundlers (e.g. Vercel's) relocate this module, so the import.meta-relative
// path can miss; fall back to the repo-root layout (cwd = /var/task on Vercel).
const migrationsCandidates = [
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'drizzle'),
  path.resolve(process.cwd(), 'server', 'drizzle'),
];
const migrationsFolder = migrationsCandidates.find((p) => fs.existsSync(p)) ?? migrationsCandidates[0]!;

/**
 * Opens (creating if needed) the SQLite database and applies pending
 * migrations. Pass ':memory:' for tests.
 *
 * Portability note: this is the driver swap point for a future Postgres move.
 */
export function createDb(dbPath: string) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });
  return db;
}

export type Db = ReturnType<typeof createDb>;

/** Consistent online backup of the SQLite file (safe under WAL). */
export async function backupTo(db: Db, destPath: string): Promise<void> {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  await db.$client.backup(destPath);
}
