import { Navigate, NavLink, Outlet, useOutletContext } from 'react-router';
import type { UserPrivate } from '@league/shared';

const TABS = [
  { to: '/admin', label: 'כללי', end: true },
  { to: '/admin/fixtures', label: 'משחקים', end: false },
  { to: '/admin/users', label: 'משתמשים', end: false },
  { to: '/admin/teams', label: 'קבוצות', end: false },
  { to: '/admin/audit', label: 'יומן', end: false },
];

export default function AdminLayout() {
  const { me } = useOutletContext<{ me: UserPrivate }>();
  if (me.role !== 'ADMIN') return <Navigate to="/" replace />;

  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="font-display text-2xl font-extrabold text-gold-300">🛠️ פאנל ניהול</h1>
      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-line bg-card p-1">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `whitespace-nowrap rounded-xl px-3 py-1.5 text-sm font-medium ${
                isActive ? 'bg-gold-400/20 font-bold text-gold-300' : 'text-ink-dim'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
      <Outlet context={{ me }} />
    </div>
  );
}
