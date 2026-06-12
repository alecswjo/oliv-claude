import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { DailySummaryCard } from '@/components/DailySummaryCard';
import type { DaySummary } from '@/domain/summaries';

const goals = { dailyCalories: 2000, proteinG: 100, carbsG: 263, fatG: 61 };

function summary(overrides: Partial<DaySummary> = {}): DaySummary {
  return {
    dayKey: '2026-06-10',
    calories: 1400,
    proteinG: 80,
    carbsG: 150,
    fatG: 40,
    mealCount: 3,
    avgScore: 4.2,
    remainingCalories: 600,
    ...overrides,
  };
}

describe('DailySummaryCard', () => {
  it('shows eaten calories, remaining, streak, and average score', async () => {
    await render(<DailySummaryCard summary={summary()} goals={goals} streak={5} />);
    expect(screen.getByLabelText('1400 of 2000 calories eaten')).toBeTruthy();
    expect(screen.getByLabelText('600 calories remaining')).toBeTruthy();
    expect(screen.getByLabelText('5 day streak')).toBeTruthy();
    expect(screen.getByText('4.2')).toBeTruthy(); // graded avg score
    expect(screen.getByText('3')).toBeTruthy(); // meals today
  });

  it('flips to over-target presentation when remaining is negative', async () => {
    await render(
      <DailySummaryCard
        summary={summary({ calories: 2300, remainingCalories: -300 })}
        goals={goals}
        streak={1}
      />,
    );
    expect(screen.getByLabelText('300 calories over target')).toBeTruthy();
    expect(screen.getByText('kcal over target')).toBeTruthy();
  });

  it('renders a dash when no meals are logged yet', async () => {
    await render(
      <DailySummaryCard
        summary={summary({ calories: 0, mealCount: 0, avgScore: null, remainingCalories: 2000 })}
        goals={goals}
        streak={0}
      />,
    );
    expect(screen.getByText('—')).toBeTruthy();
  });
});
