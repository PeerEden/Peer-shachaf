import { buildApp } from './app.js';
import { config } from './config.js';
import { createDb, runMigrations } from './db/index.js';
import { purgeExpiredSessions } from './auth/service.js';
import { OffsetClock, SystemClock } from './lib/clock.js';
import { buildPushEvents } from './push/events.js';
import { PushScheduler } from './push/scheduler.js';
import { PushService, webPushTransport } from './push/sender.js';
import { configureWebPush, ensureVapidKeys } from './push/vapid.js';

if (!config.databaseUrl) {
  console.error(
    'DATABASE_URL חסר — צריך כתובת של מסד נתונים Postgres (Supabase) כדי להפעיל את השרת.',
  );
  process.exit(1);
}

const db = createDb(config.databaseUrl);
await runMigrations(db);

// DEV_TOOLS=1 swaps in an offsettable clock so /api/admin/dev/clock can time-travel.
const clock = config.devTools ? new OffsetClock() : new SystemClock();

const vapidKeys = ensureVapidKeys(config.dataDir);
configureWebPush(vapidKeys);
const push = new PushService(db, webPushTransport, vapidKeys.publicKey);
const events = buildPushEvents(db, push);

const app = buildApp({ db, clock, events, push });

// One per-minute tick drives every scheduled reminder; unique event keys in
// notification_log make restarts and overlaps safe.
const scheduler = new PushScheduler(db, push);
const runTick = () => {
  scheduler.tick(clock.now()).catch((error) => console.error('scheduler tick failed:', error));
};
runTick();
setInterval(runTick, 60 * 1000);
setInterval(() => {
  purgeExpiredSessions(db, clock).catch((error) =>
    console.error('session purge failed:', error),
  );
}, 6 * 60 * 60 * 1000);

app.listen(config.port, () => {
  console.log(`⚽ 0 מושג בכדורגל — server listening on http://localhost:${config.port}`);
  if (config.devTools) console.log('🧪 DEV_TOOLS enabled (time-travel endpoints active)');
});
