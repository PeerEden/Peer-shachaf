/**
 * The oversized score input of the quick-entry prediction UI:
 * big tap targets, numeric keyboard, no clutter.
 */
export function ScoreStepper({
  value,
  onChange,
  disabled,
  label,
}: {
  value: number | null;
  onChange: (next: number) => void;
  disabled?: boolean;
  label: string;
}) {
  const bump = (delta: number) => {
    const next = Math.max(0, Math.min(99, (value ?? 0) + delta));
    onChange(next);
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        aria-label={`הוסף שער ל${label}`}
        className="flex size-9 items-center justify-center rounded-full border border-line bg-card-raised text-lg font-bold text-grass-300 active:scale-95 disabled:opacity-30"
        onClick={() => bump(1)}
        disabled={disabled}
      >
        +
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={99}
        aria-label={`שערים ${label}`}
        className={`h-14 w-14 rounded-2xl border-2 text-center font-display text-2xl font-extrabold outline-none ${
          value === null
            ? 'border-dashed border-line bg-pitch-900 text-ink-dim'
            : 'border-grass-500/60 bg-pitch-900 text-ink'
        } focus:border-grass-400 disabled:opacity-60`}
        value={value ?? ''}
        placeholder="?"
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') return;
          const parsed = Number(raw);
          if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 99) onChange(parsed);
        }}
      />
      <button
        type="button"
        aria-label={`הורד שער ל${label}`}
        className="flex size-9 items-center justify-center rounded-full border border-line bg-card-raised text-lg font-bold text-ink-dim active:scale-95 disabled:opacity-30"
        onClick={() => bump(-1)}
        disabled={disabled || value === null || value === 0}
      >
        −
      </button>
    </div>
  );
}
