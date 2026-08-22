import { useOutletContext } from 'react-router';
import type { UserPrivate } from '@league/shared';
import { useAdminAction, useAdminUsers } from '../../api/admin';
import { Avatar } from '../../components/Avatar';
import { Card, ErrorNote, Spinner } from '../../components/ui';

export default function AdminUsers() {
  const { me } = useOutletContext<{ me: UserPrivate }>();
  const usersQuery = useAdminUsers();
  const action = useAdminAction();

  if (usersQuery.isLoading) return <Spinner />;
  const users = usersQuery.data?.users ?? [];

  return (
    <div className="flex flex-col gap-3">
      <ErrorNote message={action.isError ? action.error.message : null} />
      {users.map((user) => (
        <Card key={user.id} className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <Avatar user={user} size="md" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold">
                {user.displayName}{' '}
                {user.role === 'ADMIN' && (
                  <span className="rounded-full bg-gold-400/20 px-2 py-0.5 text-xs font-bold text-gold-300">
                    מנהל
                  </span>
                )}
              </div>
              <div className="text-xs text-ink-dim" dir="ltr">
                @{user.username} · {user.phone}
              </div>
              <div className="text-xs text-ink-dim">{user.predictionsCount} ניחושים</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-xl border border-line bg-card-raised px-3 py-1.5 text-xs font-bold"
              onClick={() => {
                const newPassword = window.prompt(`סיסמה חדשה עבור ${user.displayName} (לפחות 6 תווים):`);
                if (newPassword && newPassword.length >= 6) {
                  action.mutate({
                    path: `/api/admin/users/${user.id}/reset-password`,
                    method: 'POST',
                    body: { newPassword },
                  });
                }
              }}
            >
              🔑 איפוס סיסמה
            </button>
            {user.id !== me.id && (
              <>
                <button
                  className="rounded-xl border border-line bg-card-raised px-3 py-1.5 text-xs font-bold"
                  onClick={() =>
                    action.mutate({
                      path: `/api/admin/users/${user.id}/${user.role === 'ADMIN' ? 'demote' : 'promote'}`,
                      method: 'POST',
                    })
                  }
                >
                  {user.role === 'ADMIN' ? '⬇️ הסרת ניהול' : '👑 הפיכה למנהל'}
                </button>
                <button
                  className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-300"
                  onClick={() => {
                    if (
                      window.confirm(
                        `למחוק את ${user.displayName} לצמיתות? כל הניחושים והנקודות שלו יימחקו.`,
                      )
                    ) {
                      action.mutate({ path: `/api/admin/users/${user.id}`, method: 'DELETE' });
                    }
                  }}
                >
                  🗑️ מחיקה
                </button>
              </>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
