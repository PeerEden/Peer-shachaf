import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TeamDto } from '@league/shared';
import { api } from './client';
import type { AdminRoundPredictionsResponse, AdminUsersResponse, AuditResponse } from './types';

export function useAdminUsers() {
  return useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => api<AdminUsersResponse>('/api/admin/users'),
  });
}

export function useAdminTeams() {
  return useQuery({
    queryKey: ['admin', 'teams'],
    queryFn: () => api<{ teams: TeamDto[] }>('/api/admin/teams'),
  });
}

export function useAdminRoundPredictions(roundId: number | null) {
  return useQuery({
    queryKey: ['admin', 'round-predictions', roundId],
    queryFn: () =>
      api<AdminRoundPredictionsResponse>(`/api/admin/rounds/${roundId}/predictions`),
    enabled: roundId !== null,
  });
}

export function useAdminAudit() {
  return useQuery({
    queryKey: ['admin', 'audit'],
    queryFn: () => api<AuditResponse>('/api/admin/audit'),
  });
}

export function useAdminSettings() {
  return useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api<{ settings: { inviteCode: string; leagueName: string } | null }>('/api/admin/settings'),
  });
}

/** One mutation for every admin action; invalidates all queries on success. */
export function useAdminAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      path: string;
      method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
      body?: unknown;
    }) => api<unknown>(input.path, { method: input.method, body: input.body }),
    onSuccess: () => qc.invalidateQueries(),
  });
}
