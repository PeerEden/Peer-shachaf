import { useOutletContext, useParams } from 'react-router';
import type { UserPrivate } from '@league/shared';
import { useRound, useRoundSummary } from '../api/hooks';
import { Avatar } from '../components/Avatar';
import { Movement } from '../components/Movement';
import { buildComparisonData, FixtureComparison } from '../components/RoundComparison';
import { TitleChips } from '../components/TitleChips';
import { Card, ErrorNote, SectionTitle, Spinner } from '../components/ui';

/** A past round in full: summary, standings snapshot, and every game's predictions. */
export default function HistoryRound() {
  const { me } = useOutletContext<{ me: UserPrivate }>();
  const params = useParams();
  const roundId = params.roundId ? Number(params.roundId) : null;
  const view = useRound(roundId);
  const summary = useRoundSummary(roundId);

  if (view.isLoading || summary.isLoading) return <Spinner label="טוען את המחזור…" />;
  if (!view.data) {
    return (
      <div className="p-4">
        <ErrorNote message="לא הצלחנו לטעון את המחזור. נסו לרענן." />
      </div>
    );
  }

  const { predsByFixture, scoresByFixture } = buildComparisonData(view.data);
  const entries = summary.data?.entries ?? [];

  return (
    <div className="flex flex-col gap-3 p-4">
      <Card className="flex items-center justify-between">
        <h1 className="font-display text-xl font-extrabold">{view.data.round.name}</h1>
        <span className="text-sm text-ink-dim">
          {view.data.round.finishedCount}/{view.data.round.fixtureCount} שוחקו
        </span>
      </Card>

      {entries.length > 0 && (
        <>
          <SectionTitle>סיכום הנקודות</SectionTitle>
          <div className="divide-y divide-line/60 overflow-hidden rounded-3xl border border-line bg-card">
            {entries.map((entry) => (
              <div key={entry.user.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <span className="w-6 text-center font-display font-extrabold text-ink-dim">
                  {entry.rankInRound}
                </span>
                <Avatar user={entry.user} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {entry.user.displayName} {entry.isRoundWinner && '👑'}{' '}
                    <TitleChips titles={entry.titles.filter((t) => t !== 'round_winner')} />
                  </span>
                  <span className="block text-xs text-ink-dim">
                    🎯 {entry.exactCount} · ✓ {entry.outcomeCount} · סה"כ {entry.seasonTotalAfter} (מקום{' '}
                    {entry.rankAfter})
                  </span>
                </span>
                <Movement movement={entry.movement} />
                <span className="font-display w-9 text-end text-lg font-extrabold text-grass-300">
                  +{entry.points}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <SectionTitle>המשחקים והניחושים</SectionTitle>
      <div className="flex flex-col gap-3">
        {view.data.fixtures
          .filter((f) => f.status !== 'cancelled')
          .map((f) => (
            <FixtureComparison
              key={f.id}
              fixture={f}
              predictions={predsByFixture.get(f.id) ?? []}
              pointsByUser={scoresByFixture.get(f.id) ?? new Map()}
              myUserId={me.id}
            />
          ))}
      </div>
    </div>
  );
}
