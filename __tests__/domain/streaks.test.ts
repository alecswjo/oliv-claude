import { computeStreak, longestStreak } from '@/domain/streaks';

const today = new Date(2026, 5, 10); // Wed Jun 10 2026 (local)

describe('computeStreak', () => {
  it('returns 0 with no meals', () => {
    expect(computeStreak([], today)).toBe(0);
  });

  it('counts a single meal today as a 1-day streak', () => {
    expect(computeStreak(['2026-06-10'], today)).toBe(1);
  });

  it('counts consecutive days ending today', () => {
    expect(computeStreak(['2026-06-08', '2026-06-09', '2026-06-10'], today)).toBe(3);
  });

  it('does not break the streak when today is still empty (counts from yesterday)', () => {
    expect(computeStreak(['2026-06-08', '2026-06-09'], today)).toBe(2);
  });

  it('returns 0 when the last meal was two days ago', () => {
    expect(computeStreak(['2026-06-07', '2026-06-08'], today)).toBe(0);
  });

  it('stops at gaps', () => {
    expect(computeStreak(['2026-06-05', '2026-06-07', '2026-06-08', '2026-06-09', '2026-06-10'], today)).toBe(4);
  });

  it('handles month boundaries', () => {
    const june2 = new Date(2026, 5, 2);
    expect(computeStreak(['2026-05-30', '2026-05-31', '2026-06-01', '2026-06-02'], june2)).toBe(4);
  });

  it('handles year boundaries', () => {
    const jan1 = new Date(2026, 0, 1);
    expect(computeStreak(['2025-12-30', '2025-12-31', '2026-01-01'], jan1)).toBe(3);
  });

  it('ignores duplicate day keys (multiple meals per day)', () => {
    expect(computeStreak(['2026-06-10', '2026-06-10', '2026-06-09'], today)).toBe(2);
  });
});

describe('longestStreak', () => {
  it('returns 0 for empty history', () => {
    expect(longestStreak([])).toBe(0);
  });

  it('finds the longest run anywhere in history', () => {
    expect(
      longestStreak([
        '2026-01-01', '2026-01-02',
        '2026-03-10', '2026-03-11', '2026-03-12', '2026-03-13',
        '2026-06-10',
      ]),
    ).toBe(4);
  });

  it('handles a run across a month boundary', () => {
    expect(longestStreak(['2026-04-29', '2026-04-30', '2026-05-01'])).toBe(3);
  });
});
