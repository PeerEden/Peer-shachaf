/**
 * Emergency password reset from the server shell (e.g. the admin locked
 * themselves out). Usage: npm run reset-password -- <username> <new-password>
 */
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { config } from '../config.js';
import { closeDb, createDb, runMigrations } from './index.js';
import { users } from './schema.js';

const username = process.argv[2]?.toLowerCase();
const newPassword = process.argv[3];
if (!username || !newPassword || newPassword.length < 6) {
  console.error('Usage: npm run reset-password -- <username> <new-password (6+ chars)>');
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
  console.error(`❌ No user named "${username}".`);
  process.exit(1);
}

await db
  .update(users)
  .set({ passwordHash: bcrypt.hashSync(newPassword, 11) })
  .where(eq(users.id, user.id));
console.log(`🔑 Password updated for ${user.displayName} (@${user.username}).`);
await closeDb(db);
