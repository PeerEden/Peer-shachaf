/**
 * Vercel serverless entry.
 *
 * Wraps the exact same Express app the normal deployment runs (server/src).
 * Only the BASE seed runs here (league settings + invite code, season, teams,
 * empty rounds) — no demo users, fixtures or predictions: real people register
 * themselves and the admin enters the real games.
 *
 * Serverless caveats (see docs/DEPLOY.md for a persistent deployment):
 *  - SQLite lives in /tmp, so data does NOT survive cold starts or deploys.
 *  - The reminder scheduler does not run — no push reminders.
 */
import { buildApp } from '../server/src/app.js';
import { config, dataPath } from '../server/src/config.js';
import { createDb } from '../server/src/db/index.js';
import { seedBase } from '../server/src/db/seed.js';
import { SystemClock } from '../server/src/lib/clock.js';
import { buildPushEvents } from '../server/src/push/events.js';
import { PushService, webPushTransport } from '../server/src/push/sender.js';
import { configureWebPush, ensureVapidKeys } from '../server/src/push/vapid.js';

export function bootstrap() {
  const db = createDb(dataPath('league.db'));
  seedBase(db, { inviteCode: config.inviteCode ?? 'DEMO' });

  const clock = new SystemClock();
  const vapidKeys = ensureVapidKeys(config.dataDir);
  configureWebPush(vapidKeys);
  const push = new PushService(db, webPushTransport, vapidKeys.publicKey);
  const events = buildPushEvents(db, push);

  return buildApp({ db, clock, events, push });
}
