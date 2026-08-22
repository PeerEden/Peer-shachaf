import { useEffect, useState } from 'react';
import { countdownTo, fmtCountdown } from '../lib/format';

export function Countdown({ target, prefix }: { target: number; prefix?: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const parts = countdownTo(target, now);
  const urgent = parts.totalMs > 0 && parts.totalMs < 3 * 60 * 60 * 1000;

  return (
    <span className={urgent ? 'font-bold text-gold-300' : ''}>
      {prefix && `${prefix} `}
      {fmtCountdown(parts)}
    </span>
  );
}
