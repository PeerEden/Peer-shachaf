import { Link, useParams } from 'react-router';
import { usePlayerStats } from '../api/hooks';
import { Avatar } from '../components/Avatar';
import { TitleLegend } from '../components/TitleChips';
import { Card, ErrorNote, Spinner } from '../components/ui';

function StatTile({ value, label, emoji }: { value: string | number; label: string; emoji: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-2xl border border-line bg-card p-3">
      <span className="text-lg">{emoji}</span>
      <span className="font-display text-xl font-extrabold text-grass-300">{value}</span>
      <span className="text-center text-xs text-ink-dim">{label}</span>
    </div>
  );
}

export default function PlayerStats() {
  const params = useParams();
  const userId = params.userId ? Number(params.userId) : null;
  const stats = usePlayerStats(userId);

  if (stats.isLoading) return <Spinner label="סופר בולים…" />;
  const data = stats.data;
  if (!data) {
    return (
      <div className="p-4">
        <ErrorNote message="לא הצלחנו לטעון את הסטטיסטיקות. נסו לרענן." />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <Card className="flex flex-col items-center gap-2 py-6 text-center">
        <Avatar user={data.user} size="xl" />
        <h1 className="font-display text-2xl font-extrabold">{data.user.displayName}</h1>
        {data.rank !== null && (
          <span className="text-sm text-ink-dim">
            מקום {data.rank} בליגה · {data.totalPoints} נקודות
          </span>
        )}
        <TitleLegend titles={data.titles} />
      </Card>

      <div className="grid grid-cols-3 gap-2">
        <StatTile emoji="⚽" value={data.totalPoints} label="נקודות" />
        <StatTile emoji="🎯" value={data.exactCount} label="בולים" />
        <StatTile emoji="✓" value={data.outcomeCount} label="כיוונים" />
        <StatTile emoji="📊" value={`${data.successRate}%`} label="אחוז הצלחה" />
        <StatTile emoji="👑" value={data.roundWins} label="ניצחונות מחזור" />
        <StatTile emoji="✏️" value={data.predictionsCount} label="ניחושים" />
        <StatTile emoji="🔥" value={data.currentStreak} label="רצף נוכחי" />
        <StatTile emoji="🏔️" value={data.longestStreak} label="הרצף הכי ארוך" />
        <StatTile emoji="🧮" value={data.scoredFixturesCount} label="משחקים שנוקדו" />
      </div>

      {data.bestRound && (
        <Link to={`/history/${data.bestRound.roundId}`}>
          <Card className="flex items-center justify-between">
            <span className="text-sm">
              🚀 המחזור הכי טוב: <b>{data.bestRound.roundName}</b>
            </span>
            <span className="font-display text-lg font-extrabold text-grass-300">
              +{data.bestRound.points}
            </span>
          </Card>
        </Link>
      )}
      {data.worstRound && data.bestRound?.roundId !== data.worstRound.roundId && (
        <Link to={`/history/${data.worstRound.roundId}`}>
          <Card className="flex items-center justify-between">
            <span className="text-sm">
              💀 המחזור הכי חלש: <b>{data.worstRound.roundName}</b>
            </span>
            <span className="font-display text-lg font-extrabold text-ink-dim">
              +{data.worstRound.points}
            </span>
          </Card>
        </Link>
      )}
    </div>
  );
}
