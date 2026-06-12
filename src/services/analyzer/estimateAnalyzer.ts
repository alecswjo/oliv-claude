import { validateAnalysis } from '@/domain/nutritionValidation';
import type { MealAnalysis, ProcessingLevel } from '@/domain/types';
import { FOOD_LEXICON, MEAL_TYPE_DEFAULTS, QUANTITY_MODIFIERS, type FoodTemplate } from './foodLexicon';
import { AnalyzerError, type AnalyzeInput, type MealAnalyzer } from './types';

/**
 * Deterministic offline estimator — spec §7.4. Powers demo mode (no API key)
 * and the fallback path when the Claude analyzer fails. Never random: the
 * same input always yields the same output, so demos and tests are stable.
 */

interface Match {
  template: FoodTemplate;
  multiplier: number;
  index: number;
}

const LEXICON_KEYS = Object.keys(FOOD_LEXICON).sort((a, b) => b.length - a.length);

function normalize(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
}

/** Multiplier from quantity words in the window just before the matched phrase. */
function quantityFor(normalized: string, matchIndex: number): number {
  const windowStart = Math.max(0, matchIndex - 16);
  // +1 keeps the boundary space, so " two " matches right before the phrase.
  const before = normalized.slice(windowStart, matchIndex + 1);
  for (const [word, factor] of Object.entries(QUANTITY_MODIFIERS)) {
    if (before.includes(` ${word} `)) return factor;
  }
  return 1;
}

export function matchFoods(description: string): Match[] {
  let normalized = normalize(description);
  const matches: Match[] = [];

  for (const key of LEXICON_KEYS) {
    const needle = ` ${key} `;
    let at = normalized.indexOf(needle);
    while (at !== -1 && matches.length < 8) {
      matches.push({ template: FOOD_LEXICON[key], multiplier: quantityFor(normalized, at), index: at });
      // Blank out the consumed phrase so 'grilled chicken' doesn't re-match 'chicken'.
      normalized = `${normalized.slice(0, at + 1)}${'#'.repeat(key.length)}${normalized.slice(at + 1 + key.length)}`;
      at = normalized.indexOf(needle);
    }
  }

  return matches.sort((a, b) => a.index - b.index);
}

function combine(matches: Match[]): MealAnalysis {
  const totals = {
    calories: 0, proteinG: 0, carbsG: 0, fatG: 0,
    fiberG: 0, sugarG: 0, sodiumMg: 0, saturatedFatG: 0,
    fruitVegServings: 0,
  };
  let processingSum = 0;
  const foodItems: string[] = [];

  for (const { template, multiplier } of matches) {
    totals.calories += template.calories * multiplier;
    totals.proteinG += template.proteinG * multiplier;
    totals.carbsG += template.carbsG * multiplier;
    totals.fatG += template.fatG * multiplier;
    totals.fiberG += template.fiberG * multiplier;
    totals.sugarG += template.sugarG * multiplier;
    totals.sodiumMg += template.sodiumMg * multiplier;
    totals.saturatedFatG += template.saturatedFatG * multiplier;
    totals.fruitVegServings += template.fruitVegServings * multiplier;
    processingSum += template.processingLevel * template.calories * multiplier;
    foodItems.push(template.name);
  }

  // Calorie-weighted processing level, rounded to the nearest level.
  const processingLevel = Math.round(
    totals.calories > 0 ? processingSum / totals.calories : 2,
  ) as ProcessingLevel;

  return validateAnalysis({
    ...totals,
    calories: Math.round(totals.calories),
    processingLevel,
    confidence: 'medium', // spec §7.4: ≥1 lexicon match → medium
    foodItems,
  });
}

export class EstimateMealAnalyzer implements MealAnalyzer {
  readonly kind = 'estimate' as const;

  async analyze(input: AnalyzeInput): Promise<MealAnalysis> {
    const description = input.description?.trim() ?? '';
    if (!description && !input.photos?.length) {
      throw new AnalyzerError('empty-input', 'Add a photo or a description to analyze.');
    }

    const matches = matchFoods(description);
    if (matches.length > 0) {
      return combine(matches);
    }

    // Nothing recognized: meal-type-typical default. With only a photo we
    // cannot see anything offline, so confidence is low.
    const fallback = MEAL_TYPE_DEFAULTS[input.mealType] ?? MEAL_TYPE_DEFAULTS.lunch;
    return validateAnalysis({
      ...fallback,
      confidence: 'low',
      foodItems: [description ? description.slice(0, 40) : fallback.name],
    });
  }
}
