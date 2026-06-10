import { addDays, dayKey } from './dates';

/**
 * Streak rules — spec §F6.1.
 * A streak is consecutive local calendar days with ≥1 meal. An empty *today*
 * doesn't break the run until the day ends: if today has no meal we count
 * back from yesterday.
 */
export function computeStreak(mealDayKeys: Iterable<string>, today: Date): number {
  const days = new Set(mealDayKeys);
  if (days.size === 0) return 0;

  let cursor = today;
  if (!days.has(dayKey(cursor))) {
    cursor = addDays(cursor, -1);
    if (!days.has(dayKey(cursor))) return 0;
  }

  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** Longest run of consecutive days anywhere in history. */
export function longestStreak(mealDayKeys: Iterable<string>): number {
  const days = new Set(mealDayKeys);
  let longest = 0;
  for (const key of days) {
    const [y, m, d] = key.split('-').map(Number);
    const prev = dayKey(addDays(new Date(y, m - 1, d), -1));
    if (days.has(prev)) continue; // not the start of a run
    let length = 0;
    let cursor = new Date(y, m - 1, d);
    while (days.has(dayKey(cursor))) {
      length += 1;
      cursor = addDays(cursor, 1);
    }
    longest = Math.max(longest, length);
  }
  return longest;
}
