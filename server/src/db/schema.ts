/**
 * The single file that defines the entire database (Postgres / Supabase).
 *
 * Timestamps are `timestamptz`, so the server never reasons about time zones.
 * Keeping every table definition here — and no raw SQL anywhere outside this
 * folder — is what kept the move off SQLite confined to this file + ./index.ts.
 */
import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

const id = () => serial('id').primaryKey();
const createdAt = () =>
  timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .$defaultFn(() => new Date());

export const leagueSettings = pgTable('league_settings', {
  id: integer('id').primaryKey(),
  leagueName: text('league_name').notNull().default('0 מושג בכדורגל'),
  inviteCode: text('invite_code').notNull(),
  createdAt: createdAt(),
});

export const seasons = pgTable('seasons', {
  id: id(),
  name: text('name').notNull().unique(),
  status: text('status', { enum: ['active', 'archived'] }).notNull().default('active'),
  startedAt: createdAt(),
  archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
});

export const teams = pgTable('teams', {
  id: id(),
  name: text('name').notNull().unique(),
  shortName: text('short_name').notNull(),
  color: text('color').notNull().default('#22c55e'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
});

export const users = pgTable('users', {
  id: id(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  phone: text('phone').notNull().unique(),
  avatarPath: text('avatar_path'),
  role: text('role', { enum: ['USER', 'ADMIN'] }).notNull().default('USER'),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    tokenHash: text('token_hash').notNull().unique(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' }).notNull(),
    userAgent: text('user_agent'),
  },
  (t) => [index('sessions_user_idx').on(t.userId), index('sessions_expires_idx').on(t.expiresAt)],
);

export const rounds = pgTable(
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
    lockAt: timestamp('lock_at', { withTimezone: true, mode: 'date' }),
    openedAt: timestamp('opened_at', { withTimezone: true, mode: 'date' }),
    closedAt: timestamp('closed_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    uniqueIndex('rounds_season_number_phase_idx').on(t.seasonId, t.number, t.phase),
    index('rounds_season_status_idx').on(t.seasonId, t.status),
  ],
);

export const fixtures = pgTable(
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
    kickoffAt: timestamp('kickoff_at', { withTimezone: true, mode: 'date' }).notNull(),
    status: text('status', { enum: ['scheduled', 'live', 'finished', 'postponed', 'cancelled'] })
      .notNull()
      .default('scheduled'),
    homeScore: integer('home_score'),
    awayScore: integer('away_score'),
    liveMinute: text('live_minute'),
    /** A postponed game rescheduled to a new date (משחק השלמה). */
    isCompletion: boolean('is_completion').notNull().default(false),
    /** Completion games only: predictions reopen at this time (kickoff − 7 days). */
    predictionOpenAt: timestamp('prediction_open_at', { withTimezone: true, mode: 'date' }),
    finalizedAt: timestamp('finalized_at', { withTimezone: true, mode: 'date' }),
    createdAt: createdAt(),
  },
  (t) => [
    index('fixtures_round_idx').on(t.roundId),
    index('fixtures_kickoff_idx').on(t.kickoffAt),
    index('fixtures_season_status_idx').on(t.seasonId, t.status),
  ],
);

export const predictions = pgTable(
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
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
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
export const predictionScores = pgTable(
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
    isExact: boolean('is_exact').notNull(),
    isOutcome: boolean('is_outcome').notNull(),
    isCompletion: boolean('is_completion').notNull().default(false),
    computedAt: timestamp('computed_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (t) => [
    uniqueIndex('prediction_scores_user_fixture_idx').on(t.userId, t.fixtureId),
    index('prediction_scores_season_user_idx').on(t.seasonId, t.userId),
    index('prediction_scores_round_idx').on(t.roundId),
  ],
);

/** Frozen round summary + standings snapshot, written once at round close. */
export const roundUserStats = pgTable(
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
    isRoundWinner: boolean('is_round_winner').notNull(),
    seasonTotalAfter: integer('season_total_after').notNull(),
    rankAfter: integer('rank_after').notNull(),
    rankBefore: integer('rank_before'),
    movement: integer('movement'),
  },
  (t) => [uniqueIndex('round_user_stats_round_user_idx').on(t.roundId, t.userId)],
);

/** Persisted per-round titles: round_winner 👑, round_prophet 🧙, black_round 💀, climber 🚀. */
export const roundTitles = pgTable(
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
    awardedAt: timestamp('awarded_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (t) => [uniqueIndex('round_titles_round_user_title_idx').on(t.roundId, t.userId, t.titleCode)],
);

/** Written at season archive; display_name is denormalized so honors survive user deletion. */
export const seasonHonors = pgTable('season_honors', {
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

export const pushSubscriptions = pgTable(
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
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true, mode: 'date' }),
    failCount: integer('fail_count').notNull().default(0),
  },
  (t) => [index('push_subscriptions_user_idx').on(t.userId)],
);

/** Idempotency + audit for notifications: unique event_key prevents double-sends. */
export const notificationLog = pgTable(
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

export const auditLog = pgTable(
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
