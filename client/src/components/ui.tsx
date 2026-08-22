import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl border border-line bg-card p-4 shadow-lg shadow-black/20 ${className}`}>
      {children}
    </div>
  );
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  const styles = {
    primary:
      'bg-grass-500 text-pitch-950 font-bold shadow-lg shadow-grass-500/25 active:scale-[0.98] disabled:opacity-40',
    ghost: 'bg-card-raised text-ink border border-line active:scale-[0.98] disabled:opacity-40',
    danger: 'bg-red-500/90 text-white font-bold active:scale-[0.98] disabled:opacity-40',
  }[variant];
  return (
    <button
      className={`rounded-2xl px-4 py-3 text-base transition-transform ${styles} ${className}`}
      {...props}
    />
  );
}

export function TextInput({
  label,
  error,
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string }) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-sm font-medium text-ink-dim">{label}</span>}
      <input
        className={`w-full rounded-2xl border border-line bg-pitch-900 px-4 py-3 text-base text-ink outline-none placeholder:text-ink-dim/50 focus:border-grass-400 ${className}`}
        {...props}
      />
      {error && <span className="mt-1 block text-sm text-red-400">{error}</span>}
    </label>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-ink-dim">
      <div className="size-8 animate-spin rounded-full border-[3px] border-line border-t-grass-400" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

export function ErrorNote({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
      {message}
    </div>
  );
}

export function EmptyState({ emoji, title, subtitle }: { emoji: string; title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <div className="text-5xl">{emoji}</div>
      <div className="font-display text-lg font-bold">{title}</div>
      {subtitle && <div className="max-w-60 text-sm text-ink-dim">{subtitle}</div>}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="font-display mb-2 mt-6 text-lg font-bold text-grass-300">{children}</h2>;
}
