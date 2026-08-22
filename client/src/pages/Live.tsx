import { useLive } from '../api/hooks';
import { Avatar } from '../components/Avatar';
import { FixtureComparison } from '../components/RoundComparison';
import { Card, EmptyState, SectionTitle, Spinner } from '../components/ui';

export default function Live() {
  const live = useLive();

  if (live.isLoading) return <Spinner label="בודק מה קורה במגרשים…" />;
  const data = live.data;

  if (!data || !data.hasLive) {
    return (
      <div className="p-4">
        <EmptyState
          emoji="😴"
          title="אין משחקים חיים כרגע"
          subtitle="כשמשחק יתחיל, כאן תראו תוצאות חיות ומי מרוויח נקודות בזמן אמת"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <Card className="flex items-center justify-between">
        <h1 className="font-display flex items-center gap-2 text-xl font-extrabold">
          <span className="relative flex size-3">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex size-3 rounded-full bg-red-500" />
          </span>
          לייב
        </h1>
        <span className="text-xs text-ink-dim">מתעדכן כל דקה</span>
      </Card>

      {data.fixtures.map((fixture) => (
        <FixtureComparison
          key={fixture.id}
          fixture={fixture}
          predictions={fixture.predictions.map((p) => ({
            fixtureId: fixture.id,
            userId: p.user.id,
            homePred: p.homePred,
            awayPred: p.awayPred,
            user: p.user,
          }))}
          pointsByUser={new Map(fixture.predictions.map((p) => [p.user.id, p.provisionalPoints]))}
          myUserId={-1}
        />
      ))}

      <SectionTitle>אם המשחקים היו נגמרים עכשיו…</SectionTitle>
      <div className="divide-y divide-line/60 overflow-hidden rounded-3xl border border-line bg-card">
        {data.table.map((entry) => {
          const delta = entry.currentRank === null ? 0 : entry.currentRank - entry.rankIfEndedNow;
          return (
            <div key={entry.user.id} className="flex items-center gap-3 px-3.5 py-2.5">
              <span className="w-6 text-center font-display text-base font-extrabold text-ink-dim">
                {entry.rankIfEndedNow}
              </span>
              <Avatar user={entry.user} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{entry.user.displayName}</span>
                <span className="block text-xs text-ink-dim">
                  {entry.bankedPoints} בבנק
                  {entry.provisionalPoints > 0 && (
                    <span className="font-bold text-grass-400"> +{entry.provisionalPoints} עכשיו</span>
                  )}
                </span>
              </span>
              {delta !== 0 && (
                <span className={`text-xs font-bold ${delta > 0 ? 'text-grass-400' : 'text-red-400'}`}>
                  {delta > 0 ? `▲${delta}` : `▼${-delta}`}
                </span>
              )}
              <span className="font-display w-10 text-end text-lg font-extrabold text-grass-300">
                {entry.totalIfEndedNow}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
