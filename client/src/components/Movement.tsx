export function Movement({ movement }: { movement: number | null }) {
  if (movement === null || movement === 0) {
    return <span className="text-xs text-ink-dim">—</span>;
  }
  if (movement > 0) {
    return <span className="text-xs font-bold text-grass-400">▲{movement}</span>;
  }
  return <span className="text-xs font-bold text-red-400">▼{-movement}</span>;
}
