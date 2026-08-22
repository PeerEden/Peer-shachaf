import { Link, useParams } from 'react-router';
import { useRoundSummary } from '../api/hooks';
import { Avatar } from '../components/Avatar';
import { Movement } from '../components/Movement';
import { TitleChips } from '../components/TitleChips';
import { Card, ErrorNote, Spinner } from '../components/ui';

export default function RoundSummary() {
  const params = useParams();
  const roundId = params.roundId ? Number(params.roundId) : null;
  const summary = useRoundSummary(roundId);

  if (summary.isLoading) return <Spinner label="טוען סיכום…" />;
  if (summary.isError || !summary.data) {
    return (
      <div className="p-4">
        <ErrorNote message="הסיכום עוד לא מוכן — המחזור כנראה טרם הסתיים." />
        <Link to="/history" className="mt-3 block text-center text-sm text-grass-300 underline">
          להיסטוריה
        </Link>
      </div>
    );
  }

  const { round, entries } = summary.data;
  const winners = entries.filter((e) => e.isRoundWinner);

  return (
    <div className="flex flex-col gap-3 p-4">
      <Card className="text-center">
        <div className="text-4xl">🎉</div>
        <h1 className="font-display mt-1 text-2xl font-extrabold">סיכום {round.name}</h1>
        {winners.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
            {winners.map((w) => (
              <div key={w.user.id} className="flex flex-col items-center gap-1">
                <div className="relative">
                  <Avatar user={w.user} size="lg" />
                  <span className="absolute -top-2 start-1/2 -translate-x-1/2 text-xl">👑</span>
                </div>
                <span className="text-sm font-bold">{w.user.displayName}</span>
                <span className="font-display text-lg font-extrabold text-gold-300">{w.points} נק׳</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink-dim">אף אחד לא ניצח את המחזור הזה… 💀</p>
        )}
      </Card>

      <div className="divide-y divide-line/60 overflow-hidden rounded-3xl border border-line bg-card">
        {entries.map((entry) => (
          <div key={entry.user.id} className="flex items-center gap-3 px-3.5 py-2.5">
            <span className="w-6 text-center font-display text-base font-extrabold text-ink-dim">
              {entry.rankInRound}
            </span>
            <Avatar user={entry.user} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {entry.user.displayName} <TitleChips titles={entry.titles} />
              </span>
              <span className="block text-xs text-ink-dim">
                🎯 {entry.exactCount} בולים · ✓ {entry.outcomeCount} כיוונים
              </span>
            </span>
            <span className="flex flex-col items-end gap-0.5">
              <span className="font-display text-lg font-extrabold text-grass-300">+{entry.points}</span>
              <span className="flex items-center gap-1 text-xs text-ink-dim">
                מקום {entry.rankAfter} <Movement movement={entry.movement} />
              </span>
            </span>
          </div>
        ))}
      </div>

      <Link
        to="/"
        className="block rounded-2xl border border-line bg-card-raised py-3 text-center font-bold active:scale-[0.98]"
      >
        לטבלה המלאה 🏠
      </Link>
    </div>
  );
}
