import type { UserPrivate } from '@league/shared';
import { NavLink, Outlet } from 'react-router';

const TABS = [
  { to: '/', label: 'בית', emoji: '🏠' },
  { to: '/predictions', label: 'ניחושים', emoji: '✏️' },
  { to: '/live', label: 'לייב', emoji: '🔴' },
  { to: '/history', label: 'היסטוריה', emoji: '📜' },
  { to: '/profile', label: 'פרופיל', emoji: '👤' },
];

export function Layout({ me }: { me: UserPrivate }) {
  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-24">
      <Outlet context={{ me }} />
      <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-lg border-t border-line bg-pitch-900/95 backdrop-blur supports-[backdrop-filter]:bg-pitch-900/80">
        <div className="flex items-stretch justify-around pb-[env(safe-area-inset-bottom)]">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === '/'}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] ${
                  isActive ? 'font-bold text-grass-300' : 'text-ink-dim'
                }`
              }
            >
              <span className="text-lg leading-none">{tab.emoji}</span>
              <span>{tab.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
