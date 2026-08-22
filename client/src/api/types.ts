import type {
  AuditEntryDto,
  CompletionStatusEntry,
  FixtureDto,
  PredictionScoreDto,
  RoundDto,
  RoundSummaryEntry,
  SeasonDto,
  StandingsEntry,
  TeamDto,
  UserPrivate,
  UserPublic,
} from '@league/shared';

export interface MeResponse {
  user: UserPrivate | null;
}

export interface RoundPredictionView {
  fixtureId: number;
  userId: number;
  homePred: number;
  awayPred: number;
  user: UserPublic;
}

export interface RoundViewResponse {
  round: RoundDto;
  fixtures: FixtureDto[];
  predictions: RoundPredictionView[];
  scores: PredictionScoreDto[];
  completionStatus: CompletionStatusEntry[];
}

export type CurrentRoundResponse = RoundViewResponse | { round: null };

export interface HomeResponse {
  me: UserPrivate;
  leagueName: string;
  seasonName: string | null;
  standings: StandingsEntry[];
  activeRound: {
    round: RoundDto;
    myFilled: number;
    total: number;
    completionStatus: CompletionStatusEntry[];
  } | null;
  liveNow: boolean;
  lastClosedRound: { id: number; name: string; winners: UserPublic[] } | null;
  completionFixtures: Array<
    FixtureDto & { myPrediction: { homePred: number; awayPred: number } | null }
  >;
}

export interface RoundSummaryResponse {
  round: RoundDto;
  entries: RoundSummaryEntry[];
}

export interface RoundsListResponse {
  rounds: RoundDto[];
}

export interface StandingsResponse {
  standings: StandingsEntry[];
}

export interface DoneResponse {
  complete: boolean;
  missing: number[];
  total: number;
}

export interface LiveFixtureView extends FixtureDto {
  predictions: Array<{
    user: UserPublic;
    homePred: number;
    awayPred: number;
    provisionalPoints: number;
    isExact: boolean;
  }>;
}

export interface LiveResponse {
  fixtures: LiveFixtureView[];
  table: Array<{
    user: UserPublic;
    bankedPoints: number;
    provisionalPoints: number;
    totalIfEndedNow: number;
    rankIfEndedNow: number;
    currentRank: number | null;
  }>;
  hasLive: boolean;
}

export interface PlayerStatsResponse {
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
  titles: string[];
  rank: number | null;
}

export interface SeasonsResponse {
  seasons: SeasonDto[];
}

export interface HonorsResponse {
  honors: Array<{ titleCode: string; displayName: string; value: number | null }>;
}

export interface TeamsResponse {
  teams: TeamDto[];
}

export interface AdminUsersResponse {
  users: Array<UserPrivate & { predictionsCount: number }>;
}

export interface AuditResponse {
  entries: AuditEntryDto[];
}

export interface VapidKeyResponse {
  publicKey: string | null;
}
