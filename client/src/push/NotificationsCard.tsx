import { Link } from 'react-router';
import { Card, ErrorNote } from '../components/ui';
import { usePush } from './usePush';

/** The push-notifications toggle shown on the Profile screen. */
export function NotificationsCard() {
  const push = usePush();

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-bold">🔔 התראות</div>
          <div className="text-xs text-ink-dim">
            תזכורות לפני נעילה, סיכומי מחזור, משחקים דחויים ועוד
          </div>
        </div>

        {push.state === 'on' && (
          <button
            className="rounded-2xl bg-grass-500/20 px-4 py-2 text-sm font-bold text-grass-300"
            onClick={() => void push.disable()}
          >
            פעיל ✓
          </button>
        )}
        {push.state === 'off' && (
          <button
            className="rounded-2xl border border-line bg-card-raised px-4 py-2 text-sm font-bold"
            onClick={() => void push.enable()}
          >
            הפעלה
          </button>
        )}
        {push.state === 'loading' && <span className="text-xs text-ink-dim">רגע…</span>}
      </div>

      {push.state === 'needs-install' && (
        <p className="text-xs text-gold-300">
          באייפון, התראות עובדות רק אחרי שמוסיפים את האפליקציה למסך הבית.{' '}
          <Link to="/install" className="font-bold underline">
            איך מתקינים?
          </Link>
        </p>
      )}
      {push.state === 'denied' && (
        <p className="text-xs text-red-300">
          ההתראות חסומות בהגדרות המכשיר. אפשר לאשר מחדש דרך הגדרות ← התראות ← 0 מושג.
        </p>
      )}
      {push.state === 'unsupported' && (
        <p className="text-xs text-ink-dim">הדפדפן הזה לא תומך בהתראות.</p>
      )}
      <ErrorNote message={push.error} />
    </Card>
  );
}
