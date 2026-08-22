import type { Express } from 'express';
import request from 'supertest';
import { buildApp } from '../app.js';
import { createDb, type Db } from '../db/index.js';
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

export function createTestApp(): TestContext {
  const db = createDb(':memory:');
  const seed = seedBase(db, { inviteCode: TEST_INVITE });
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
