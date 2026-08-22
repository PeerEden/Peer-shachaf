import { useState } from 'react';
import { useAdminAction, useAdminTeams } from '../../api/admin';
import { Button, Card, ErrorNote, Spinner, TextInput } from '../../components/ui';

export default function AdminTeams() {
  const teamsQuery = useAdminTeams();
  const action = useAdminAction();
  const [form, setForm] = useState({ name: '', shortName: '', color: '#22c55e' });

  if (teamsQuery.isLoading) return <Spinner />;
  const teams = teamsQuery.data?.teams ?? [];

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            action.mutate(
              { path: '/api/admin/teams', method: 'POST', body: form },
              { onSuccess: () => setForm({ name: '', shortName: '', color: '#22c55e' }) },
            );
          }}
        >
          <div className="font-bold">הוספת קבוצה</div>
          <TextInput
            label="שם מלא"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <div className="flex gap-2">
            <div className="flex-1">
              <TextInput
                label="שם קצר"
                value={form.shortName}
                onChange={(e) => setForm((f) => ({ ...f, shortName: e.target.value }))}
                required
              />
            </div>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-dim">צבע</span>
              <input
                type="color"
                className="h-12 w-16 rounded-2xl border border-line bg-pitch-900"
                value={form.color}
                onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
              />
            </label>
          </div>
          <Button type="submit" variant="ghost" disabled={action.isPending}>
            הוספה ➕
          </Button>
        </form>
      </Card>

      <ErrorNote message={action.isError ? action.error.message : null} />

      <div className="divide-y divide-line/60 overflow-hidden rounded-3xl border border-line bg-card">
        {teams.map((team) => (
          <div key={team.id} className="flex items-center gap-3 px-3.5 py-2.5">
            <span className="size-4 shrink-0 rounded-full" style={{ backgroundColor: team.color }} />
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-sm font-medium ${team.isActive ? '' : 'line-through opacity-50'}`}>
                {team.name}
              </span>
              <span className="block text-xs text-ink-dim">{team.shortName}</span>
            </span>
            <button
              className="rounded-xl border border-line bg-card-raised px-2.5 py-1 text-xs"
              onClick={() => {
                const name = window.prompt('שם חדש:', team.name);
                if (name && name.trim().length >= 2) {
                  action.mutate({
                    path: `/api/admin/teams/${team.id}`,
                    method: 'PATCH',
                    body: { name: name.trim() },
                  });
                }
              }}
            >
              ✏️
            </button>
            <button
              className="rounded-xl border border-line bg-card-raised px-2.5 py-1 text-xs"
              title={team.isActive ? 'סימון כלא פעילה' : 'החזרה לפעילה'}
              onClick={() =>
                action.mutate({
                  path: `/api/admin/teams/${team.id}`,
                  method: 'PATCH',
                  body: { isActive: !team.isActive },
                })
              }
            >
              {team.isActive ? '💤' : '▶️'}
            </button>
            <button
              className="rounded-xl border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-xs text-red-300"
              onClick={() => {
                if (window.confirm(`למחוק את ${team.name}?`)) {
                  action.mutate({ path: `/api/admin/teams/${team.id}`, method: 'DELETE' });
                }
              }}
            >
              🗑️
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
