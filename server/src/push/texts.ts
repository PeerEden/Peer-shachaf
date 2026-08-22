export function fmtHebrewTime(ms: number): string {
  return new Intl.DateTimeFormat('he-IL', {
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jerusalem',
  }).format(ms);
}
