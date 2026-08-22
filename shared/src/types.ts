export const FIXTURE_STATUSES = ['scheduled', 'live', 'finished', 'postponed', 'cancelled'] as const;
export type FixtureStatus = (typeof FIXTURE_STATUSES)[number];

export const ROUND_STATUSES = ['pending', 'open', 'closed'] as const;
export type RoundStatus = (typeof ROUND_STATUSES)[number];

export const ROUND_PHASES = ['regular', 'playoff_top', 'playoff_bottom'] as const;
export type RoundPhase = (typeof ROUND_PHASES)[number];

export const ROLES = ['USER', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const SEASON_STATUSES = ['active', 'archived'] as const;
export type SeasonStatus = (typeof SEASON_STATUSES)[number];

/**
 * Titles/badges. Round titles (persisted at round close):
 *   round_winner (👑), round_prophet (🧙), black_round (💀), climber (🚀)
 * Season-dynamic titles (computed at read time, never stored):
 *   leader (🏆), exact_king (🎯), hot_streak (🔥)
 * Season honors (written at archive): champion, plus copies of the above.
 */
export const TITLE_CODES = [
  'leader',
  'round_winner',
  'exact_king',
  'hot_streak',
  'round_prophet',
  'black_round',
  'climber',
  'champion',
] as const;
export type TitleCode = (typeof TITLE_CODES)[number];

export const TITLE_META: Record<TitleCode, { emoji: string; label: string }> = {
  leader: { emoji: '🏆', label: 'מוביל הליגה' },
  round_winner: { emoji: '👑', label: 'מנצח המחזור' },
  exact_king: { emoji: '🎯', label: 'מלך הבול' },
  hot_streak: { emoji: '🔥', label: 'רצף חם' },
  round_prophet: { emoji: '🧙', label: 'נביא המחזור' },
  black_round: { emoji: '💀', label: 'מחזור שחור' },
  climber: { emoji: '🚀', label: 'המטפס' },
  champion: { emoji: '🏆', label: 'אלוף העונה' },
};

export const NOTIFICATION_TYPES = [
  'lock_24h',
  'lock_3h',
  'lock_30m',
  'round_summary',
  'new_round_open',
  'game_postponed',
  'completion_open',
  'completion_lock_3h',
  'completion_lock_30m',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// ---------- API DTOs ----------

export interface UserPublic {
  id: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: Role;
}

export interface UserPrivate extends UserPublic {
  phone: string;
  createdAt: number;
}

export interface TeamDto {
  id: number;
  name: string;
  shortName: string;
  color: string;
  isActive: boolean;
}

export interface SeasonDto {
  id: number;
  name: string;
  status: SeasonStatus;
  startedAt: number;
  archivedAt: number | null;
}

/** Derived, read-time state of a round (never stored). */
export type RoundDerivedState = 'pending' | 'open' | 'locked' | 'live' | 'finished';

export interface RoundDto {
  id: number;
  seasonId: number;
  number: number;
  name: string;
  phase: RoundPhase;
  status: RoundStatus;
  lockAt: number | null;
  derivedState: RoundDerivedState;
  fixtureCount: number;
  finishedCount: number;
}

export interface FixtureDto {
  id: number;
  roundId: number;
  homeTeam: TeamDto;
  awayTeam: TeamDto;
  kickoffAt: number;
  status: FixtureStatus;
  homeScore: number | null;
  awayScore: number | null;
  liveMinute: string | null;
  isCompletion: boolean;
  predictionOpenAt: number | null;
}

export interface PredictionDto {
  fixtureId: number;
  userId: number;
  homePred: number;
  awayPred: number;
  updatedAt: number;
}

export interface PredictionScoreDto {
  fixtureId: number;
  userId: number;
  points: number;
  isExact: boolean;
  isOutcome: boolean;
  isCompletion: boolean;
}

export interface CompletionStatusEntry {
  user: UserPublic;
  filled: number;
  total: number;
  done: boolean;
}

export interface StandingsEntry {
  user: UserPublic;
  totalPoints: number;
  exactCount: number;
  outcomeCount: number;
  rank: number;
  previousRank: number | null;
  movement: number | null;
  titles: TitleCode[];
}

export interface RoundSummaryEntry {
  user: UserPublic;
  points: number;
  exactCount: number;
  outcomeCount: number;
  rankInRound: number;
  isRoundWinner: boolean;
  seasonTotalAfter: number;
  rankAfter: number;
  rankBefore: number | null;
  movement: number | null;
  titles: TitleCode[];
}

export interface LiveFixtureDto extends FixtureDto {
  predictions: Array<{
    user: UserPublic;
    homePred: number;
    awayPred: number;
    provisionalPoints: number;
    isExact: boolean;
  }>;
}

export interface LiveStandingsEntry {
  user: UserPublic;
  bankedPoints: number;
  provisionalPoints: number;
  totalIfEndedNow: number;
  rankIfEndedNow: number;
  currentRank: number | null;
}

export interface PlayerStatsDto {
  user: UserPublic;
  totalPoints: number;
  exactCount: number;
  outcomeCount: number;
  predictionsCount: number;
  scoredFixturesCount: number;
  successRate: number;
  roundWins: number;
  bestRound: { roundId: number; roundName: string; points: number } | null;
  worstRound: { roundId: number; roundName: string; points: number } | null;
  currentStreak: number;
  longestStreak: number;
  titles: TitleCode[];
  rank: number | null;
}

export interface AuditEntryDto {
  id: number;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  createdAt: number;
}
