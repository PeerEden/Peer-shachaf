import type { FixtureDto } from '@league/shared';
import type { RoundPredictionView, RoundViewResponse } from '../api/types';
import { fmtDateTime } from '../lib/format';
import { Avatar } from './Avatar';

/**
 * Scores render inside a dir="ltr" span with the AWAY score first, so in the
 * surrounding RTL layout the number nearest the home team (displayed on the
 * right) is the home score. Everywhere in the app: right number = home.
 */
export function Scoreline({ home, away, className = '' }: { home: number; away: number; className?: string }) {
  return (
    <span className={className} dir="ltr">
      {away} : {home}
    </span>
  );
}

function FixtureScoreline({ fixture }: { fixture: FixtureDto }) {
  if (fixture.status === 'postponed') {
    return <span className="rounded-full bg-gold-400/15 px-2 py-0.5 text-xs font-bold text-gold-300">נדחה</span>;
  }
  if (fixture.status === 'cancelled') {
    return <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-bold text-red-300">בוטל</span>;
  }
  if (fixture.homeScore === null || fixture.awayScore === null) {
    return <span className="text-xs text-ink-dim">{fmtDateTime(fixture.kickoffAt)}</span>;
  }
  return (
    <span className="flex items-center gap-1.5">
      <Scoreline
        home={fixture.homeScore}
        away={fixture.awayScore}
        className="font-display text-xl font-extrabold"
      />
      {fixture.status === 'live' && (
        <span className="animate-pulse rounded-full bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold text-red-300">
          {fixture.liveMinute ?? 'LIVE'}
        </span>
      )}
    </span>
  );
}

function pointsChip(points: number | undefined, isLive: boolean) {
  if (points === undefined) return null;
  const styles =
    points === 3
      ? 'bg-gold-400/20 text-gold-300'
      : points === 1
        ? 'bg-grass-500/20 text-grass-300'
        : 'bg-pitch-900 text-ink-dim';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${styles}`}>
      {isLive ? `${points}?` : `+${points}`}
    </span>
  );
}

/**
 * Post-lock view of one fixture: the result plus everyone's predictions and
 * the points each earned (final) or would earn (live provisional).
 */
export function FixtureComparison({
  fixture,
  predictions,
  pointsByUser,
  myUserId,
}: {
  fixture: FixtureDto;
  predictions: RoundPredictionView[];
  pointsByUser: Map<number, number>;
  myUserId: number;
}) {
  const mine = predictions.filter((p) => p.userId === myUserId);
  const others = predictions.filter((p) => p.userId !== myUserId);
  const ordered = [...mine, ...others];
  const isLive = fixture.status === 'live';

  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-line/60 px-4 py-3">
        <span className="min-w-0 flex-1 truncate text-sm font-bold">{fixture.homeTeam.name}</span>
        <FixtureScoreline fixture={fixture} />
        <span className="min-w-0 flex-1 truncate text-end text-sm font-bold">{fixture.awayTeam.name}</span>
      </div>
      {fixture.isCompletion && (
        <div className="border-b border-line/60 bg-gold-400/5 px-4 py-1.5 text-xs text-gold-300">
          🗓️ משחק השלמה
        </div>
      )}
      <div className="divide-y divide-line/40">
        {ordered.map((p) => (
          <div
            key={p.userId}
            className={`flex items-center gap-2.5 px-4 py-2 ${p.userId === myUserId ? 'bg-grass-500/5' : ''}`}
          >
            <Avatar user={p.user} size="sm" />
            <span className="min-w-0 flex-1 truncate text-sm">{p.user.displayName}</span>
            <Scoreline home={p.homePred} away={p.awayPred} className="font-display text-base font-bold" />
            {pointsChip(pointsByUser.get(p.userId), isLive)}
          </div>
        ))}
        {ordered.length === 0 && (
          <div className="px-4 py-3 text-center text-xs text-ink-dim">אין ניחושים למשחק הזה</div>
        )}
      </div>
    </div>
  );
}

/** Groups a round view's predictions and final scores per fixture. */
export function buildComparisonData(view: RoundViewResponse) {
  const predsByFixture = new Map<number, RoundPredictionView[]>();
  for (const p of view.predictions) {
    predsByFixture.set(p.fixtureId, [...(predsByFixture.get(p.fixtureId) ?? []), p]);
  }
  const scoresByFixture = new Map<number, Map<number, number>>();
  for (const s of view.scores) {
    const inner = scoresByFixture.get(s.fixtureId) ?? new Map<number, number>();
    inner.set(s.userId, s.points);
    scoresByFixture.set(s.fixtureId, inner);
  }
  return { predsByFixture, scoresByFixture };
}
