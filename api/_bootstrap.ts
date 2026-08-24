/**
 * Vercel serverless entry.
 *
 * Wraps the exact same Express app the normal deployment runs (server/src),
 * against the shared Postgres database named by DATABASE_URL. Migrations run
 * here on the first request an instance serves, because a serverless
 * deployment has no shell to run them from.
 *
 * Serverless caveat that no database can fix: nothing runs between requests,
 * so the reminder scheduler never ticks. Push reminders need the long-running
 * deployment described in docs/DEPLOY.md.
 */
import { buildApp } from '../server/src/app.js';
import { config, dataPath } from '../server/src/config.js';
import { createDb, runMigrations } from '../server/src/db/index.js';
import { seedBase } from '../server/src/db/seed.js';
import { SystemClock } from '../server/src/lib/clock.js';
import { buildPushEvents } from '../server/src/push/events.js';
import { PushService, webPushTransport } from '../server/src/push/sender.js';
import { configureWebPush, ensureVapidKeys } from '../server/src/push/vapid.js';

export async function bootstrap() {
  if (!config.databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set. Add your Supabase connection string as an environment ' +
        'variable in the Vercel project, then redeploy. ' +
        '(DATABASE_URL חסר — צריך להוסיף את כתובת ה-Supabase כמשתנה סביבה ב-Vercel.)',
    );
  }

  const db = createDb(config.databaseUrl);
  await runMigrations(db);
  await seedBase(db, { inviteCode: config.inviteCode });

  const clock = new SystemClock();
  const vapidKeys = ensureVapidKeys(config.dataDir);
  configureWebPush(vapidKeys);
  const push = new PushService(db, webPushTransport, vapidKeys.publicKey);
  const events = buildPushEvents(db, push);

  return buildApp({ db, clock, events, push });
}
