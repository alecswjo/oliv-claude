/** Local-timezone calendar helpers. A "day key" is YYYY-MM-DD in local time. */

export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function dayKeyFromIso(iso: string): string {
  return dayKey(new Date(iso));
}

/** Parse a day key back to a local-midnight Date. */
export function dateFromDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Day keys for the window ending at `today`, oldest first. */
export function lastNDayKeys(today: Date, n: number): string[] {
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    keys.push(dayKey(addDays(today, -i)));
  }
  return keys;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Today" | "Yesterday" | "Mon, Jun 8" (adds year when not the current year). */
export function dayLabel(key: string, today: Date): string {
  if (key === dayKey(today)) return 'Today';
  if (key === dayKey(addDays(today, -1))) return 'Yesterday';
  const date = dateFromDayKey(key);
  const base = `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
  return date.getFullYear() === today.getFullYear() ? base : `${base}, ${date.getFullYear()}`;
}

/** "7:42 AM" from an ISO datetime, in local time. */
export function timeLabel(iso: string): string {
  const date = new Date(iso);
  let h = date.getHours();
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const m = `${date.getMinutes()}`.padStart(2, '0');
  return `${h}:${m} ${suffix}`;
}

/** Feed timestamp with date AND time: "Today at 7:42 AM", "Jun 14 at 3:00 PM". */
export function dateTimeLabel(iso: string, now: Date): string {
  const key = dayKeyFromIso(iso);
  let day: string;
  if (key === dayKey(now)) day = 'Today';
  else if (key === dayKey(addDays(now, -1))) day = 'Yesterday';
  else {
    const date = new Date(iso);
    day = `${MONTHS[date.getMonth()]} ${date.getDate()}`;
  }
  return `${day} at ${timeLabel(iso)}`;
}

/** Compact relative time for comments/feed: "now", "5m", "3h", "2d", else short date. */
export function relativeLabel(iso: string, now: Date): string {
  const then = new Date(iso).getTime();
  const diffSec = Math.max(0, Math.floor((now.getTime() - then) / 1000));
  if (diffSec < 60) return 'now';
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  const date = new Date(iso);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/** Default meal type for the local hour of day. */
export function mealTypeForHour(hour: number): 'breakfast' | 'lunch' | 'dinner' | 'snack' {
  if (hour >= 4 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 15) return 'lunch';
  if (hour >= 17 && hour < 22) return 'dinner';
  return 'snack';
}
