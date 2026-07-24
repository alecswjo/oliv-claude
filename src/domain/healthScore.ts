// Explicit .ts extension: this module is also imported by the Deno-based
// gateway (supabase/functions/agent-inbound), and Deno requires it.
import type { HealthScore, MealAnalysis, ProcessingLevel, ScoreFactor } from './types.ts';

/**
 * Oliv Health Score — normative algorithm, spec §6.
 * Deterministic and rule-based so it is explainable and recomputes identically
 * after the user edits an AI estimate. Version bumps require updating the
 * reference tests in healthScore.test.ts deliberately.
 */
export const SCORE_VERSION = 1;

export const BASE_SCORE = 3.0;
export const MIN_SCOREABLE_CALORIES = 30;

interface Tier {
  min: number;
  delta: number;
  label: string;
}

/** Tiers are checked top-down; first `value >= min` wins. */
const PROTEIN_TIERS: Tier[] = [
  { min: 0.3, delta: 0.8, label: 'Excellent protein' },
  { min: 0.2, delta: 0.5, label: 'Good protein' },
  { min: 0.12, delta: 0.2, label: 'Some protein' },
];

const FIBER_TIERS: Tier[] = [
  { min: 2.5, delta: 0.7, label: 'Very high fiber' },
  { min: 1.5, delta: 0.45, label: 'High fiber' },
  { min: 0.7, delta: 0.2, label: 'Some fiber' },
];

const FRUIT_VEG_TIERS: Tier[] = [
  { min: 3, delta: 0.6, label: 'Loaded with produce' },
  { min: 2, delta: 0.4, label: 'Plenty of produce' },
  { min: 1, delta: 0.25, label: 'Includes produce' },
  { min: 0.5, delta: 0.1, label: 'A little produce' },
];

const PROCESSING_DELTAS: Record<ProcessingLevel, { delta: number; label: string }> = {
  1: { delta: 0.4, label: 'Whole foods' },
  2: { delta: 0.15, label: 'Lightly processed' },
  3: { delta: -0.25, label: 'Processed' },
  4: { delta: -0.9, label: 'Ultra-processed' },
};

const SUGAR_TIERS: Tier[] = [
  { min: 7, delta: -1.0, label: 'Very high sugar' },
  { min: 4, delta: -0.6, label: 'High sugar' },
  { min: 2.5, delta: -0.3, label: 'Some added sugar' },
];

const SODIUM_TIERS: Tier[] = [
  { min: 400, delta: -0.6, label: 'Very high sodium' },
  { min: 250, delta: -0.35, label: 'High sodium' },
  { min: 150, delta: -0.15, label: 'Salty' },
];

const SAT_FAT_TIERS: Tier[] = [
  { min: 2.5, delta: -0.6, label: 'Very high saturated fat' },
  { min: 1.5, delta: -0.35, label: 'High saturated fat' },
  { min: 0.8, delta: -0.15, label: 'Some saturated fat' },
];

const CALORIE_TIERS: Tier[] = [
  { min: 1201, delta: -0.4, label: 'Very large meal' },
  { min: 901, delta: -0.2, label: 'Large meal' },
];

function matchTier(value: number, tiers: Tier[]): Tier | undefined {
  return tiers.find((tier) => value >= tier.min);
}

function pushFactor(factors: ScoreFactor[], factor: string, tier: Tier | undefined) {
  if (tier) factors.push({ factor, label: tier.label, delta: tier.delta });
}

/**
 * All deltas are multiples of 0.05, so we accumulate in integer hundredths and
 * only divide at the end — float summation can drift a true tie (e.g. 4.25 at
 * 4.2499…), flipping the final rounding the wrong way (spec §6.2). The score is
 * rounded to the nearest 0.1, ties rounding up.
 */
function scoreFromFactors(factors: ScoreFactor[]): number {
  const hundredths =
    BASE_SCORE * 100 + factors.reduce((sum, f) => sum + Math.round(f.delta * 100), 0);
  const tenths = Math.round(hundredths / 10); // nearest 0.1; ties (x.5 tenths) round up
  return Math.min(5, Math.max(1, tenths / 10));
}

export function computeHealthScore(analysis: MealAnalysis): HealthScore {
  const { calories } = analysis;

  if (calories < MIN_SCOREABLE_CALORIES) {
    return {
      value: BASE_SCORE,
      factors: [{ factor: 'tiny', label: 'Too small to score', delta: 0 }],
    };
  }

  const per100 = 100 / calories;
  const factors: ScoreFactor[] = [];

  pushFactor(factors, 'protein', matchTier((analysis.proteinG * 4) / calories, PROTEIN_TIERS));
  pushFactor(factors, 'fiber', matchTier(analysis.fiberG * per100, FIBER_TIERS));
  pushFactor(factors, 'fruitVeg', matchTier(analysis.fruitVegServings, FRUIT_VEG_TIERS));

  const processing = PROCESSING_DELTAS[analysis.processingLevel];
  factors.push({ factor: 'processing', label: processing.label, delta: processing.delta });

  pushFactor(factors, 'sugar', matchTier(analysis.sugarG * per100, SUGAR_TIERS));
  pushFactor(factors, 'sodium', matchTier(analysis.sodiumMg * per100, SODIUM_TIERS));
  pushFactor(factors, 'satFat', matchTier(analysis.saturatedFatG * per100, SAT_FAT_TIERS));
  pushFactor(factors, 'calories', matchTier(calories, CALORIE_TIERS));

  return { value: scoreFromFactors(factors), factors };
}

/** Display color bucket for a score value. */
export function scoreTone(value: number): 'good' | 'ok' | 'poor' {
  if (value >= 4) return 'good';
  if (value >= 3) return 'ok';
  return 'poor';
}
