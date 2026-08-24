import { useState } from 'react';
import type { UserPublic } from '@league/shared';

const COLORS = ['#f59e0b', '#22d3ee', '#a78bfa', '#fb7185', '#34d399', '#fbbf24', '#60a5fa', '#f472b6'];

function colorFor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  return COLORS[hash % COLORS.length]!;
}

const SIZES = { sm: 'size-8 text-xs', md: 'size-10 text-sm', lg: 'size-14 text-lg', xl: 'size-20 text-2xl' };

export function Avatar({ user, size = 'md' }: { user: UserPublic; size?: keyof typeof SIZES }) {
  // Remembering the URL that failed (rather than a bare boolean) means a newly
  // uploaded picture is retried instead of inheriting the previous failure.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const cls = `${SIZES[size]} shrink-0 rounded-full border-2 border-line object-cover`;
  if (user.avatarUrl && user.avatarUrl !== failedUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt={user.displayName}
        className={cls}
        onError={() => setFailedUrl(user.avatarUrl)}
      />
    );
  }
  return (
    <div
      className={`${cls} flex items-center justify-center font-bold text-pitch-950`}
      style={{ backgroundColor: colorFor(user.displayName) }}
    >
      {user.displayName.slice(0, 2)}
    </div>
  );
}
