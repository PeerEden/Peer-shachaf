import { useState } from 'react';
import { useAdminAction, useAdminSettings } from '../../api/admin';
import { Button, Card, ErrorNote, SectionTitle, TextInput } from '../../components/ui';

export default function AdminHome() {
  const settings = useAdminSettings();
  const action = useAdminAction();
  const [leagueName, setLeagueName] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [seasonName, setSeasonName] = useState('');

  const current = settings.data?.settings;

  return (
    <div className="flex flex-col gap-3">
      <SectionTitle>הגדרות הליגה</SectionTitle>
      <Card>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            action.mutate({
              path: '/api/admin/settings',
              method: 'PATCH',
              body: {
                ...(leagueName !== null ? { leagueName } : {}),
                ...(inviteCode !== null ? { inviteCode } : {}),
              },
            });
          }}
        >
          <TextInput
            label="שם הליגה"
            value={leagueName ?? current?.leagueName ?? ''}
            onChange={(e) => setLeagueName(e.target.value)}
          />
          <TextInput
            label="קוד כניסה לליגה (לשתף עם החברים)"
            dir="ltr"
            value={inviteCode ?? current?.inviteCode ?? ''}
            onChange={(e) => setInviteCode(e.target.value)}
          />
          <Button type="submit" variant="ghost" disabled={action.isPending}>
            שמירת הגדרות
          </Button>
        </form>
      </Card>

      <SectionTitle>גיבוי</SectionTitle>
      <Card className="flex items-center justify-between">
        <div className="text-sm">
          <div className="font-bold">גיבוי בסיס הנתונים</div>
          <div className="text-xs text-ink-dim">קובץ אחד עם כל הליגה — לשמור במקום בטוח</div>
        </div>
        <a
          href="/api/admin/backup"
          className="rounded-2xl border border-line bg-card-raised px-4 py-2 text-sm font-bold"
        >
          ⬇️ הורדה
        </a>
      </Card>

      <SectionTitle>עונה</SectionTitle>
      <Card className="flex flex-col gap-3">
        <p className="text-xs text-ink-dim">
          בסוף העונה: ארכוב שומר את כל הנתונים והאלופים בהיסטוריה, ואז פותחים עונה חדשה נקייה.
        </p>
        <Button
          variant="ghost"
          disabled={action.isPending}
          onClick={() => {
            if (!window.confirm('לארכב את העונה הנוכחית? הפעולה סוגרת אותה לצמיתות.')) return;
            void (async () => {
              const seasons = await fetch('/api/seasons', { credentials: 'same-origin' }).then((r) => r.json());
              const active = (seasons.seasons as Array<{ id: number; status: string }>).find(
                (s) => s.status === 'active',
              );
              if (active) {
                action.mutate({ path: `/api/admin/seasons/${active.id}/archive`, method: 'POST' });
              }
            })();
          }}
        >
          📦 ארכוב העונה הנוכחית
        </Button>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (seasonName.trim().length >= 4) {
              action.mutate({ path: '/api/admin/seasons', method: 'POST', body: { name: seasonName.trim() } });
              setSeasonName('');
            }
          }}
        >
          <div className="flex-1">
            <TextInput
              label="עונה חדשה (למשל 2027/28)"
              dir="ltr"
              value={seasonName}
              onChange={(e) => setSeasonName(e.target.value)}
            />
          </div>
          <Button type="submit" variant="ghost" disabled={action.isPending}>
            פתיחה
          </Button>
        </form>
      </Card>

      <SectionTitle>חירום</SectionTitle>
      <Card className="flex flex-col gap-2">
        <p className="text-xs text-ink-dim">
          בדרך כלל המחזור הבא נפתח לבד עם שריקת הסיום. אם משהו נתקע — אפשר לפתוח ידנית.
        </p>
        <Button
          variant="ghost"
          disabled={action.isPending}
          onClick={() => action.mutate({ path: '/api/admin/rounds/open-next', method: 'POST' })}
        >
          פתיחת המחזור הבא ידנית
        </Button>
      </Card>

      <ErrorNote message={action.isError ? action.error.message : null} />
      {action.isSuccess && <p className="text-center text-sm font-bold text-grass-300">בוצע ✓</p>}
    </div>
  );
}
