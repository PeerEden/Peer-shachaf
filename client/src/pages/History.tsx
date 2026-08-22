import { Link } from 'react-router';
import { useHistoryRounds } from '../api/hooks';
import { Avatar } from '../components/Avatar';
import { Card, EmptyState, Spinner } from '../components/ui';

export default function History() {
  const history = useHistoryRounds();

  if (history.isLoading) return <Spinner label="פותח את הארכיון…" />;
  const rounds = history.data?.rounds ?? [];

  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="font-display text-2xl font-extrabold text-grass-300">📜 היסטוריה</h1>
      {rounds.length === 0 && (
        <EmptyState
          emoji="🕳️"
          title="עוד אין מחזורים סגורים"
          subtitle="אחרי שהמחזור הראשון יסתיים, כל התוצאות והניחושים יופיעו כאן"
        />
      )}
      {rounds.map((round) => (
        <Link key={round.id} to={`/history/${round.id}`}>
          <Card className="flex items-center justify-between">
            <div>
              <div className="font-display text-lg font-bold">{round.name}</div>
              <div className="mt-1 flex items-center gap-1.5 text-sm text-ink-dim">
                {round.winners.length > 0 ? (
                  <>
                    <span>👑</span>
                    {round.winners.map((w) => (
                      <span key={w.id} className="flex items-center gap-1">
                        <Avatar user={w} size="sm" />
                        <span className="font-medium text-ink">{w.displayName}</span>
                      </span>
                    ))}
                  </>
                ) : (
                  <span>💀 בלי מנצח</span>
                )}
              </div>
            </div>
            <span className="text-ink-dim">←</span>
          </Card>
        </Link>
      ))}
    </div>
  );
}
