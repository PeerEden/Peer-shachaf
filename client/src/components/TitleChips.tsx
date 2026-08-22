import { TITLE_META, type TitleCode } from '@league/shared';

export function TitleChips({ titles, max }: { titles: string[]; max?: number }) {
  if (titles.length === 0) return null;
  const shown = max ? titles.slice(0, max) : titles;
  return (
    <span className="inline-flex items-center gap-0.5">
      {shown.map((code) => {
        const meta = TITLE_META[code as TitleCode];
        if (!meta) return null;
        return (
          <span key={code} title={meta.label} className="text-sm" aria-label={meta.label}>
            {meta.emoji}
          </span>
        );
      })}
    </span>
  );
}

export function TitleLegend({ titles }: { titles: string[] }) {
  if (titles.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {titles.map((code) => {
        const meta = TITLE_META[code as TitleCode];
        if (!meta) return null;
        return (
          <span
            key={code}
            className="inline-flex items-center gap-1 rounded-full border border-line bg-card-raised px-2.5 py-1 text-xs"
          >
            <span>{meta.emoji}</span>
            <span>{meta.label}</span>
          </span>
        );
      })}
    </div>
  );
}
