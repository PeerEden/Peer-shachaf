import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router';
import type { UserPrivate } from '@league/shared';
import { useCurrentRound, useDoneCheck, useHome } from '../api/hooks';
import type { RoundViewResponse } from '../api/types';
import { Countdown } from '../components/Countdown';
import { PredictionEditor } from '../components/PredictionEditor';
import { buildComparisonData, FixtureComparison } from '../components/RoundComparison';
import { Button, Card, EmptyState, SectionTitle, Spinner } from '../components/ui';

function OpenRoundEditor({ view }: { view: RoundViewResponse }) {
  const done = useDoneCheck();
  const [highlightMissing, setHighlightMissing] = useState(false);

  const myPredictions = useMemo(() => {
    const map = new Map<number, { homePred: number; awayPred: number }>();
    for (const p of view.predictions) map.set(p.fixtureId, { homePred: p.homePred, awayPred: p.awayPred });
    return map;
  }, [view.predictions]);

  const editable = view.fixtures.filter(
    (f) => !f.isCompletion && f.status !== 'postponed' && f.status !== 'cancelled',
  );

  return (
    <>
      <Card className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-extrabold">{view.round.name}</h1>
          <p className="text-xs text-ink-dim">אפשר לשנות עד תחילת המשחק הראשון</p>
        </div>
        {view.round.lockAt && (
          <span className="text-end text-sm text-ink-dim">
            <Countdown target={view.round.lockAt} prefix="⏳" />
          </span>
        )}
      </Card>

      <div className="flex flex-col gap-3">
        {editable.map((f) => (
          <PredictionEditor
            key={f.id}
            fixture={f}
            initial={myPredictions.get(f.id) ?? null}
            highlightMissing={highlightMissing}
          />
        ))}
      </div>

      <Button
        className="mt-2"
        disabled={done.isPending}
        onClick={() =>
          done.mutate(view.round.id, {
            onSuccess: (result) => setHighlightMissing(!result.complete),
          })
        }
      >
        סיימתי לנחש ✅
      </Button>
      {done.data && done.data.complete && (
        <p className="text-center text-sm font-bold text-grass-300">
          🎉 כל {done.data.total} הניחושים בפנים! אפשר לשנות עד הנעילה.
        </p>
      )}
      {done.data && !done.data.complete && (
        <p className="text-center text-sm font-bold text-gold-300">
          חסרים עוד {done.data.missing.length} ניחושים — המשכקים המסומנים באדום
        </p>
      )}
    </>
  );
}

function LockedRoundView({ view, myUserId }: { view: RoundViewResponse; myUserId: number }) {
  const { predsByFixture, scoresByFixture } = buildComparisonData(view);
  const visible = view.fixtures.filter((f) => f.status !== 'cancelled' && !f.isCompletion);
  const completions = view.fixtures.filter((f) => f.isCompletion);

  return (
    <>
      <Card className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-extrabold">{view.round.name}</h1>
          <p className="text-xs text-ink-dim">
            {view.round.derivedState === 'finished'
              ? 'המחזור הסתיים'
              : '🔒 המחזור נעול — אלה הניחושים של כולם'}
          </p>
        </div>
        <span className="text-sm text-ink-dim">
          {view.round.finishedCount}/{view.round.fixtureCount} הסתיימו
        </span>
      </Card>
      <div className="flex flex-col gap-3">
        {visible.map((f) => (
          <FixtureComparison
            key={f.id}
            fixture={f}
            predictions={predsByFixture.get(f.id) ?? []}
            pointsByUser={scoresByFixture.get(f.id) ?? new Map()}
            myUserId={myUserId}
          />
        ))}
        {completions.map((f) => (
          <FixtureComparison
            key={f.id}
            fixture={f}
            predictions={predsByFixture.get(f.id) ?? []}
            pointsByUser={scoresByFixture.get(f.id) ?? new Map()}
            myUserId={myUserId}
          />
        ))}
      </div>
    </>
  );
}

function CompletionGamesEditor() {
  const home = useHome();
  const open = (home.data?.completionFixtures ?? []).filter(
    (f) => f.predictionOpenAt !== null && Date.now() >= f.predictionOpenAt && Date.now() < f.kickoffAt,
  );
  if (open.length === 0) return null;
  return (
    <>
      <SectionTitle>🗓️ משחקי השלמה — פתוחים לניחוש</SectionTitle>
      <div className="flex flex-col gap-3">
        {open.map((f) => (
          <PredictionEditor key={f.id} fixture={f} initial={f.myPrediction} />
        ))}
      </div>
    </>
  );
}

export default function Predictions() {
  const { me } = useOutletContext<{ me: UserPrivate }>();
  const current = useCurrentRound();

  if (current.isLoading) return <Spinner label="טוען את המחזור…" />;

  const view = current.data;
  const round = view?.round ?? null;

  return (
    <div className="flex flex-col gap-3 p-4">
      {!round && (
        <EmptyState
          emoji="😴"
          title="אין מחזור פתוח כרגע"
          subtitle="חלון הניחושים למחזור הבא ייפתח עם שריקת הסיום של המחזור הנוכחי"
        />
      )}
      {round && view && round.derivedState === 'open' && (
        <OpenRoundEditor view={view as RoundViewResponse} />
      )}
      {round && view && round.derivedState !== 'open' && (
        <LockedRoundView view={view as RoundViewResponse} myUserId={me.id} />
      )}
      <CompletionGamesEditor />
    </div>
  );
}
