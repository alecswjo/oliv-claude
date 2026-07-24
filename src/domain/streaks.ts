// Explicit .ts extension: this module is also imported by the Deno-based
// gateway (supabase/functions/agent-inbound), and Deno requires it.
import { addDays, dayKey } from './dates.ts';

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

/* ------------------- key-based variants (timezone-safe) ------------------- */
/* These operate purely on YYYY-MM-DD day keys, so the caller controls the
 * timezone (app: device-local via dayKeyFromIso; agent: user's stored IANA tz
 * via dayKeyInTz). Streak freezes ("Olive Saves") union into the key set. */

function shiftKey(key: string, deltaDays: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return shifted.toISOString().slice(0, 10);
}

/** Streak ending at `todayKey` (an empty today doesn't break it until the day ends). */
export function streakFromKeys(dayKeys: Iterable<string>, todayKey: string): number {
  const days = new Set(dayKeys);
  if (days.size === 0) return 0;
  let cursor = todayKey;
  if (!days.has(cursor)) {
    cursor = shiftKey(cursor, -1);
    if (!days.has(cursor)) return 0;
  }
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = shiftKey(cursor, -1);
  }
  return streak;
}

/**
 * The single missed day an Olive Save could repair: yesterday is empty, but
 * the day before it ends a run — so freezing yesterday reconnects the streak.
 * Null when nothing is broken (or the gap is wider than one day).
 */
export function repairableDayKey(dayKeys: Iterable<string>, todayKey: string): string | null {
  const days = new Set(dayKeys);
  const yesterday = shiftKey(todayKey, -1);
  if (days.has(yesterday)) return null; // streak intact
  if (!days.has(shiftKey(todayKey, -2))) return null; // gap wider than a day
  return yesterday;
}

/** Celebration thresholds (Cal AI-style milestone moments). */
export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 365] as const;

export function isMilestone(streak: number): boolean {
  return (STREAK_MILESTONES as readonly number[]).includes(streak);
}

/** The next milestone ahead of `streak`, or null past the last one. */
export function nextMilestone(streak: number): number | null {
  for (const milestone of STREAK_MILESTONES) if (milestone > streak) return milestone;
  return null;
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
