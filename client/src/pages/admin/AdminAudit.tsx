import { useAdminAudit } from '../../api/admin';
import { Spinner } from '../../components/ui';
import { fmtDateTime } from '../../lib/format';

const ACTION_LABELS: Record<string, string> = {
  'fixture.created': 'משחק נוצר',
  'fixture.updated': 'משחק עודכן',
  'fixture.deleted': 'משחק נמחק',
  'fixture.result_entered': 'תוצאה הוזנה',
  'fixture.result_corrected': 'תוצאה תוקנה',
  'fixture.live_updated': 'עדכון לייב',
  'fixture.postponed': 'משחק נדחה',
  'fixture.postponed_predictions_voided': 'ניחושים בוטלו (דחייה)',
  'fixture.cancelled': 'משחק בוטל',
  'fixture.cancelled_predictions_voided': 'ניחושים בוטלו (ביטול)',
  'fixture.rescheduled': 'נקבע מועד חדש',
  'prediction.admin_fixed': 'ניחוש תוקן ע"י מנהל',
  'user.deleted': 'משתמש נמחק',
  'user.role_changed': 'הרשאות שונו',
  'user.password_reset': 'סיסמה אופסה',
  'team.created': 'קבוצה נוצרה',
  'team.updated': 'קבוצה עודכנה',
  'team.deleted': 'קבוצה נמחקה',
  'round.created': 'מחזור נוצר',
  'round.updated': 'מחזור עודכן',
  'round.manually_opened': 'מחזור נפתח ידנית',
  'season.archived': 'עונה אורכבה',
  'season.started': 'עונה נפתחה',
  'settings.updated': 'הגדרות עודכנו',
};

export default function AdminAudit() {
  const audit = useAdminAudit();

  if (audit.isLoading) return <Spinner />;
  const entries = audit.data?.entries ?? [];

  return (
    <div className="divide-y divide-line/60 overflow-hidden rounded-3xl border border-line bg-card">
      {entries.map((entry) => (
        <div key={entry.id} className="px-3.5 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold">{ACTION_LABELS[entry.action] ?? entry.action}</span>
            <span className="text-xs text-ink-dim">{fmtDateTime(entry.createdAt)}</span>
          </div>
          <div className="mt-0.5 text-xs text-ink-dim">
            {entry.actorName} · {entry.entityType}
            {entry.entityId && ` #${entry.entityId}`}
          </div>
          {(entry.before !== null || entry.after !== null) && (
            <div className="mt-1 overflow-x-auto rounded-xl bg-pitch-900 p-2 text-[10px] text-ink-dim" dir="ltr">
              {entry.before !== null && <div>before: {JSON.stringify(entry.before)}</div>}
              {entry.after !== null && <div>after: {JSON.stringify(entry.after)}</div>}
            </div>
          )}
        </div>
      ))}
      {entries.length === 0 && (
        <div className="px-4 py-6 text-center text-sm text-ink-dim">היומן ריק</div>
      )}
    </div>
  );
}
