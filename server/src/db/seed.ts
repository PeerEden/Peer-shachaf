/**
 * Idempotent base seed: league settings (+invite code), season 2026/27,
 * Ligat ha'Al teams, regular-season rounds 1–26.
 *
 * `npm run seed`        — base seed only (safe to re-run)
 * `npm run seed:demo`   — base seed + demo users/fixtures/predictions
 *                         (implemented in ./seed-demo.ts; requires the engine)
 */
import { config, dataPath } from '../config.js';
import { generateInviteCode } from '../lib/crypto.js';
import { createDb, type Db } from './index.js';
import { leagueSettings, rounds, seasons, teams } from './schema.js';

// 2025/26 lineup — the 2026/27 lineup isn't final; the admin edits teams in the panel.
const LIGAT_HAAL_TEAMS: Array<{ name: string; shortName: string; color: string }> = [
  { name: 'מכבי תל אביב', shortName: 'מכבי ת"א', color: '#FFC50D' },
  { name: 'הפועל באר שבע', shortName: 'ב"ש', color: '#D8121A' },
  { name: 'מכבי חיפה', shortName: 'מ. חיפה', color: '#009150' },
  { name: 'בית"ר ירושלים', shortName: 'בית"ר', color: '#FFD200' },
  { name: 'הפועל תל אביב', shortName: 'הפועל ת"א', color: '#E4002B' },
  { name: 'מכבי נתניה', shortName: 'נתניה', color: '#F5D000' },
  { name: 'מ.ס. אשדוד', shortName: 'אשדוד', color: '#C8102E' },
  { name: 'הפועל חיפה', shortName: 'הפ. חיפה', color: '#DA291C' },
  { name: 'הפועל ירושלים', shortName: 'הפ. י-ם', color: '#B22222' },
  { name: 'עירוני טבריה', shortName: 'טבריה', color: '#0057B8' },
  { name: 'בני סכנין', shortName: 'סכנין', color: '#CE2029' },
  { name: 'הפועל פתח תקווה', shortName: 'פ"ת', color: '#0046AD' },
  { name: 'עירוני קריית שמונה', shortName: 'ק"ש', color: '#0072CE' },
  { name: 'מכבי בני ריינה', shortName: 'ריינה', color: '#1E90FF' },
];

export interface SeedResult {
  inviteCode: string;
  seasonId: number;
  createdSettings: boolean;
}

export function seedBase(db: Db, opts: { inviteCode?: string } = {}): SeedResult {
  const existingSettings = db.select().from(leagueSettings).all()[0];
  let inviteCode: string;
  let createdSettings = false;

  if (existingSettings) {
    inviteCode = existingSettings.inviteCode;
  } else {
    inviteCode = opts.inviteCode ?? generateInviteCode();
    db.insert(leagueSettings).values({ id: 1, inviteCode }).run();
    createdSettings = true;
  }

  let season = db.select().from(seasons).all()[0];
  if (!season) {
    season = db.insert(seasons).values({ name: '2026/27', status: 'active' }).returning().get();
  }

  const existingTeams = db.select().from(teams).all();
  if (existingTeams.length === 0) {
    db.insert(teams).values(LIGAT_HAAL_TEAMS).run();
  }

  const existingRounds = db.select().from(rounds).all();
  if (existingRounds.length === 0) {
    for (let n = 1; n <= 26; n++) {
      db.insert(rounds)
        .values({
          seasonId: season.id,
          number: n,
          name: `מחזור ${n}`,
          phase: 'regular',
          status: n === 1 ? 'open' : 'pending',
          openedAt: n === 1 ? new Date() : null,
        })
        .run();
    }
  }

  return { inviteCode, seasonId: season.id, createdSettings };
}

const isMain = process.argv[1]?.endsWith('seed.ts');
if (isMain) {
  const db = createDb(dataPath('league.db'));
  const result = seedBase(db, { inviteCode: config.inviteCode });
  console.log(`✅ Seed complete (season 2026/27, ${LIGAT_HAAL_TEAMS.length} teams, 26 rounds).`);
  console.log(`🔑 League invite code: ${result.inviteCode}`);

  if (process.argv.includes('--demo')) {
    const { seedDemo } = await import('./seed-demo.js');
    seedDemo(db);
  }
}
