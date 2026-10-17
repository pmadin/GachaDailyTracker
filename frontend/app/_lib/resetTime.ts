import { getNextResetMs } from './countdown';

// A daily reset is one moment, the same everywhere in the world. `(timezone, daily_reset)` is
// just one way of writing it down, so these helpers turn a pair into that moment and back.

const MINUTE = 60_000;

/** The next reset as a Date (rounded to the minute so two pairs for one moment compare equal). */
export function nextResetDate(timezone: string, dailyReset: string): Date | null {
  try {
    const ms = Math.round((Date.now() + getNextResetMs(timezone, dailyReset)) / MINUTE) * MINUTE;
    return new Date(ms);
  } catch {
    return null; // invalid timezone or time
  }
}

function hhmm(date: Date, timeZone: string): string {
  const s = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
  return s;
}

/** "07:00 UTC" */
export function resetUtc(timezone: string, dailyReset: string): string {
  const d = nextResetDate(timezone, dailyReset);
  return d ? `${hhmm(d, 'UTC')} UTC` : '—';
}

/** The same moment on another clock, as 24h HH:MM. */
export function resetInZone(timezone: string, dailyReset: string, targetTz: string): string | null {
  const d = nextResetDate(timezone, dailyReset);
  if (!d) return null;
  try {
    return hhmm(d, targetTz);
  } catch {
    return null;
  }
}

/** The same moment in the viewer's own clock, e.g. "12:00 AM". */
export function resetLocal(timezone: string, dailyReset: string): string | null {
  const d = nextResetDate(timezone, dailyReset);
  return d ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : null;
}

/**
 * Signed minutes from reset `a` to reset `b` within a day (−720..720). 0 means both pairs
 * name the same moment; 60 means `b` resets an hour after `a`.
 */
export function resetDiffMinutes(
  a: { timezone: string; daily_reset: string },
  b: { timezone: string; daily_reset: string },
): number | null {
  const da = nextResetDate(a.timezone, a.daily_reset);
  const db = nextResetDate(b.timezone, b.daily_reset);
  if (!da || !db) return null;
  let diff = Math.round((db.getTime() - da.getTime()) / MINUTE) % 1440;
  if (diff > 720) diff -= 1440;
  if (diff < -720) diff += 1440;
  return diff;
}

/** "same reset", "1h later", "30m earlier", "2h 30m later" */
export function describeResetDiff(diff: number): string {
  if (diff === 0) return 'same reset';
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const amount = [h ? `${h}h` : '', m ? `${m}m` : ''].filter(Boolean).join(' ');
  return `${amount} ${diff > 0 ? 'later' : 'earlier'}`;
}

/** The browser's IANA timezone, or Etc/UTC if it can't tell. */
export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Etc/UTC';
  } catch {
    return 'Etc/UTC';
  }
}

/** A short readable name for a zone: "Asia/Ho_Chi_Minh" -> "Ho Chi Minh". */
export function zoneCity(timezone: string): string {
  if (timezone === 'Etc/UTC' || timezone === 'UTC') return 'UTC';
  return (timezone.split('/').pop() ?? timezone).replace(/_/g, ' ');
}
