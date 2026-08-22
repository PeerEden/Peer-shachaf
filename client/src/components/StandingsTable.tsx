import type { StandingsEntry } from '@league/shared';
import { Link } from 'react-router';
import { Avatar } from './Avatar';
import { Movement } from './Movement';
import { TitleChips } from './TitleChips';

export function StandingsTable({
  standings,
  highlightUserId,
}: {
  standings: StandingsEntry[];
  highlightUserId?: number;
}) {
  return (
    <div className="divide-y divide-line/60 overflow-hidden rounded-3xl border border-line bg-card">
      {standings.map((entry) => (
        <Link
          key={entry.user.id}
          to={`/players/${entry.user.id}`}
          className={`flex items-center gap-3 px-3.5 py-2.5 ${
            entry.user.id === highlightUserId ? 'bg-grass-500/10' : ''
          }`}
        >
          <span
            className={`w-6 text-center font-display text-base font-extrabold ${
              entry.rank === 1 ? 'text-gold-400' : 'text-ink-dim'
            }`}
          >
            {entry.rank}
          </span>
          <Avatar user={entry.user} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {entry.user.displayName} <TitleChips titles={entry.titles} max={4} />
            </span>
            <span className="block text-xs text-ink-dim">
              {entry.exactCount} בולים · {entry.outcomeCount} כיוונים
            </span>
          </span>
          <Movement movement={entry.movement} />
          <span className="font-display w-10 text-end text-lg font-extrabold text-grass-300">
            {entry.totalPoints}
          </span>
        </Link>
      ))}
      {standings.length === 0 && (
        <div className="px-4 py-6 text-center text-sm text-ink-dim">אין עדיין משתתפים</div>
      )}
    </div>
  );
}
