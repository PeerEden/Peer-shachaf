const TZ = 'Asia/Jerusalem';

export function fmtDateTime(ms: number): string {
  return new Intl.DateTimeFormat('he-IL', {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
  }).format(ms);
}

export function fmtDate(ms: number): string {
  return new Intl.DateTimeFormat('he-IL', {
    day: 'numeric',
    month: 'long',
    timeZone: TZ,
  }).format(ms);
}

export function fmtTime(ms: number): string {
  return new Intl.DateTimeFormat('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
  }).format(ms);
}

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
}

export function countdownTo(targetMs: number, nowMs: number): CountdownParts {
  const totalMs = Math.max(0, targetMs - nowMs);
  const totalSec = Math.floor(totalMs / 1000);
  return {
    days: Math.floor(totalSec / 86400),
    hours: Math.floor((totalSec % 86400) / 3600),
    minutes: Math.floor((totalSec % 3600) / 60),
    seconds: totalSec % 60,
    totalMs,
  };
}

export function fmtCountdown(parts: CountdownParts): string {
  if (parts.totalMs <= 0) return 'ננעל';
  if (parts.days > 0) return `${parts.days} ימים ו־${parts.hours} שעות`;
  if (parts.hours > 0) return `${parts.hours}:${String(parts.minutes).padStart(2, '0')} שעות`;
  return `${parts.minutes}:${String(parts.seconds).padStart(2, '0')} דקות`;
}
