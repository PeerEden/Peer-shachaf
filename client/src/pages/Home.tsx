import { Link } from 'react-router';
import { useHome } from '../api/hooks';
import { Avatar } from '../components/Avatar';
import { Countdown } from '../components/Countdown';
import { Podium } from '../components/Podium';
import { StandingsTable } from '../components/StandingsTable';
import { Card, EmptyState, ErrorNote, SectionTitle, Spinner } from '../components/ui';
import { fmtDateTime } from '../lib/format';

export default function Home() {
  const home = useHome();

  if (home.isLoading) return <Spinner label="טוען את הליגה…" />;
  if (home.isError || !home.data) {
    return (
      <div className="p-4">
        <ErrorNote message="לא הצלחנו לטעון את הליגה. בדקו את החיבור ונסו שוב." />
      </div>
    );
  }

  const { me, leagueName, seasonName, standings, activeRound, liveNow, lastClosedRound, completionFixtures } =
    home.data;

  return (
    <div className="flex flex-col gap-3 p-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-grass-300">⚽ {leagueName}</h1>
          {seasonName && <p className="text-xs text-ink-dim">עונת {seasonName}</p>}
        </div>
        <Link to="/profile">
          <Avatar user={me} size="md" />
        </Link>
      </header>

      {liveNow && (
        <Link
          to="/live"
          className="flex items-center justify-between rounded-3xl border border-red-500/40 bg-red-500/10 px-4 py-3"
        >
          <span className="flex items-center gap-2 font-bold text-red-300">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-red-500" />
            </span>
            יש משחקים חיים עכשיו!
          </span>
          <span className="text-sm text-red-300">לטבלה החיה ←</span>
        </Link>
      )}

      {standings.length > 0 && (
        <Card className="pb-0">
          <Podium standings={standings} />
        </Card>
      )}

      {activeRound && (
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">{activeRound.round.name}</h2>
            {activeRound.round.derivedState === 'open' && activeRound.round.lockAt && (
              <span className="text-sm text-ink-dim">
                <Countdown target={activeRound.round.lockAt} prefix="⏳ נעילה בעוד" />
              </span>
            )}
            {activeRound.round.derivedState !== 'open' && (
              <span className="rounded-full bg-gold-400/15 px-2.5 py-1 text-xs font-bold text-gold-300">
                🔒 נעול
              </span>
            )}
          </div>
          {activeRound.round.lockAt && (
            <p className="mt-0.5 text-xs text-ink-dim">נעילה: {fmtDateTime(activeRound.round.lockAt)}</p>
          )}

          {activeRound.round.derivedState === 'open' && (
            <>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-pitch-900">
                <div
                  className="h-full rounded-full bg-grass-500 transition-all"
                  style={{
                    width: `${activeRound.total ? (activeRound.myFilled / activeRound.total) * 100 : 0}%`,
                  }}
                />
              </div>
              <p className="mt-1.5 text-sm text-ink-dim">
                {activeRound.myFilled === activeRound.total && activeRound.total > 0
                  ? '✅ ניחשת את כל המשחקים!'
                  : `ניחשת ${activeRound.myFilled} מתוך ${activeRound.total} משחקים`}
              </p>
              <Link
                to="/predictions"
                className="mt-3 block rounded-2xl bg-grass-500 py-3 text-center text-base font-bold text-pitch-950 shadow-lg shadow-grass-500/25 active:scale-[0.98]"
              >
                לניחושים שלי ✏️
              </Link>
            </>
          )}
          {activeRound.round.derivedState !== 'open' && (
            <Link
              to="/predictions"
              className="mt-3 block rounded-2xl border border-line bg-card-raised py-3 text-center text-base font-bold active:scale-[0.98]"
            >
              לצפייה בניחושים של כולם 👀
            </Link>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {activeRound.completionStatus.map((s) => (
              <span
                key={s.user.id}
                className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs ${
                  s.done
                    ? 'border-grass-500/40 bg-grass-500/10 text-grass-300'
                    : 'border-line bg-pitch-900 text-ink-dim'
                }`}
                title={`${s.filled}/${s.total}`}
              >
                <Avatar user={s.user} size="sm" />
                {s.user.displayName}
                <span>{s.done ? '✓' : `${s.filled}/${s.total}`}</span>
              </span>
            ))}
          </div>
        </Card>
      )}

      {completionFixtures.length > 0 && (
        <Card className="border-gold-400/40">
          <h2 className="font-display text-base font-bold text-gold-300">🗓️ משחקי השלמה</h2>
          {completionFixtures.map((f) => (
            <div key={f.id} className="mt-2 flex items-center justify-between text-sm">
              <span>
                {f.homeTeam.name} — {f.awayTeam.name}
                <span className="block text-xs text-ink-dim">{fmtDateTime(f.kickoffAt)}</span>
              </span>
              {Date.now() >= f.kickoffAt ? (
                <span className="text-xs text-ink-dim">🔒 ננעל</span>
              ) : f.predictionOpenAt && Date.now() >= f.predictionOpenAt ? (
                <Link to="/predictions" className="font-bold text-grass-300 underline">
                  {f.myPrediction ? 'ניחשת ✓' : 'לנחש עכשיו'}
                </Link>
              ) : (
                <span className="text-xs text-ink-dim">ייפתח לניחוש שבוע לפני</span>
              )}
            </div>
          ))}
        </Card>
      )}

      {lastClosedRound && (
        <Link to={`/rounds/${lastClosedRound.id}/summary`}>
          <Card className="flex items-center justify-between">
            <div>
              <div className="text-sm text-ink-dim">סיכום {lastClosedRound.name}</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-lg">👑</span>
                {lastClosedRound.winners.map((w) => (
                  <span key={w.id} className="flex items-center gap-1 text-sm font-bold">
                    <Avatar user={w} size="sm" />
                    {w.displayName}
                  </span>
                ))}
                {lastClosedRound.winners.length === 0 && (
                  <span className="text-sm text-ink-dim">אין מנצח הפעם…</span>
                )}
              </div>
            </div>
            <span className="text-ink-dim">←</span>
          </Card>
        </Link>
      )}

      <SectionTitle>טבלת הליגה</SectionTitle>
      {standings.length > 0 ? (
        <StandingsTable standings={standings} highlightUserId={me.id} />
      ) : (
        <EmptyState emoji="🪑" title="עוד אין טבלה" subtitle="ברגע שיהיו ניחושים ותוצאות — הטבלה תתעורר" />
      )}
    </div>
  );
}
