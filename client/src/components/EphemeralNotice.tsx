import { useMe } from '../api/hooks';

/**
 * Shown on the logged-out screens when the server stores its database on
 * throwaway storage. Without it the app looks like it works and then quietly
 * loses every account — which is exactly how a league gets built on sand.
 */
export function EphemeralNotice() {
  const me = useMe();
  if (!me.data?.ephemeralStorage) return null;

  return (
    <div className="rounded-2xl border border-gold-400/40 bg-gold-400/10 px-4 py-3 text-sm text-gold-200">
      <div className="font-bold">⚠️ שרת זמני — הנתונים לא נשמרים</div>
      <p className="mt-1 text-gold-200/80">
        חשבונות וניחושים נמחקים מדי כמה שעות, וכל מכשיר עלול לראות ליגה אחרת.
        אפשר להתנסות — אבל אל תפתחו כאן את הליגה האמיתית עד המעבר לשרת קבוע.
      </p>
    </div>
  );
}
