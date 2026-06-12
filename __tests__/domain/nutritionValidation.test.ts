import { mealTitle, validateAnalysis } from '@/domain/nutritionValidation';

describe('validateAnalysis', () => {
  const sane = {
    calories: 500, proteinG: 30, carbsG: 50, fatG: 15,
    fiberG: 6, sugarG: 8, sodiumMg: 600, saturatedFatG: 4,
    fruitVegServings: 1.5, processingLevel: 2 as const,
    confidence: 'high' as const, foodItems: ['chicken bowl'],
  };

  it('passes through sane values unchanged', () => {
    expect(validateAnalysis(sane)).toEqual(sane);
  });

  it('clamps calories to 0–5000 and rounds to whole numbers', () => {
    expect(validateAnalysis({ ...sane, calories: 9000 }).calories).toBe(5000);
    expect(validateAnalysis({ ...sane, calories: -50 }).calories).toBe(0);
    expect(validateAnalysis({ ...sane, calories: 512.7 }).calories).toBe(513);
  });

  it('treats missing / NaN numbers as 0', () => {
    const result = validateAnalysis({ calories: 300, proteinG: Number.NaN });
    expect(result.proteinG).toBe(0);
    expect(result.fiberG).toBe(0);
  });

  it('rescales macros proportionally when macro energy drifts >25% from calories', () => {
    // 4*100 + 4*100 + 9*0 = 800 vs 400 kcal stated → 100% drift → rescale by 0.5
    const result = validateAnalysis({ ...sane, calories: 400, proteinG: 100, carbsG: 100, fatG: 0 });
    expect(result.proteinG).toBeCloseTo(50, 0);
    expect(result.carbsG).toBeCloseTo(50, 0);
    const macroEnergy = result.proteinG * 4 + result.carbsG * 4 + result.fatG * 9;
    expect(Math.abs(macroEnergy - 400) / 400).toBeLessThanOrEqual(0.05);
  });

  it('keeps macros when drift is within tolerance', () => {
    // 30*4 + 50*4 + 15*9 = 455 vs 500 → 9% drift → untouched
    const result = validateAnalysis(sane);
    expect(result.proteinG).toBe(30);
  });

  it('caps fiber and sugar at carbs, saturated fat at fat', () => {
    const result = validateAnalysis({ ...sane, fiberG: 80, sugarG: 70, saturatedFatG: 40 });
    expect(result.fiberG).toBeLessThanOrEqual(result.carbsG);
    expect(result.sugarG).toBeLessThanOrEqual(result.carbsG);
    expect(result.saturatedFatG).toBeLessThanOrEqual(result.fatG);
  });

  it('clamps fruitVegServings to 0–10 and processing level to 1–4', () => {
    const result = validateAnalysis({ ...sane, fruitVegServings: 22, processingLevel: 9 as never });
    expect(result.fruitVegServings).toBe(10);
    expect(result.processingLevel).toBe(4);
    expect(validateAnalysis({ ...sane, processingLevel: 0 as never }).processingLevel).toBe(1);
  });

  it('defaults invalid confidence to low', () => {
    expect(validateAnalysis({ ...sane, confidence: 'sure' as never }).confidence).toBe('low');
    expect(validateAnalysis({ ...sane, confidence: undefined }).confidence).toBe('low');
  });

  it('sanitizes food items: trims, drops empties, caps at 10, never empty overall', () => {
    const items = [' salad ', '', '   ', ...Array.from({ length: 12 }, (_, i) => `item ${i}`)];
    const result = validateAnalysis({ ...sane, foodItems: items });
    expect(result.foodItems[0]).toBe('salad');
    expect(result.foodItems.length).toBe(10);

    expect(validateAnalysis({ ...sane, foodItems: [] }).foodItems).toEqual(['Meal']);
    expect(validateAnalysis({ ...sane, foodItems: undefined }).foodItems).toEqual(['Meal']);
  });

  it('truncates absurdly long item names', () => {
    const result = validateAnalysis({ ...sane, foodItems: ['x'.repeat(200)] });
    expect(result.foodItems[0].length).toBeLessThanOrEqual(60);
  });
});

describe('mealTitle', () => {
  it('joins up to three items', () => {
    expect(mealTitle(['eggs', 'toast', 'avocado', 'coffee'], 'fallback')).toBe('eggs · toast · avocado');
  });

  it('falls back when there are no items', () => {
    expect(mealTitle([], 'my lunch')).toBe('my lunch');
    expect(mealTitle([], '')).toBe('Meal');
  });

  it('caps the title length', () => {
    const title = mealTitle(['a'.repeat(40), 'b'.repeat(40)], '');
    expect(title.length).toBeLessThanOrEqual(64);
    expect(title.endsWith('…')).toBe(true);
  });
});

describe('validateAnalysis hardening (production review)', () => {
  it('re-clamps macros after the energy rescale', () => {
    // 5000 kcal with one tiny macro used to rescale protein to 1250 g
    const result = validateAnalysis({
      calories: 5000, proteinG: 100, carbsG: 0, fatG: 0,
      fiberG: 0, sugarG: 0, sodiumMg: 0, saturatedFatG: 0,
      fruitVegServings: 0, processingLevel: 2, confidence: 'high', foodItems: ['x'],
    });
    expect(result.proteinG).toBeLessThanOrEqual(400);
    expect(result.carbsG).toBeLessThanOrEqual(800);
    expect(result.fatG).toBeLessThanOrEqual(400);
  });

  it('defaults a missing processingLevel to 2, not the level-1 score bonus', () => {
    const result = validateAnalysis({
      calories: 500, proteinG: 20, carbsG: 60, fatG: 15,
      fiberG: 3, sugarG: 5, sodiumMg: 300, saturatedFatG: 3,
      fruitVegServings: 1, confidence: 'high', foodItems: ['x'],
    });
    expect(result.processingLevel).toBe(2);
  });
});
