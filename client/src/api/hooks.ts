import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RoundDto, UserPublic } from '@league/shared';
import { api } from './client';
import type {
  CurrentRoundResponse,
  DoneResponse,
  HomeResponse,
  LiveResponse,
  MeResponse,
  PlayerStatsResponse,
  RoundsListResponse,
  RoundSummaryResponse,
  RoundViewResponse,
  StandingsResponse,
} from './types';

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api<MeResponse>('/api/auth/me'),
    staleTime: 5 * 60 * 1000,
  });
}

export function useHome() {
  return useQuery({
    queryKey: ['home'],
    queryFn: () => api<HomeResponse>('/api/home'),
    refetchInterval: 60_000,
  });
}

export function useCurrentRound() {
  return useQuery({
    queryKey: ['round', 'current'],
    queryFn: () => api<CurrentRoundResponse>('/api/rounds/current'),
    refetchInterval: 60_000,
  });
}

export function useRound(roundId: number | null) {
  return useQuery({
    queryKey: ['round', roundId],
    queryFn: () => api<RoundViewResponse>(`/api/rounds/${roundId}`),
    enabled: roundId !== null,
  });
}

export function useRounds() {
  return useQuery({
    queryKey: ['rounds'],
    queryFn: () => api<RoundsListResponse>('/api/rounds'),
  });
}

export function useRoundSummary(roundId: number | null) {
  return useQuery({
    queryKey: ['round', roundId, 'summary'],
    queryFn: () => api<RoundSummaryResponse>(`/api/rounds/${roundId}/summary`),
    enabled: roundId !== null,
  });
}

export function useStandings() {
  return useQuery({
    queryKey: ['standings'],
    queryFn: () => api<StandingsResponse>('/api/standings'),
    refetchInterval: 60_000,
  });
}

export function useLive() {
  return useQuery({
    queryKey: ['live'],
    queryFn: () => api<LiveResponse>('/api/live'),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function usePlayerStats(userId: number | null) {
  return useQuery({
    queryKey: ['player-stats', userId],
    queryFn: () => api<PlayerStatsResponse>(`/api/users/${userId}/stats`),
    enabled: userId !== null,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { username: string; password: string }) =>
      api<MeResponse>('/api/auth/login', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      username: string;
      password: string;
      displayName: string;
      phone: string;
      inviteCode: string;
    }) => api<MeResponse>('/api/auth/register', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
    // onSettled, not onSuccess: if the server call failed we still drop every
    // cached query, so the user actually lands back on the login screen.
    onSettled: () => {
      qc.clear();
    },
  });
}

export function useSavePrediction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { fixtureId: number; homePred: number; awayPred: number }) =>
      api<{ prediction: { fixtureId: number; homePred: number; awayPred: number } }>(
        `/api/predictions/${input.fixtureId}`,
        { method: 'PUT', body: { homePred: input.homePred, awayPred: input.awayPred } },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['home'] });
      void qc.invalidateQueries({ queryKey: ['round'] });
    },
    onError: () => {
      void qc.invalidateQueries({ queryKey: ['round'] });
    },
  });
}

export function useDoneCheck() {
  return useMutation({
    mutationFn: (roundId: number) =>
      api<DoneResponse>(`/api/rounds/${roundId}/done`, { method: 'POST' }),
  });
}

export function useHistoryRounds() {
  return useQuery({
    queryKey: ['history', 'rounds'],
    queryFn: () => api<{ rounds: Array<RoundDto & { winners: UserPublic[] }> }>('/api/history/rounds'),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { displayName?: string; phone?: string }) =>
      api<MeResponse>('/api/profile', { method: 'PATCH', body: input }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      api<{ ok: true }>('/api/profile/password', { method: 'POST', body: input }),
  });
}

export function useUploadAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('avatar', file);
      return api<MeResponse>('/api/profile/avatar', { method: 'POST', body: form });
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}
