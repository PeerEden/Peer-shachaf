import type { FixtureDto } from '@league/shared';
import { useEffect, useRef, useState } from 'react';
import { useSavePrediction } from '../api/hooks';
import { fmtDateTime } from '../lib/format';
import { ScoreStepper } from './ScoreStepper';

type SaveState = 'idle' | 'pending' | 'saved' | 'error';

/**
 * One fixture's quick-entry row: two big steppers, auto-save with a 600ms
 * debounce, and a quiet save indicator.
 */
export function PredictionEditor({
  fixture,
  initial,
  highlightMissing,
  onSavedChange,
}: {
  fixture: FixtureDto;
  initial: { homePred: number; awayPred: number } | null;
  highlightMissing?: boolean;
  onSavedChange?: (fixtureId: number, hasValue: boolean) => void;
}) {
  const save = useSavePrediction();
  const [home, setHome] = useState<number | null>(initial?.homePred ?? null);
  const [away, setAway] = useState<number | null>(initial?.awayPred ?? null);
  const [state, setState] = useState<SaveState>(initial ? 'saved' : 'idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const queueSave = (h: number | null, a: number | null) => {
    if (h === null || a === null) return;
    setState('pending');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      save.mutate(
        { fixtureId: fixture.id, homePred: h, awayPred: a },
        {
          onSuccess: () => {
            setState('saved');
            onSavedChange?.(fixture.id, true);
          },
          onError: () => setState('error'),
        },
      );
    }, 600);
  };

  const isMissing = home === null || away === null;

  return (
    <div
      className={`rounded-3xl border bg-card p-3.5 transition-colors ${
        highlightMissing && isMissing ? 'border-red-500/60 ring-1 ring-red-500/40' : 'border-line'
      }`}
    >
      <div className="mb-2.5 flex items-center justify-between text-xs text-ink-dim">
        <span>{fmtDateTime(fixture.kickoffAt)}</span>
        <span>
          {state === 'pending' && '💾 שומר…'}
          {state === 'saved' && <span className="text-grass-400">✓ נשמר</span>}
          {state === 'error' && <span className="text-red-400">שגיאה בשמירה</span>}
          {state === 'idle' && isMissing && '⚪ עוד לא ניחשת'}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <span
            className="size-3 rounded-full"
            style={{ backgroundColor: fixture.homeTeam.color }}
            aria-hidden
          />
          <span className="w-full truncate text-center text-sm font-bold">{fixture.homeTeam.name}</span>
        </div>
        <ScoreStepper
          value={home}
          label={fixture.homeTeam.name}
          onChange={(v) => {
            setHome(v);
            queueSave(v, away);
          }}
        />
        <span className="font-display text-xl font-extrabold text-ink-dim">:</span>
        <ScoreStepper
          value={away}
          label={fixture.awayTeam.name}
          onChange={(v) => {
            setAway(v);
            queueSave(home, v);
          }}
        />
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <span
            className="size-3 rounded-full"
            style={{ backgroundColor: fixture.awayTeam.color }}
            aria-hidden
          />
          <span className="w-full truncate text-center text-sm font-bold">{fixture.awayTeam.name}</span>
        </div>
      </div>
    </div>
  );
}
