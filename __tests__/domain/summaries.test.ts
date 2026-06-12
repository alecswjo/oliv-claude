import {
  averageScore,
  caloriesByDay,
  groupMealsByDay,
  summaryForDay,
  totalsForMeals,
} from '@/domain/summaries';
import type { Meal } from '@/domain/types';

let mealCounter = 0;

function meal(overrides: Partial<Meal> & { loggedAt: string }): Meal {
  mealCounter += 1;
  return {
    id: `m${mealCounter}`,
    userId: 'me',
    description: 'test meal',
    mealType: 'lunch',
    nutrition: {
      calories: 500, proteinG: 30, carbsG: 50, fatG: 15,
      fiberG: 5, sugarG: 8, sodiumMg: 500, saturatedFatG: 4,
    },
    foodItems: ['food'],
    fruitVegServings: 1,
    processingLevel: 2,
    confidence: 'high',
    healthScore: { value: 4, factors: [] },
    source: 'ai',
    isPrivate: false,
    oliveUserIds: [],
    comments: [],
    ...overrides,
  };
}

const goals = { dailyCalories: 2000, proteinG: 120, carbsG: 240, fatG: 60 };

describe('totalsForMeals', () => {
  it('sums nutrition and averages scores', () => {
    const totals = totalsForMeals([
      meal({ loggedAt: new Date(2026, 5, 10, 8).toISOString(), healthScore: { value: 5, factors: [] } }),
      meal({ loggedAt: new Date(2026, 5, 10, 13).toISOString(), healthScore: { value: 4, factors: [] } }),
    ]);
    expect(totals.calories).toBe(1000);
    expect(totals.proteinG).toBe(60);
    expect(totals.mealCount).toBe(2);
    expect(totals.avgScore).toBe(4.5);
  });

  it('returns zeroes and null score when empty', () => {
    const totals = totalsForMeals([]);
    expect(totals.calories).toBe(0);
    expect(totals.avgScore).toBeNull();
  });
});

describe('summaryForDay', () => {
  it('filters to the requested local day and computes remaining calories', () => {
    const meals = [
      meal({ loggedAt: new Date(2026, 5, 10, 8).toISOString() }),
      meal({ loggedAt: new Date(2026, 5, 9, 20).toISOString() }), // yesterday — excluded
    ];
    const summary = summaryForDay(meals, '2026-06-10', goals);
    expect(summary.mealCount).toBe(1);
    expect(summary.calories).toBe(500);
    expect(summary.remainingCalories).toBe(1500);
  });

  it('reports negative remaining when over target', () => {
    const meals = [
      meal({ loggedAt: new Date(2026, 5, 10, 8).toISOString(), nutrition: { ...meal({ loggedAt: '' }).nutrition, calories: 2400 } }),
    ];
    const summary = summaryForDay(meals, '2026-06-10', goals);
    expect(summary.remainingCalories).toBe(-400);
  });
});

describe('groupMealsByDay', () => {
  it('groups newest day first and newest meal first within a day', () => {
    const a = meal({ loggedAt: new Date(2026, 5, 9, 9).toISOString() });
    const b = meal({ loggedAt: new Date(2026, 5, 10, 8).toISOString() });
    const c = meal({ loggedAt: new Date(2026, 5, 10, 13).toISOString() });

    const groups = groupMealsByDay([a, b, c]);
    expect(groups.map((g) => g.dayKey)).toEqual(['2026-06-10', '2026-06-09']);
    expect(groups[0].meals.map((m) => m.id)).toEqual([c.id, b.id]);
  });

  it('returns an empty list for no meals', () => {
    expect(groupMealsByDay([])).toEqual([]);
  });
});

describe('caloriesByDay', () => {
  it('zero-fills days without meals across the window', () => {
    const meals = [
      meal({ loggedAt: new Date(2026, 5, 10, 8).toISOString() }),
      meal({ loggedAt: new Date(2026, 5, 10, 13).toISOString() }),
      meal({ loggedAt: new Date(2026, 5, 8, 13).toISOString() }),
    ];
    const result = caloriesByDay(meals, ['2026-06-08', '2026-06-09', '2026-06-10']);
    expect(result).toEqual([
      { dayKey: '2026-06-08', calories: 500 },
      { dayKey: '2026-06-09', calories: 0 },
      { dayKey: '2026-06-10', calories: 1000 },
    ]);
  });

  it('ignores meals outside the window', () => {
    const meals = [meal({ loggedAt: new Date(2026, 4, 1, 8).toISOString() })];
    const result = caloriesByDay(meals, ['2026-06-10']);
    expect(result[0].calories).toBe(0);
  });
});

describe('averageScore', () => {
  it('averages to one decimal', () => {
    const meals = [
      meal({ loggedAt: new Date().toISOString(), healthScore: { value: 4.5, factors: [] } }),
      meal({ loggedAt: new Date().toISOString(), healthScore: { value: 3, factors: [] } }),
      meal({ loggedAt: new Date().toISOString(), healthScore: { value: 3, factors: [] } }),
    ];
    expect(averageScore(meals)).toBe(3.5);
  });

  it('returns null for empty input', () => {
    expect(averageScore([])).toBeNull();
  });
});
