// Play-window time helpers shared by /schedule and the home page's Today's Plan panel.
// Window times are "HH:MM[:SS]" strings in the user's own local time.

export function timeToMinutes(time: string): number {
  const parts = time.split(':');
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

export function formatTime(time: string): string {
  const parts = time.split(':');
  const h = parseInt(parts[0]);
  const m = parseInt(parts[1]);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
}

export function isWindowActive(windowStart: string, windowEnd: string): boolean {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes >= timeToMinutes(windowStart) && nowMinutes < timeToMinutes(windowEnd);
}
