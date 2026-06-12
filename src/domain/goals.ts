import type { ActivityLevel, BodyGoal, BodyProfile, Goals } from './types';

/** Goal engine — spec §F1.3 / §F1.4 (Mifflin-St Jeor). */

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  veryActive: 1.9,
};

export const GOAL_ADJUSTMENTS: Record<BodyGoal, number> = {
  lose: -500,
  maintain: 0,
  gain: 300,
};

export const CALORIE_FLOOR = 1200;

/** Mifflin-St Jeor: 10*kg + 6.25*cm − 5*age + s. Unspecified sex uses the midpoint constant. */
export function bmr(body: Pick<BodyProfile, 'sex' | 'age' | 'heightCm' | 'weightKg'>): number {
  const sexConstant = body.sex === 'male' ? 5 : body.sex === 'female' ? -161 : -78;
  return 10 * body.weightKg + 6.25 * body.heightCm - 5 * body.age + sexConstant;
}

export function dailyCalorieTarget(body: BodyProfile): number {
  const tdee = bmr(body) * ACTIVITY_MULTIPLIERS[body.activity];
  const adjusted = tdee + GOAL_ADJUSTMENTS[body.goal];
  return Math.max(CALORIE_FLOOR, Math.round(adjusted));
}

/**
 * Macro split: protein 1.6 g/kg clamped to 20–35% of calories,
 * fat 27.5% of calories, carbs the remainder. Whole grams.
 */
export function macroTargets(dailyCalories: number, weightKg: number): Omit<Goals, 'dailyCalories'> {
  const proteinByWeight = 1.6 * weightKg;
  const proteinMin = (0.2 * dailyCalories) / 4;
  const proteinMax = (0.35 * dailyCalories) / 4;
  const proteinG = Math.round(Math.min(proteinMax, Math.max(proteinMin, proteinByWeight)));

  const fatG = Math.round((0.275 * dailyCalories) / 9);
  const carbsG = Math.max(0, Math.round((dailyCalories - proteinG * 4 - fatG * 9) / 4));

  return { proteinG, fatG, carbsG };
}

export function computeGoals(body: BodyProfile): Goals {
  const dailyCalories = dailyCalorieTarget(body);
  return { dailyCalories, ...macroTargets(dailyCalories, body.weightKg) };
}

/** Override validation — spec §F1.5. Returns error message or null when valid. */
export function validateGoalOverride(goals: Goals): string | null {
  if (!Number.isFinite(goals.dailyCalories) || goals.dailyCalories < 1000 || goals.dailyCalories > 6000) {
    return 'Daily calories must be between 1,000 and 6,000.';
  }
  for (const [key, value] of [
    ['Protein', goals.proteinG],
    ['Carbs', goals.carbsG],
    ['Fat', goals.fatG],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) return `${key} must be 0 or more.`;
  }
  const macroCalories = goals.proteinG * 4 + goals.carbsG * 4 + goals.fatG * 9;
  const drift = Math.abs(macroCalories - goals.dailyCalories) / goals.dailyCalories;
  if (drift > 0.25) {
    return 'Macros add up too far from your calorie target (±25%).';
  }
  return null;
}

export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;

export function lbsToKg(lbs: number): number {
  return lbs * KG_PER_LB;
}

export function feetInchesToCm(feet: number, inches: number): number {
  return (feet * 12 + inches) * CM_PER_IN;
}
