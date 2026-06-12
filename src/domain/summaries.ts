import { dayKeyFromIso } from './dates';
import type { Goals, Meal } from './types';

/** Daily totals & feed grouping — spec §F3, §F6. */

export interface DayTotals {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  mealCount: number;
  avgScore: number | null;
}

export interface DaySummary extends DayTotals {
  dayKey: string;
  remainingCalories: number;
}

export function totalsForMeals(meals: Meal[]): DayTotals {
  let calories = 0;
  let proteinG = 0;
  let carbsG = 0;
  let fatG = 0;
  let scoreSum = 0;

  for (const meal of meals) {
    calories += meal.nutrition.calories;
    proteinG += meal.nutrition.proteinG;
    carbsG += meal.nutrition.carbsG;
    fatG += meal.nutrition.fatG;
    scoreSum += meal.healthScore.value;
  }

  return {
    calories: Math.round(calories),
    proteinG: Math.round(proteinG),
    carbsG: Math.round(carbsG),
    fatG: Math.round(fatG),
    mealCount: meals.length,
    avgScore: meals.length > 0 ? Math.round((scoreSum / meals.length) * 10) / 10 : null,
  };
}

export function summaryForDay(meals: Meal[], key: string, goals: Goals): DaySummary {
  const dayMeals = meals.filter((meal) => dayKeyFromIso(meal.loggedAt) === key);
  const totals = totalsForMeals(dayMeals);
  return {
    ...totals,
    dayKey: key,
    remainingCalories: goals.dailyCalories - totals.calories,
  };
}

export interface DayGroup {
  dayKey: string;
  meals: Meal[]; // newest first within the day
}

/** Group meals by local day, days newest-first, meals newest-first. */
export function groupMealsByDay(meals: Meal[]): DayGroup[] {
  const sorted = [...meals].sort(
    (a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime(),
  );
  const groups: DayGroup[] = [];
  const index = new Map<string, DayGroup>();
  for (const meal of sorted) {
    const key = dayKeyFromIso(meal.loggedAt);
    let group = index.get(key);
    if (!group) {
      group = { dayKey: key, meals: [] };
      index.set(key, group);
      groups.push(group);
    }
    group.meals.push(meal);
  }
  return groups;
}

/** Calories per day for a window of day keys (zero-filled), for the 7-day chart. */
export function caloriesByDay(meals: Meal[], dayKeys: string[]): { dayKey: string; calories: number }[] {
  const totals = new Map<string, number>(dayKeys.map((key) => [key, 0]));
  for (const meal of meals) {
    const key = dayKeyFromIso(meal.loggedAt);
    if (totals.has(key)) {
      totals.set(key, (totals.get(key) ?? 0) + meal.nutrition.calories);
    }
  }
  return dayKeys.map((key) => ({ dayKey: key, calories: Math.round(totals.get(key) ?? 0) }));
}

/** Mean of per-meal scores across a set of meals (1 decimal), null when empty. */
export function averageScore(meals: Meal[]): number | null {
  if (meals.length === 0) return null;
  const sum = meals.reduce((acc, meal) => acc + meal.healthScore.value, 0);
  return Math.round((sum / meals.length) * 10) / 10;
}
