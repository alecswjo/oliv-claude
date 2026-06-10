import type { Confidence, MealAnalysis, ProcessingLevel } from './types';

/**
 * Validation & clamping for analyzer output — spec §F2.6.
 * Every analysis (Claude, estimator, or manual entry) passes through here
 * before scoring/saving, so downstream code can trust the numbers.
 */

export const MAX_MEAL_CALORIES = 5000;
export const MACRO_ENERGY_TOLERANCE = 0.25;

function clampNumber(value: unknown, min: number, max: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.min(max, Math.max(min, n));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

const CONFIDENCES: Confidence[] = ['high', 'medium', 'low'];

export function validateAnalysis(raw: Partial<MealAnalysis>): MealAnalysis {
  const calories = Math.round(clampNumber(raw.calories, 0, MAX_MEAL_CALORIES));

  let proteinG = clampNumber(raw.proteinG, 0, 400);
  let carbsG = clampNumber(raw.carbsG, 0, 800);
  let fatG = clampNumber(raw.fatG, 0, 400);

  // Macro/energy consistency: if 4P+4C+9F drifts more than 25% from calories,
  // rescale macros proportionally toward the stated calories (calories win —
  // they are the headline number the user sees first).
  const macroEnergy = proteinG * 4 + carbsG * 4 + fatG * 9;
  if (calories > 0 && macroEnergy > 0) {
    const drift = Math.abs(macroEnergy - calories) / calories;
    if (drift > MACRO_ENERGY_TOLERANCE) {
      const scale = calories / macroEnergy;
      proteinG *= scale;
      carbsG *= scale;
      fatG *= scale;
    }
  }

  proteinG = round1(proteinG);
  carbsG = round1(carbsG);
  fatG = round1(fatG);

  // Sub-nutrients can never exceed their parent macro.
  const fiberG = round1(Math.min(clampNumber(raw.fiberG, 0, 150), carbsG));
  const sugarG = round1(Math.min(clampNumber(raw.sugarG, 0, 500), carbsG));
  const saturatedFatG = round1(Math.min(clampNumber(raw.saturatedFatG, 0, 200), fatG));
  const sodiumMg = Math.round(clampNumber(raw.sodiumMg, 0, 10000));

  const fruitVegServings = round1(clampNumber(raw.fruitVegServings, 0, 10));

  const levelNum = Math.round(clampNumber(raw.processingLevel, 1, 4));
  const processingLevel = (levelNum < 1 ? 1 : levelNum > 4 ? 4 : levelNum) as ProcessingLevel;

  const confidence: Confidence = CONFIDENCES.includes(raw.confidence as Confidence)
    ? (raw.confidence as Confidence)
    : 'low';

  const foodItems = Array.isArray(raw.foodItems)
    ? raw.foodItems
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim().slice(0, 60))
        .slice(0, 10)
    : [];

  return {
    calories,
    proteinG,
    carbsG,
    fatG,
    fiberG,
    sugarG,
    sodiumMg,
    saturatedFatG,
    fruitVegServings,
    processingLevel,
    confidence,
    foodItems: foodItems.length > 0 ? foodItems : ['Meal'],
  };
}

/** Title shown on cards: top food items joined, capped for layout. */
export function mealTitle(foodItems: string[], fallback: string): string {
  const items = foodItems.filter(Boolean).slice(0, 3);
  if (items.length === 0) return fallback || 'Meal';
  const title = items.join(' · ');
  return title.length > 64 ? `${title.slice(0, 61)}…` : title;
}
