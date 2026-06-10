import {
  addDays,
  dateFromDayKey,
  dayKey,
  dayKeyFromIso,
  dayLabel,
  lastNDayKeys,
  mealTypeForHour,
  relativeLabel,
  timeLabel,
} from '@/domain/dates';

const today = new Date(2026, 5, 10, 12, 0); // Wed Jun 10 2026, noon local

describe('dayKey', () => {
  it('formats local dates with zero padding', () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(dayKey(today)).toBe('2026-06-10');
  });

  it('round-trips through dateFromDayKey', () => {
    const date = dateFromDayKey('2026-06-10');
    expect(dayKey(date)).toBe('2026-06-10');
    expect(date.getHours()).toBe(0);
  });
});

describe('addDays / lastNDayKeys', () => {
  it('crosses month boundaries', () => {
    expect(dayKey(addDays(new Date(2026, 5, 1), -1))).toBe('2026-05-31');
  });

  it('produces an oldest-first window ending today', () => {
    const keys = lastNDayKeys(today, 7);
    expect(keys).toHaveLength(7);
    expect(keys[0]).toBe('2026-06-04');
    expect(keys[6]).toBe('2026-06-10');
  });
});

describe('dayLabel', () => {
  it('labels today and yesterday', () => {
    expect(dayLabel('2026-06-10', today)).toBe('Today');
    expect(dayLabel('2026-06-09', today)).toBe('Yesterday');
  });

  it('labels older days with weekday + date', () => {
    expect(dayLabel('2026-06-08', today)).toBe('Mon, Jun 8');
  });

  it('appends the year for other years', () => {
    expect(dayLabel('2025-12-31', today)).toBe('Wed, Dec 31, 2025');
  });
});

describe('timeLabel', () => {
  it('formats morning and evening times', () => {
    expect(timeLabel(new Date(2026, 5, 10, 7, 5).toISOString())).toBe('7:05 AM');
    expect(timeLabel(new Date(2026, 5, 10, 19, 42).toISOString())).toBe('7:42 PM');
  });

  it('handles midnight and noon', () => {
    expect(timeLabel(new Date(2026, 5, 10, 0, 0).toISOString())).toBe('12:00 AM');
    expect(timeLabel(new Date(2026, 5, 10, 12, 0).toISOString())).toBe('12:00 PM');
  });
});

describe('relativeLabel', () => {
  const now = new Date(2026, 5, 10, 12, 0);

  it.each([
    [new Date(2026, 5, 10, 11, 59, 30), 'now'],
    [new Date(2026, 5, 10, 11, 55), '5m'],
    [new Date(2026, 5, 10, 9, 0), '3h'],
    [new Date(2026, 5, 8, 12, 0), '2d'],
  ])('formats %s as %s', (date, expected) => {
    expect(relativeLabel(date.toISOString(), now)).toBe(expected);
  });

  it('falls back to a short date after a week', () => {
    expect(relativeLabel(new Date(2026, 4, 20).toISOString(), now)).toBe('May 20');
  });
});

describe('mealTypeForHour', () => {
  it.each([
    [7, 'breakfast'],
    [10, 'breakfast'],
    [12, 'lunch'],
    [14, 'lunch'],
    [16, 'snack'],
    [19, 'dinner'],
    [23, 'snack'],
    [2, 'snack'],
  ] as const)('hour %i → %s', (hour, expected) => {
    expect(mealTypeForHour(hour)).toBe(expected);
  });
});

describe('dayKeyFromIso', () => {
  it('uses local time for the key', () => {
    const iso = new Date(2026, 5, 10, 23, 30).toISOString();
    expect(dayKeyFromIso(iso)).toBe('2026-06-10');
  });
});
