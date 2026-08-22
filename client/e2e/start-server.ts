/**
 * Boots the real server on :3100 against a throwaway data dir with demo
 * seed — used by Playwright's webServer.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dataDir = path.join(repoRoot, 'e2e-data');

fs.rmSync(dataDir, { recursive: true, force: true });
process.env.DATA_DIR = dataDir;
process.env.PORT = '3100';
process.env.INVITE_CODE = 'E2ECODE1';

const { createDb } = await import('../../server/src/db/index.js');
const { seedBase } = await import('../../server/src/db/seed.js');
const { seedDemo } = await import('../../server/src/db/seed-demo.js');

const db = createDb(path.join(dataDir, 'league.db'));
seedBase(db, { inviteCode: 'E2ECODE1' });
seedDemo(db);

await import('../../server/src/index.js');
