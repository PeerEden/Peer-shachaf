import { useMemo, useState } from 'react';
import type { FixtureDto, UserPublic } from '@league/shared';
import { useAdminAction, useAdminRoundPredictions } from '../../api/admin';
import { useRounds } from '../../api/hooks';
import { Avatar } from '../../components/Avatar';
import { Button, Card, ErrorNote, SectionTitle, Spinner, TextInput } from '../../components/ui';
import { fmtDateTime } from '../../lib/format';

type Action = ReturnType<typeof useAdminAction>;
type Existing = { homePred: number; awayPred: number } | undefined;

/** Postponed and cancelled games carry no predictions — the server rejects them. */
function isFillable(fixture: FixtureDto): boolean {
  return fixture.status !== 'postponed' && fixture.status !== 'cancelled';
}

function ResultBadge({ fixture }: { fixture: FixtureDto }) {
  if (fixture.homeScore === null || fixture.awayScore === null) {
    return <span className="text-xs text-ink-dim">טרם שוחק</span>;
  }
  return (
    <span className="flex items-center gap-1.5">
      <span className="font-display text-base font-extrabold text-ink" dir="ltr">
        {/* away first: in this RTL row the right-hand number is the home score */}
        {fixture.awayScore} : {fixture.homeScore}
      </span>
      {fixture.status === 'live' && (
        <span className="text-xs font-bold text-red-300">🔴 {fixture.liveMinute ?? 'חי'}</span>
      )}
    </span>
  );
}

function PredictionRow({
  fixture,
  existing,
  userId,
  action,
}: {
  fixture: FixtureDto;
  existing: Existing;
  userId: number;
  action: Action;
}) {
  const [home, setHome] = useState(existing ? String(existing.homePred) : '');
  const [away, setAway] = useState(existing ? String(existing.awayPred) : '');
  const [saved, setSaved] = useState(false);

  const fillable = isFillable(fixture);
  const dirty =
    home !== (existing ? String(existing.homePred) : '') ||
    away !== (existing ? String(existing.awayPred) : '');

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-bold">
          {fixture.homeTeam.name} — {fixture.awayTeam.name}
        </span>
        <ResultBadge fixture={fixture} />
      </div>
      <div className="flex items-center justify-between text-xs text-ink-dim">
        <span>{fmtDateTime(fixture.kickoffAt)}</span>
        {existing ? (
          <span className="text-grass-300">
            ניחוש קיים: <span dir="ltr">{existing.awayPred} : {existing.homePred}</span>
          </span>
        ) : (
          <span className="text-gold-300">אין ניחוש</span>
        )}
      </div>

      {fillable ? (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const h = Number(home);
            const a = Number(away);
            if (!Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0) return;
            action.mutate(
              {
                path: '/api/admin/predictions',
                method: 'PUT',
                body: { userId, fixtureId: fixture.id, homePred: h, awayPred: a },
              },
              { onSuccess: () => setSaved(true) },
            );
          }}
        >
          <div className="w-16">
            <TextInput
              label="בית"
              type="number"
              inputMode="numeric"
              min={0}
              max={99}
              value={home}
              onChange={(e) => {
                setHome(e.target.value);
                setSaved(false);
              }}
              required
            />
          </div>
          <div className="w-16">
            <TextInput
              label="חוץ"
              type="number"
              inputMode="numeric"
              min={0}
              max={99}
              value={away}
              onChange={(e) => {
                setAway(e.target.value);
                setSaved(false);
              }}
              required
            />
          </div>
          <Button type="submit" variant="ghost" className="!py-2.5 text-sm" disabled={action.isPending}>
            {saved && !dirty ? 'נשמר ✓' : 'שמירה'}
          </Button>
        </form>
      ) : (
        <p className="text-xs text-ink-dim">
          {fixture.status === 'postponed' ? '⏸️ המשחק נדחה' : '🚫 המשחק בוטל'} — אין ניחושים עליו
        </p>
      )}
    </Card>
  );
}

export default function AdminPredictions() {
  const roundsQuery = useRounds();
  const action = useAdminAction();
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [selectedUser, setSelectedUser] = useState<number | null>(null);

  const rounds = roundsQuery.data?.rounds ?? [];
  // Default to whatever the league is busy with: the open round, else the
  // latest closed one — those are the rounds an admin backfills.
  const defaultRound = useMemo(
    () =>
      rounds.find((r) => r.status === 'open') ??
      [...rounds].reverse().find((r) => r.status === 'closed') ??
      rounds[0],
    [rounds],
  );
  const roundId = selectedRound ?? defaultRound?.id ?? null;
  const view = useAdminRoundPredictions(roundId);

  const users: UserPublic[] = view.data?.users ?? [];
  const userId = selectedUser ?? users[0]?.id ?? null;

  const byFixture = useMemo(() => {
    const map = new Map<number, Existing>();
    for (const p of view.data?.predictions ?? []) {
      if (p.userId === userId) map.set(p.fixtureId, { homePred: p.homePred, awayPred: p.awayPred });
    }
    return map;
  }, [view.data, userId]);

  const fixtures = view.data?.fixtures ?? [];
  const fillable = fixtures.filter(isFillable);
  const countsByUser = useMemo(() => {
    const fillableIds = new Set(fillable.map((f) => f.id));
    const counts = new Map<number, number>();
    for (const p of view.data?.predictions ?? []) {
      if (fillableIds.has(p.fixtureId)) counts.set(p.userId, (counts.get(p.userId) ?? 0) + 1);
    }
    return counts;
  }, [view.data, fillable]);

  if (roundsQuery.isLoading) return <Spinner />;
  if (rounds.length === 0) {
    return <p className="text-center text-sm text-ink-dim">אין עדיין מחזורים בעונה</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-dim">
        הזנה ידנית של ניחושים — גם למחזורים שכבר שוחקו או משוחקים עכשיו. כל שינוי נרשם ביומן,
        והנקודות מחושבות מחדש אוטומטית.
      </p>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-ink-dim">מחזור</span>
        <select
          className="w-full rounded-2xl border border-line bg-pitch-900 px-3 py-3 text-ink"
          value={roundId ?? ''}
          onChange={(e) => setSelectedRound(Number(e.target.value))}
        >
          {rounds.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.status === 'open' ? 'פתוח' : r.status === 'closed' ? 'הסתיים' : 'ממתין'})
            </option>
          ))}
        </select>
      </label>

      {view.isLoading && <Spinner />}

      {view.data && users.length === 0 && (
        <p className="text-center text-sm text-ink-dim">אין עדיין שחקנים רשומים</p>
      )}

      {view.data && users.length > 0 && (
        <>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-dim">שחקן</span>
            <select
              className="w-full rounded-2xl border border-line bg-pitch-900 px-3 py-3 text-ink"
              value={userId ?? ''}
              onChange={(e) => setSelectedUser(Number(e.target.value))}
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName} ({countsByUser.get(u.id) ?? 0}/{fillable.length})
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap gap-2">
            {users.map((u) => {
              const filled = countsByUser.get(u.id) ?? 0;
              const done = fillable.length > 0 && filled === fillable.length;
              return (
                <button
                  key={u.id}
                  onClick={() => setSelectedUser(u.id)}
                  className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs ${
                    u.id === userId
                      ? 'border-gold-400/60 bg-gold-400/15 text-gold-300'
                      : done
                        ? 'border-grass-500/40 bg-grass-500/10 text-grass-300'
                        : 'border-line bg-pitch-900 text-ink-dim'
                  }`}
                >
                  <Avatar user={u} size="sm" />
                  {u.displayName}
                  <span>{done ? '✓' : `${filled}/${fillable.length}`}</span>
                </button>
              );
            })}
          </div>

          <ErrorNote message={action.isError ? action.error.message : null} />

          <SectionTitle>משחקי המחזור</SectionTitle>
          {fixtures.length === 0 && (
            <p className="text-center text-sm text-ink-dim">אין משחקים במחזור הזה</p>
          )}
          {userId !== null &&
            fixtures.map((fixture) => (
              <PredictionRow
                key={`${userId}:${fixture.id}`}
                fixture={fixture}
                existing={byFixture.get(fixture.id)}
                userId={userId}
                action={action}
              />
            ))}
        </>
      )}
    </div>
  );
}
