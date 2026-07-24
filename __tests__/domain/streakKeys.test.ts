/**
 * Key-based streak math (timezone-safe variants used by both the app and the
 * texting agent) + Olive Save repair + milestones. Spec §F6.1 extension.
 */

import {
  isMilestone,
  nextMilestone,
  repairableDayKey,
  STREAK_MILESTONES,
  streakFromKeys,
} from '@/domain/streaks';

const TODAY = '2026-07-24';

describe('streakFromKeys', () => {
  it('counts consecutive days ending today', () => {
    expect(streakFromKeys(['2026-07-22', '2026-07-23', '2026-07-24'], TODAY)).toBe(3);
  });

  it('an empty today does not break the run until the day ends', () => {
    expect(streakFromKeys(['2026-07-22', '2026-07-23'], TODAY)).toBe(2);
  });

  it('a one-day gap ends the streak', () => {
    expect(streakFromKeys(['2026-07-20', '2026-07-21', '2026-07-24'], TODAY)).toBe(1);
    expect(streakFromKeys(['2026-07-20', '2026-07-21'], TODAY)).toBe(0);
  });

  it('crosses month boundaries', () => {
    expect(streakFromKeys(['2026-06-29', '2026-06-30', '2026-07-01'], '2026-07-01')).toBe(3);
  });

  it('a freeze day unions in like a logged day', () => {
    const withFreeze = ['2026-07-21', '2026-07-22', '2026-07-23' /* freeze */, '2026-07-24'];
    expect(streakFromKeys(withFreeze, TODAY)).toBe(4);
  });

  it('empty history is 0', () => {
    expect(streakFromKeys([], TODAY)).toBe(0);
  });
});

describe('repairableDayKey', () => {
  it('offers yesterday when exactly one day broke an active run', () => {
    expect(repairableDayKey(['2026-07-21', '2026-07-22', '2026-07-24'], TODAY)).toBe('2026-07-23');
    // Today unlogged yet: still repairable — the run resumes when they log.
    expect(repairableDayKey(['2026-07-21', '2026-07-22'], TODAY)).toBe('2026-07-23');
  });

  it('nothing to repair when the streak is intact', () => {
    expect(repairableDayKey(['2026-07-23', '2026-07-24'], TODAY)).toBeNull();
    expect(repairableDayKey(['2026-07-23'], TODAY)).toBeNull();
  });

  it('gaps wider than one day are not repairable', () => {
    expect(repairableDayKey(['2026-07-20', '2026-07-24'], TODAY)).toBeNull();
    expect(repairableDayKey([], TODAY)).toBeNull();
  });
});

describe('milestones', () => {
  it('thresholds are ascending and start at 3', () => {
    expect(STREAK_MILESTONES[0]).toBe(3);
    expect([...STREAK_MILESTONES]).toEqual([...STREAK_MILESTONES].sort((a, b) => a - b));
  });

  it('isMilestone / nextMilestone agree', () => {
    expect(isMilestone(7)).toBe(true);
    expect(isMilestone(8)).toBe(false);
    expect(nextMilestone(0)).toBe(3);
    expect(nextMilestone(7)).toBe(14);
    expect(nextMilestone(365)).toBeNull();
  });
});
