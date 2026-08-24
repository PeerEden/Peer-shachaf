/** Usage: npm run promote-admin -- <username> */
import { eq } from 'drizzle-orm';
import { config } from '../config.js';
import { closeDb, createDb, runMigrations } from './index.js';
import { users } from './schema.js';

const username = process.argv[2]?.toLowerCase();
if (!username) {
  console.error('Usage: npm run promote-admin -- <username>');
  process.exit(1);
}

if (!config.databaseUrl) {
  console.error('❌ חסר DATABASE_URL — הגדירו את כתובת מסד הנתונים (Postgres/Supabase) ונסו שוב.');
  process.exit(1);
}

const db = createDb(config.databaseUrl);
await runMigrations(db);
const [user] = await db.select().from(users).where(eq(users.username, username));
if (!user) {
  console.error(`❌ No user named "${username}". Registered users:`);
  for (const u of await db.select().from(users)) console.error(`   - ${u.username} (${u.role})`);
  process.exit(1);
}

await db.update(users).set({ role: 'ADMIN' }).where(eq(users.id, user.id));
console.log(`👑 ${user.displayName} (@${user.username}) is now an ADMIN.`);
await closeDb(db);
