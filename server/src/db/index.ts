import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from './schema.js';

export { schema };

export type Db = PostgresJsDatabase<typeof schema>;

export const migrationsFolder = new URL('../../drizzle/', import.meta.url).pathname;

/**
 * Opens the Postgres (Supabase) connection.
 *
 * Serverless notes: each instance is its own process, so `max: 1` keeps the
 * connection count sane, and `prepare: false` is required when the URL points
 * at Supabase's transaction-mode pooler (port 6543) — pgbouncer there does
 * not support prepared statements.
 */
export function createDb(connectionString: string): Db {
  const client = postgres(connectionString, { max: 1, prepare: false });
  const db = drizzle(client, { schema });
  clients.set(db, client);
  return db;
}

/** Lets closeDb() reach the socket without leaking the driver into callers. */
const clients = new WeakMap<object, ReturnType<typeof postgres>>();

/**
 * Releases the connection pool. The long-running server never needs this, but
 * a CLI script does — postgres-js keeps its socket open, so without it the
 * process finishes its work and then hangs forever.
 */
export async function closeDb(db: Db): Promise<void> {
  await clients.get(db)?.end();
}

/**
 * Brings the database up to date. Safe on every boot — drizzle records what
 * already ran — which is what lets a deployment with no shell (Vercel) still
 * get its tables. Two instances booting together can collide on the very
 * first migration; the loser simply finds the tables already there.
 */
export async function runMigrations(db: Db): Promise<void> {
  try {
    await migrate(db, { migrationsFolder });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/already exists|duplicate key|tuple concurrently/i.test(message)) throw error;
  }
}
