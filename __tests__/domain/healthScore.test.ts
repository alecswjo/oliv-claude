import { BASE_SCORE, computeHealthScore, scoreTone } from '@/domain/healthScore';
import type { MealAnalysis } from '@/domain/types';

function analysis(overrides: Partial<MealAnalysis>): MealAnalysis {
  return {
    calories: 500,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    fiberG: 0,
    sugarG: 0,
    sodiumMg: 0,
    saturatedFatG: 0,
    fruitVegServings: 0,
    processingLevel: 2,
    confidence: 'high',
    foodItems: ['test'],
    ...overrides,
  };
}

describe('computeHealthScore — spec §6.3 reference meals', () => {
  it('scores grilled salmon + quinoa + broccoli at 5.0', () => {
    const score = computeHealthScore(
      analysis({
        calories: 520, proteinG: 42, carbsG: 38, fatG: 21,
        fiberG: 8, sugarG: 5, sodiumMg: 380, saturatedFatG: 4,
        fruitVegServings: 2.5, processingLevel: 1,
      }),
    );
    expect(score.value).toBe(5.0);
  });

  it('scores light chicken caesar salad at 4.1', () => {
    const score = computeHealthScore(
      analysis({
        calories: 430, proteinG: 35, carbsG: 18, fatG: 24,
        fiberG: 4, sugarG: 3, sodiumMg: 740, saturatedFatG: 6,
        fruitVegServings: 1.5, processingLevel: 2,
      }),
    );
    expect(score.value).toBe(4.1);
  });

  it('scores frozen pepperoni pizza (3 slices) at 1.9', () => {
    const score = computeHealthScore(
      analysis({
        calories: 850, proteinG: 36, carbsG: 90, fatG: 38,
        fiberG: 5, sugarG: 9, sodiumMg: 1900, saturatedFatG: 16,
        fruitVegServings: 0.5, processingLevel: 4,
      }),
    );
    expect(score.value).toBe(1.9);
  });

  it('scores glazed donut + latte at 1.0 (clamped)', () => {
    const score = computeHealthScore(
      analysis({
        calories: 540, proteinG: 9, carbsG: 70, fatG: 24,
        fiberG: 1, sugarG: 38, sodiumMg: 320, saturatedFatG: 11,
        fruitVegServings: 0, processingLevel: 4,
      }),
    );
    expect(score.value).toBe(1.0);
  });

  it('scores oatmeal + berries + almonds at 4.3 (exercises tie-up rounding)', () => {
    const score = computeHealthScore(
      analysis({
        calories: 380, proteinG: 12, carbsG: 58, fatG: 12,
        fiberG: 10, sugarG: 12, sodiumMg: 95, saturatedFatG: 1.5,
        fruitVegServings: 1, processingLevel: 1,
      }),
    );
    expect(score.value).toBe(4.3);
  });
});

describe('computeHealthScore — factor tiers', () => {
  // 500 kcal base meal: per-100kcal divisor is 5.
  it.each([
    // proteinG, expected delta (share = proteinG*4/500)
    [38, 0.8],  // 0.304 ≥ 0.30
    [37.5, 0.8], // exactly 0.30 boundary
    [25, 0.5],  // 0.20
    [15, 0.2],  // 0.12
    [14, 0],    // below
  ])('protein %f g → delta %f', (proteinG, delta) => {
    const score = computeHealthScore(analysis({ proteinG }));
    const factor = score.factors.find((f) => f.factor === 'protein');
    expect(factor?.delta ?? 0).toBe(delta);
  });

  it.each([
    [12.5, 0.7],  // 2.5/100kcal exactly
    [7.5, 0.45],  // 1.5
    [3.5, 0.2],   // 0.7
    [3.4, 0],
  ])('fiber %f g → delta %f', (fiberG, delta) => {
    const score = computeHealthScore(analysis({ fiberG, carbsG: 100 }));
    const factor = score.factors.find((f) => f.factor === 'fiber');
    expect(factor?.delta ?? 0).toBe(delta);
  });

  it.each([
    [3, 0.6],
    [2, 0.4],
    [1, 0.25],
    [0.5, 0.1],
    [0.4, 0],
  ])('fruit/veg %f servings → delta %f', (fruitVegServings, delta) => {
    const score = computeHealthScore(analysis({ fruitVegServings }));
    const factor = score.factors.find((f) => f.factor === 'fruitVeg');
    expect(factor?.delta ?? 0).toBe(delta);
  });

  it.each([
    [1, 0.4],
    [2, 0.15],
    [3, -0.25],
    [4, -0.9],
  ] as const)('processing level %i → delta %f', (processingLevel, delta) => {
    const score = computeHealthScore(analysis({ processingLevel }));
    const factor = score.factors.find((f) => f.factor === 'processing');
    expect(factor?.delta).toBe(delta);
  });

  it.each([
    [35, -1.0],  // 7/100kcal
    [20, -0.6],  // 4
    [12.5, -0.3], // 2.5
    [12, 0],
  ])('sugar %f g → delta %f', (sugarG, delta) => {
    const score = computeHealthScore(analysis({ sugarG, carbsG: 100 }));
    const factor = score.factors.find((f) => f.factor === 'sugar');
    expect(factor?.delta ?? 0).toBe(delta);
  });

  it.each([
    [2000, -0.6],  // 400/100kcal
    [1250, -0.35], // 250
    [750, -0.15],  // 150
    [749, 0],
  ])('sodium %i mg → delta %f', (sodiumMg, delta) => {
    const score = computeHealthScore(analysis({ sodiumMg }));
    const factor = score.factors.find((f) => f.factor === 'sodium');
    expect(factor?.delta ?? 0).toBe(delta);
  });

  it.each([
    [12.5, -0.6],  // 2.5/100kcal
    [7.5, -0.35],  // 1.5
    [4, -0.15],    // 0.8
    [3.9, 0],
  ])('saturated fat %f g → delta %f', (saturatedFatG, delta) => {
    const score = computeHealthScore(analysis({ saturatedFatG, fatG: 50 }));
    const factor = score.factors.find((f) => f.factor === 'satFat');
    expect(factor?.delta ?? 0).toBe(delta);
  });

  it.each([
    [1201, -0.4],
    [1000, -0.2],
    [901, -0.2],
    [900, 0],
  ])('calories %i → delta %f', (calories, delta) => {
    const score = computeHealthScore(analysis({ calories }));
    const factor = score.factors.find((f) => f.factor === 'calories');
    expect(factor?.delta ?? 0).toBe(delta);
  });
});

describe('computeHealthScore — bounds & edge cases', () => {
  it('clamps to a minimum of 1.0', () => {
    const score = computeHealthScore(
      analysis({ calories: 1300, sugarG: 120, sodiumMg: 6000, saturatedFatG: 40, processingLevel: 4 }),
    );
    expect(score.value).toBe(1.0);
  });

  it('clamps to a maximum of 5.0', () => {
    const score = computeHealthScore(
      analysis({
        calories: 400, proteinG: 35, fiberG: 11, carbsG: 40,
        fruitVegServings: 4, processingLevel: 1,
      }),
    );
    expect(score.value).toBe(5.0);
  });

  it('short-circuits tiny meals (<30 kcal) to the base score', () => {
    const score = computeHealthScore(analysis({ calories: 15, sugarG: 2 }));
    expect(score.value).toBe(BASE_SCORE);
    expect(score.factors).toEqual([{ factor: 'tiny', label: 'Too small to score', delta: 0 }]);
  });

  it('every emitted factor carries a non-empty label', () => {
    const score = computeHealthScore(
      analysis({
        calories: 1300, proteinG: 100, fiberG: 20, carbsG: 120, fatG: 50,
        sugarG: 40, sodiumMg: 4000, saturatedFatG: 20,
        fruitVegServings: 2, processingLevel: 3,
      }),
    );
    expect(score.factors.length).toBe(8);
    for (const factor of score.factors) {
      expect(factor.label.length).toBeGreaterThan(0);
    }
  });

  it('lands exact ties despite float-hostile delta combinations (spec §6.2 robustness rule)', () => {
    // +0.2 +0.7 +0.25 +0.4 −0.3 sums to 1.2499999999999998 in naive float math;
    // integer-hundredths accumulation keeps the true 4.25 → at 0.1 rounding the
    // 42.5-tenths tie rounds up to 4.3.
    const score = computeHealthScore(
      analysis({
        calories: 380, proteinG: 12, carbsG: 58, fatG: 12,
        fiberG: 10, sugarG: 12, sodiumMg: 95, saturatedFatG: 1.5,
        fruitVegServings: 1, processingLevel: 1,
      }),
    );
    const sum = score.factors.reduce((acc, f) => acc + f.delta, 0);
    expect(sum).not.toBe(1.25); // demonstrates the naive sum drifts…
    expect(score.value).toBe(4.3); // …but the score is still exact
  });

  it('neutral mid-range meal stays near base', () => {
    const score = computeHealthScore(
      analysis({ calories: 500, proteinG: 14, carbsG: 60, fatG: 18, processingLevel: 2 }),
    );
    expect(score.value).toBeGreaterThanOrEqual(3.0);
    expect(score.value).toBeLessThanOrEqual(3.5);
  });
});

describe('scoreTone', () => {
  it.each([
    [4.5, 'good'],
    [4.0, 'good'],
    [3.5, 'ok'],
    [3.0, 'ok'],
    [2.5, 'poor'],
  ] as const)('%f → %s', (value, tone) => {
    expect(scoreTone(value)).toBe(tone);
  });
});
