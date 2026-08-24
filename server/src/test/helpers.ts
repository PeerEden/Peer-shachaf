import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { Express } from 'express';
import request from 'supertest';
import { buildApp } from '../app.js';
import { migrationsFolder, schema, type Db } from '../db/index.js';
import { seedBase } from '../db/seed.js';
import { FixedClock } from '../lib/clock.js';

export const T0 = new Date('2026-08-20T10:00:00Z');
export const TEST_INVITE = 'TEST1234';

export interface TestContext {
  db: Db;
  clock: FixedClock;
  app: Express;
  seasonId: number;
}

/**
 * A migrated, empty database for tests that drive the engine directly and have
 * no use for the HTTP layer.
 */
export async function createTestDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema }) as unknown as Db;
  await migrate(db as never, { migrationsFolder });
  return db;
}

/**
 * Each test gets its own Postgres — PGlite runs the real engine in-process,
 * so the suite exercises the same SQL the deployed Supabase database does
 * without anyone needing a database server.
 */
export async function createTestApp(): Promise<TestContext> {
  const db = await createTestDb();
  const seed = await seedBase(db, { inviteCode: TEST_INVITE });
  const clock = new FixedClock(T0);
  const app = buildApp({ db, clock });
  return { db, clock, app, seasonId: seed.seasonId };
}

let phoneCounter = 0;

export async function registerAgent(
  ctx: TestContext,
  username: string,
  overrides: Partial<{ password: string; displayName: string; phone: string; inviteCode: string }> = {},
) {
  const agent = request.agent(ctx.app);
  phoneCounter += 1;
  const res = await agent.post('/api/auth/register').send({
    username,
    password: overrides.password ?? 'secret123',
    displayName: overrides.displayName ?? `שחקן ${username}`,
    phone: overrides.phone ?? `05${String(20000000 + phoneCounter).padStart(8, '0')}`,
    inviteCode: overrides.inviteCode ?? TEST_INVITE,
  });
  return { agent, res };
}
