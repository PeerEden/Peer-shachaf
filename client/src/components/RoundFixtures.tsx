import type { FixtureDto } from '@league/shared';
import { fmtDateTime } from '../lib/format';

/**
 * The round's games with whatever is already known about them: final scores,
 * live scores, or the kickoff time. Scores are public from the moment they
 * happen (only predictions are private), so this renders at any round state.
 */
export function RoundFixtures({ fixtures }: { fixtures: FixtureDto[] }) {
  if (fixtures.length === 0) {
    return <p className="text-sm text-ink-dim">עוד לא נקבעו משחקים למחזור הזה</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-line">
      {fixtures.map((f) => (
        <li key={f.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">
              {f.homeTeam.name} — {f.awayTeam.name}
            </div>
            <div className="text-xs text-ink-dim">
              {fmtDateTime(f.kickoffAt)}
              {f.isCompletion && <span className="ms-1 text-gold-300">· השלמה</span>}
            </div>
          </div>
          <FixtureOutcome fixture={f} />
        </li>
      ))}
    </ul>
  );
}

function FixtureOutcome({ fixture: f }: { fixture: FixtureDto }) {
  if (f.status === 'postponed') return <span className="text-xs text-ink-dim">⏸️ נדחה</span>;
  if (f.status === 'cancelled') return <span className="text-xs text-ink-dim">🚫 בוטל</span>;

  if (f.homeScore === null || f.awayScore === null) {
    return <span className="whitespace-nowrap text-xs text-ink-dim">טרם שוחק</span>;
  }

  const score = (
    // away first: in this RTL row the right-hand number lines up with the home team
    <span className="font-display text-lg font-extrabold text-ink" dir="ltr">
      {f.awayScore} : {f.homeScore}
    </span>
  );

  if (f.status === 'live') {
    return (
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        {score}
        <span className="flex items-center gap-1 text-xs font-bold text-red-300">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-red-500" />
          </span>
          {f.liveMinute ?? 'חי'}
        </span>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      {score}
      <span className="text-xs text-grass-300">✓</span>
    </span>
  );
}
