import { useMemo, useState } from 'react';
import type { FixtureDto, TeamDto } from '@league/shared';
import { useAdminAction, useAdminTeams, useAdminUsers } from '../../api/admin';
import { useRound, useRounds } from '../../api/hooks';
import { Button, Card, ErrorNote, SectionTitle, Spinner, TextInput } from '../../components/ui';
import { fmtDateTime } from '../../lib/format';

type Action = ReturnType<typeof useAdminAction>;

const STATUS_LABEL: Record<FixtureDto['status'], string> = {
  scheduled: '🗓️ מתוכנן',
  live: '🔴 חי',
  finished: '✅ הסתיים',
  postponed: '⏸️ נדחה',
  cancelled: '🚫 בוטל',
};

function toLocalInputValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ScorePairForm({
  label,
  initial,
  extra,
  onSubmit,
  pending,
}: {
  label: string;
  initial?: { home: number | null; away: number | null };
  extra?: { label: string; value: string; onChange: (v: string) => void };
  onSubmit: (home: number, away: number) => void;
  pending: boolean;
}) {
  const [home, setHome] = useState(initial?.home?.toString() ?? '');
  const [away, setAway] = useState(initial?.away?.toString() ?? '');
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const h = Number(home);
        const a = Number(away);
        if (Number.isInteger(h) && Number.isInteger(a) && h >= 0 && a >= 0) onSubmit(h, a);
      }}
    >
      <div className="w-16">
        <TextInput label="בית" type="number" inputMode="numeric" min={0} max={99} value={home} onChange={(e) => setHome(e.target.value)} required />
      </div>
      <div className="w-16">
        <TextInput label="חוץ" type="number" inputMode="numeric" min={0} max={99} value={away} onChange={(e) => setAway(e.target.value)} required />
      </div>
      {extra && (
        <div className="w-20">
          <TextInput label={extra.label} value={extra.value} onChange={(e) => extra.onChange(e.target.value)} />
        </div>
      )}
      <Button type="submit" variant="ghost" className="!py-2.5 text-sm" disabled={pending}>
        {label}
      </Button>
    </form>
  );
}

function DateForm({ label, initial, onSubmit, pending }: { label: string; initial: number; onSubmit: (ms: number) => void; pending: boolean }) {
  const [value, setValue] = useState(toLocalInputValue(initial));
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const ms = new Date(value).getTime();
        if (!Number.isNaN(ms)) onSubmit(ms);
      }}
    >
      <div className="flex-1">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink-dim">תאריך ושעה</span>
          <input
            type="datetime-local"
            className="w-full rounded-2xl border border-line bg-pitch-900 px-3 py-2.5 text-ink"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
          />
        </label>
      </div>
      <Button type="submit" variant="ghost" className="!py-2.5 text-sm" disabled={pending}>
        {label}
      </Button>
    </form>
  );
}

function AdminFixtureCard({
  fixture,
  users,
  action,
}: {
  fixture: FixtureDto;
  users: Array<{ id: number; displayName: string }>;
  action: Action;
}) {
  const [panel, setPanel] = useState<'result' | 'live' | 'edit' | 'reschedule' | 'predfix' | null>(null);
  const [liveMinute, setLiveMinute] = useState(fixture.liveMinute ?? "1'");
  const [predUser, setPredUser] = useState<string>(users[0]?.id.toString() ?? '');

  const act = (path: string, method: 'POST' | 'PATCH' | 'DELETE' | 'PUT', body?: unknown) =>
    action.mutate({ path, method, body }, { onSuccess: () => setPanel(null) });

  const pill = (label: string, key: typeof panel) => (
    <button
      key={label}
      className={`rounded-xl border px-2.5 py-1 text-xs font-bold ${
        panel === key ? 'border-gold-400/60 bg-gold-400/15 text-gold-300' : 'border-line bg-card-raised'
      }`}
      onClick={() => setPanel(panel === key ? null : key)}
    >
      {label}
    </button>
  );

  const s = fixture.status;

  return (
    <Card className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-bold">
          {fixture.homeTeam.name} — {fixture.awayTeam.name}
        </span>
        <span className="text-xs">{STATUS_LABEL[s]}</span>
      </div>
      <div className="flex items-center justify-between text-xs text-ink-dim">
        <span>
          {fmtDateTime(fixture.kickoffAt)}
          {fixture.isCompletion && <span className="ms-1 text-gold-300">· משחק השלמה</span>}
        </span>
        {fixture.homeScore !== null && fixture.awayScore !== null && (
          <span className="font-display text-base font-extrabold text-ink" dir="ltr">
            {/* away first: in the RTL card the right-hand number = home score */}
            {fixture.awayScore} : {fixture.homeScore} {fixture.liveMinute && `(${fixture.liveMinute})`}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(s === 'scheduled' || s === 'live') && pill('🔴 לייב', 'live')}
        {(s === 'scheduled' || s === 'live') && pill('✅ תוצאה', 'result')}
        {s === 'finished' && pill('✏️ תיקון תוצאה', 'result')}
        {s === 'scheduled' && pill('🕒 שינוי מועד', 'edit')}
        {s === 'postponed' && pill('📅 מועד חדש', 'reschedule')}
        {(s === 'scheduled' || s === 'live') && (
          <button
            className="rounded-xl border border-line bg-card-raised px-2.5 py-1 text-xs font-bold"
            onClick={() => {
              if (window.confirm('לדחות את המשחק? הניחושים עליו יימחקו.')) {
                act(`/api/admin/fixtures/${fixture.id}/postpone`, 'POST');
              }
            }}
          >
            ⏸️ דחייה
          </button>
        )}
        {s !== 'finished' && s !== 'cancelled' && (
          <button
            className="rounded-xl border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-xs font-bold text-red-300"
            onClick={() => {
              if (window.confirm('לבטל את המשחק סופית? לא יחולקו עליו נקודות.')) {
                act(`/api/admin/fixtures/${fixture.id}/cancel`, 'POST');
              }
            }}
          >
            🚫 ביטול
          </button>
        )}
        {(s === 'finished' || s === 'live') && pill('🧾 תיקון ניחוש', 'predfix')}
        <button
          className="rounded-xl border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-xs text-red-300"
          onClick={() => {
            if (window.confirm('למחוק את המשחק לגמרי (כולל ניחושים ונקודות)?')) {
              act(`/api/admin/fixtures/${fixture.id}`, 'DELETE');
            }
          }}
        >
          🗑️
        </button>
      </div>

      {panel === 'result' && (
        <ScorePairForm
          label="שמירת תוצאה"
          initial={{ home: fixture.homeScore, away: fixture.awayScore }}
          pending={action.isPending}
          onSubmit={(h, a) => act(`/api/admin/fixtures/${fixture.id}/result`, 'POST', { homeScore: h, awayScore: a })}
        />
      )}
      {panel === 'live' && (
        <ScorePairForm
          label="עדכון לייב"
          initial={{ home: fixture.homeScore, away: fixture.awayScore }}
          extra={{ label: 'דקה', value: liveMinute, onChange: setLiveMinute }}
          pending={action.isPending}
          onSubmit={(h, a) =>
            act(`/api/admin/fixtures/${fixture.id}/live`, 'PATCH', { homeScore: h, awayScore: a, liveMinute })
          }
        />
      )}
      {panel === 'edit' && (
        <DateForm
          label="עדכון"
          initial={fixture.kickoffAt}
          pending={action.isPending}
          onSubmit={(ms) => act(`/api/admin/fixtures/${fixture.id}`, 'PATCH', { kickoffAt: ms })}
        />
      )}
      {panel === 'reschedule' && (
        <DateForm
          label="קביעה"
          initial={Date.now() + 7 * 24 * 60 * 60 * 1000}
          pending={action.isPending}
          onSubmit={(ms) => act(`/api/admin/fixtures/${fixture.id}/reschedule`, 'POST', { kickoffAt: ms })}
        />
      )}
      {panel === 'predfix' && (
        <div className="flex flex-col gap-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-dim">שחקן</span>
            <select
              className="w-full rounded-2xl border border-line bg-pitch-900 px-3 py-2.5 text-ink"
              value={predUser}
              onChange={(e) => setPredUser(e.target.value)}
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName}
                </option>
              ))}
            </select>
          </label>
          <ScorePairForm
            label="תיקון ניחוש"
            pending={action.isPending}
            onSubmit={(h, a) =>
              act('/api/admin/predictions', 'PUT', {
                userId: Number(predUser),
                fixtureId: fixture.id,
                homePred: h,
                awayPred: a,
              })
            }
          />
        </div>
      )}
    </Card>
  );
}

export default function AdminFixtures() {
  const roundsQuery = useRounds();
  const teamsQuery = useAdminTeams();
  const usersQuery = useAdminUsers();
  const action = useAdminAction();
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [form, setForm] = useState({ home: '', away: '', kickoff: toLocalInputValue(Date.now() + 24 * 60 * 60 * 1000) });

  const rounds = roundsQuery.data?.rounds ?? [];
  const defaultRound = useMemo(
    () => rounds.find((r) => r.status === 'open') ?? rounds.find((r) => r.status === 'pending') ?? rounds[0],
    [rounds],
  );
  const roundId = selectedRound ?? defaultRound?.id ?? null;
  const view = useRound(roundId);
  const teams: TeamDto[] = (teamsQuery.data?.teams ?? []).filter((t) => t.isActive);
  const users = usersQuery.data?.users ?? [];

  if (roundsQuery.isLoading) return <Spinner />;

  return (
    <div className="flex flex-col gap-3">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-ink-dim">מחזור</span>
        <select
          className="w-full rounded-2xl border border-line bg-pitch-900 px-3 py-3 text-ink"
          value={roundId ?? ''}
          onChange={(e) => setSelectedRound(Number(e.target.value))}
        >
          {rounds.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.status === 'open' ? 'פתוח' : r.status === 'closed' ? 'סגור' : 'ממתין'})
            </option>
          ))}
        </select>
      </label>

      <ErrorNote message={action.isError ? action.error.message : null} />

      {roundId && (
        <Card>
          <form
            className="flex flex-col gap-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              const kickoffAt = new Date(form.kickoff).getTime();
              if (form.home && form.away && form.home !== form.away && !Number.isNaN(kickoffAt)) {
                action.mutate({
                  path: '/api/admin/fixtures',
                  method: 'POST',
                  body: {
                    roundId,
                    homeTeamId: Number(form.home),
                    awayTeamId: Number(form.away),
                    kickoffAt,
                  },
                });
              }
            }}
          >
            <div className="font-bold">הוספת משחק למחזור</div>
            <div className="flex gap-2">
              {(['home', 'away'] as const).map((side) => (
                <select
                  key={side}
                  className="min-w-0 flex-1 rounded-2xl border border-line bg-pitch-900 px-2 py-2.5 text-sm text-ink"
                  value={form[side]}
                  onChange={(e) => setForm((f) => ({ ...f, [side]: e.target.value }))}
                  required
                >
                  <option value="">{side === 'home' ? 'קבוצת בית' : 'קבוצת חוץ'}</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              ))}
            </div>
            <input
              type="datetime-local"
              className="rounded-2xl border border-line bg-pitch-900 px-3 py-2.5 text-ink"
              value={form.kickoff}
              onChange={(e) => setForm((f) => ({ ...f, kickoff: e.target.value }))}
              required
            />
            <Button type="submit" variant="ghost" disabled={action.isPending}>
              הוספה ➕
            </Button>
          </form>
        </Card>
      )}

      <SectionTitle>משחקי המחזור</SectionTitle>
      {view.isLoading && <Spinner />}
      {(view.data?.fixtures ?? []).map((fixture) => (
        <AdminFixtureCard key={fixture.id} fixture={fixture} users={users} action={action} />
      ))}
      {view.data && view.data.fixtures.length === 0 && (
        <p className="text-center text-sm text-ink-dim">אין עדיין משחקים במחזור הזה</p>
      )}
    </div>
  );
}
