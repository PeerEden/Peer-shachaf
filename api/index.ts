/**
 * Vercel serverless entry — DEMO mode.
 *
 * Wraps the exact same Express app the normal deployment runs (server/src),
 * but serverless has no persistent disk and no long-lived process, so:
 *  - SQLite lives in /tmp and RESETS on cold starts and on every deploy
 *    (config.ts picks the /tmp path when VERCEL is set).
 *  - The reminder scheduler does not run — no push reminders.
 * Base + demo data are seeded on cold start so every screen has content.
 * For a real deployment (persistent data, reminders) follow docs/DEPLOY.md.
 */
import { buildApp } from '../server/src/app.js';
import { config, dataPath } from '../server/src/config.js';
import { createDb } from '../server/src/db/index.js';
import { seedDemo } from '../server/src/db/seed-demo.js';
import { seedBase } from '../server/src/db/seed.js';
import { SystemClock } from '../server/src/lib/clock.js';
import { buildPushEvents } from '../server/src/push/events.js';
import { PushService, webPushTransport } from '../server/src/push/sender.js';
import { configureWebPush, ensureVapidKeys } from '../server/src/push/vapid.js';

const db = createDb(dataPath('league.db'));
seedBase(db, { inviteCode: config.inviteCode ?? 'DEMO' });
seedDemo(db);

const clock = new SystemClock();
const vapidKeys = ensureVapidKeys(config.dataDir);
configureWebPush(vapidKeys);
const push = new PushService(db, webPushTransport, vapidKeys.publicKey);
const events = buildPushEvents(db, push);

export default buildApp({ db, clock, events, push });
