/** Usage: npm run promote-admin -- <username> */
import { eq } from 'drizzle-orm';
import { dataPath } from '../config.js';
import { createDb } from './index.js';
import { users } from './schema.js';

const username = process.argv[2]?.toLowerCase();
if (!username) {
  console.error('Usage: npm run promote-admin -- <username>');
  process.exit(1);
}

const db = createDb(dataPath('league.db'));
const user = db.select().from(users).where(eq(users.username, username)).get();
if (!user) {
  console.error(`❌ No user named "${username}". Registered users:`);
  for (const u of db.select().from(users).all()) console.error(`   - ${u.username} (${u.role})`);
  process.exit(1);
}

db.update(users).set({ role: 'ADMIN' }).where(eq(users.id, user.id)).run();
console.log(`👑 ${user.displayName} (@${user.username}) is now an ADMIN.`);
