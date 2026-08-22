/**
 * The single file that defines the entire database.
 *
 * Portability note (the "Supabase later" contract): to move to Postgres,
 * switch these imports to drizzle-orm/pg-core (integer PKs → serial,
 * timestamp_ms → timestamp), swap the driver in ./index.ts, and re-run
 * `npm run db:generate`. No raw SQL exists outside this folder.
 */
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

const id = () => integer('id').primaryKey({ autoIncrement: true });
const createdAt = () =>
  integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date());

export const leagueSettings = sqliteTable('league_settings', {
  id: integer('id').primaryKey(),
  leagueName: text('league_name').notNull().default('0 מושג בכדורגל'),
  inviteCode: text('invite_code').notNull(),
  createdAt: createdAt(),
});

export const seasons = sqliteTable('seasons', {
  id: id(),
  name: text('name').notNull().unique(),
  status: text('status', { enum: ['active', 'archived'] }).notNull().default('active'),
  startedAt: createdAt(),
  archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
});

export const teams = sqliteTable('teams', {
  id: id(),
  name: text('name').notNull().unique(),
  shortName: text('short_name').notNull(),
  color: text('color').notNull().default('#22c55e'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: createdAt(),
});

export const users = sqliteTable('users', {
  id: id(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  phone: text('phone').notNull().unique(),
  avatarPath: text('avatar_path'),
  role: text('role', { enum: ['USER', 'ADMIN'] }).notNull().default('USER'),
  createdAt: createdAt(),
});

export const sessions = sqliteTable(
  'sessions',
  {
    id: id(),
    tokenHash: text('token_hash').notNull().unique(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
    userAgent: text('user_agent'),
  },
  (t) => [index('sessions_user_idx').on(t.userId), index('sessions_expires_idx').on(t.expiresAt)],
);

export const rounds = sqliteTable(
  'rounds',
  {
    id: id(),
    seasonId: integer('season_id')
      .notNull()
      .references(() => seasons.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    name: text('name').notNull(),
    phase: text('phase', { enum: ['regular', 'playoff_top', 'playoff_bottom'] })
      .notNull()
      .default('regular'),
    /**
     * Stored status covers only the prediction-window lifecycle
     * (pending → open → closed). Locked/live/finished are derived at read
     * time from lock_at and fixture states — no cron needed to flip locks.
     */
    status: text('status', { enum: ['pending', 'open', 'closed'] }).notNull().default('pending'),
    /** MIN(kickoff) of non-completion fixtures; recomputed on every fixture change. */
    lockAt: integer('lock_at', { mode: 'timestamp_ms' }),
    openedAt: integer('opened_at', { mode: 'timestamp_ms' }),
    closedAt: integer('closed_at', { mode: 'timestamp_ms' }),
  },
  (t) => [
    uniqueIndex('rounds_season_number_phase_idx').on(t.seasonId, t.number, t.phase),
    index('rounds_season_status_idx').on(t.seasonId, t.status),
  ],
);

export const fixtures = sqliteTable(
  'fixtures',
  {
    id: id(),
    roundId: integer('round_id')
      .notNull()
      .references(() => rounds.id, { onDelete: 'cascade' }),
    seasonId: integer('season_id')
      .notNull()
      .references(() => seasons.id, { onDelete: 'cascade' }),
    homeTeamId: integer('home_team_id')
      .notNull()
      .references(() => teams.id),
    awayTeamId: integer('away_team_id')
      .notNull()
      .references(() => teams.id),
    kickoffAt: integer('kickoff_at', { mode: 'timestamp_ms' }).notNull(),
    status: text('status', { enum: ['scheduled', 'live', 'finished', 'postponed', 'cancelled'] })
      .notNull()
      .default('scheduled'),
    homeScore: integer('home_score'),
    awayScore: integer('away_score'),
    liveMinute: text('live_minute'),
    /** A postponed game rescheduled to a new date (משחק השלמה). */
    isCompletion: integer('is_completion', { mode: 'boolean' }).notNull().default(false),
    /** Completion games only: predictions reopen at this time (kickoff − 7 days). */
    predictionOpenAt: integer('prediction_open_at', { mode: 'timestamp_ms' }),
    finalizedAt: integer('finalized_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
  },
  (t) => [
    index('fixtures_round_idx').on(t.roundId),
    index('fixtures_kickoff_idx').on(t.kickoffAt),
    index('fixtures_season_status_idx').on(t.seasonId, t.status),
  ],
);

export const predictions = sqliteTable(
  'predictions',
  {
    id: id(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fixtureId: integer('fixture_id')
      .notNull()
      .references(() => fixtures.id, { onDelete: 'cascade' }),
    homePred: integer('home_pred').notNull(),
    awayPred: integer('away_pred').notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    uniqueIndex('predictions_user_fixture_idx').on(t.userId, t.fixtureId),
    index('predictions_fixture_idx').on(t.fixtureId),
  ],
);

/**
 * Final points only. Live/provisional points are always computed on the fly
 * from shared/scoring.ts and never stored, so they can't go stale.
 */
export const predictionScores = sqliteTable(
  'prediction_scores',
  {
    id: id(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fixtureId: integer('fixture_id')
      .notNull()
      .references(() => fixtures.id, { onDelete: 'cascade' }),
    roundId: integer('round_id')
      .notNull()
      .references(() => rounds.id, { onDelete: 'cascade' }),
    seasonId: integer('season_id')
      .notNull()
      .references(() => seasons.id, { onDelete: 'cascade' }),
    points: integer('points').notNull(),
    isExact: integer('is_exact', { mode: 'boolean' }).notNull(),
    isOutcome: integer('is_outcome', { mode: 'boolean' }).notNull(),
    isCompletion: integer('is_completion', { mode: 'boolean' }).notNull().default(false),
    computedAt: integer('computed_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    uniqueIndex('prediction_scores_user_fixture_idx').on(t.userId, t.fixtureId),
    index('prediction_scores_season_user_idx').on(t.seasonId, t.userId),
    index('prediction_scores_round_idx').on(t.roundId),
  ],
);

/** Frozen round summary + standings snapshot, written once at round close. */
export const roundUserStats = sqliteTable(
  'round_user_stats',
  {
    id: id(),
    roundId: integer('round_id')
      .notNull()
      .references(() => rounds.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    points: integer('points').notNull(),
    exactCount: integer('exact_count').notNull(),
    outcomeCount: integer('outcome_count').notNull(),
    rankInRound: integer('rank_in_round').notNull(),
    isRoundWinner: integer('is_round_winner', { mode: 'boolean' }).notNull(),
    seasonTotalAfter: integer('season_total_after').notNull(),
    rankAfter: integer('rank_after').notNull(),
    rankBefore: integer('rank_before'),
    movement: integer('movement'),
  },
  (t) => [uniqueIndex('round_user_stats_round_user_idx').on(t.roundId, t.userId)],
);

/** Persisted per-round titles: round_winner 👑, round_prophet 🧙, black_round 💀, climber 🚀. */
export const roundTitles = sqliteTable(
  'round_titles',
  {
    id: id(),
    seasonId: integer('season_id')
      .notNull()
      .references(() => seasons.id, { onDelete: 'cascade' }),
    roundId: integer('round_id')
      .notNull()
      .references(() => rounds.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    titleCode: text('title_code').notNull(),
    awardedAt: integer('awarded_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [uniqueIndex('round_titles_round_user_title_idx').on(t.roundId, t.userId, t.titleCode)],
);

/** Written at season archive; display_name is denormalized so honors survive user deletion. */
export const seasonHonors = sqliteTable('season_honors', {
  id: id(),
  seasonId: integer('season_id')
    .notNull()
    .references(() => seasons.id, { onDelete: 'cascade' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  displayName: text('display_name').notNull(),
  titleCode: text('title_code').notNull(),
  value: integer('value'),
  createdAt: createdAt(),
});

export const pushSubscriptions = sqliteTable(
  'push_subscriptions',
  {
    id: id(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
    lastSuccessAt: integer('last_success_at', { mode: 'timestamp_ms' }),
    failCount: integer('fail_count').notNull().default(0),
  },
  (t) => [index('push_subscriptions_user_idx').on(t.userId)],
);

/** Idempotency + audit for notifications: unique event_key prevents double-sends. */
export const notificationLog = sqliteTable(
  'notification_log',
  {
    id: id(),
    eventKey: text('event_key').notNull().unique(),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    status: text('status', { enum: ['sent', 'failed', 'skipped_no_sub'] }).notNull(),
    error: text('error'),
    createdAt: createdAt(),
  },
  (t) => [index('notification_log_created_idx').on(t.createdAt)],
);

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: id(),
    actorUserId: integer('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    actorName: text('actor_name').notNull(),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    beforeJson: text('before_json'),
    afterJson: text('after_json'),
    createdAt: createdAt(),
  },
  (t) => [index('audit_log_created_idx').on(t.createdAt)],
);
