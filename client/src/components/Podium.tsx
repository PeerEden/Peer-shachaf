import type { StandingsEntry } from '@league/shared';
import { Avatar } from './Avatar';
import { TitleChips } from './TitleChips';

function PodiumSpot({
  entry,
  place,
  height,
}: {
  entry: StandingsEntry | undefined;
  place: 1 | 2 | 3;
  height: string;
}) {
  // The medal reflects the player's real (possibly shared) rank, not the
  // physical step — co-leaders on the side steps still show gold.
  const medalRank = entry && entry.rank <= 3 ? (entry.rank as 1 | 2 | 3) : place;
  const medal = { 1: '🥇', 2: '🥈', 3: '🥉' }[medalRank];
  const barColor = {
    1: 'bg-gradient-to-t from-gold-400/30 to-gold-400/60 border-gold-400/50',
    2: 'bg-gradient-to-t from-slate-400/20 to-slate-300/40 border-slate-300/40',
    3: 'bg-gradient-to-t from-amber-700/25 to-amber-600/40 border-amber-600/40',
  }[place];
  return (
    <div className="flex flex-1 flex-col items-center justify-end gap-1.5">
      {entry ? (
        <>
          <div className="relative">
            <Avatar user={entry.user} size={place === 1 ? 'xl' : 'lg'} />
            <span className="absolute -bottom-1 -end-1 text-lg">{medal}</span>
          </div>
          <div className="max-w-24 truncate text-center text-sm font-bold">{entry.user.displayName}</div>
          <TitleChips titles={entry.titles} max={4} />
        </>
      ) : (
        <div className="text-2xl opacity-30">{medal}</div>
      )}
      <div
        className={`flex w-full items-start justify-center rounded-t-2xl border border-b-0 ${barColor} ${height}`}
      >
        <span className="font-display pt-2 text-xl font-extrabold">
          {entry ? entry.totalPoints : '·'}
        </span>
      </div>
    </div>
  );
}

/**
 * The home-screen podium. With shared ranks there may be several players on
 * the same step — we show the first three by rank and mark ties with '='.
 */
export function Podium({ standings }: { standings: StandingsEntry[] }) {
  const first = standings.filter((s) => s.rank === 1);
  const rest = standings.filter((s) => s.rank !== 1);
  const spots: Array<StandingsEntry | undefined> = [
    first[0],
    first[1] ?? rest[0],
    first[2] ?? (first[1] ? rest[0] : rest[1]),
  ];
  return (
    <div className="flex items-end gap-2 px-2 pt-2">
      <PodiumSpot entry={spots[1]} place={2} height="h-16" />
      <PodiumSpot entry={spots[0]} place={1} height="h-24" />
      <PodiumSpot entry={spots[2]} place={3} height="h-12" />
    </div>
  );
}
