import { EstimateMealAnalyzer, matchFoods } from '@/services/analyzer/estimateAnalyzer';
import { FOOD_LEXICON, MEAL_TYPE_DEFAULTS } from '@/services/analyzer/foodLexicon';
import { AnalyzerError } from '@/services/analyzer/types';

const analyzer = new EstimateMealAnalyzer();

describe('matchFoods', () => {
  it('matches single foods', () => {
    const matches = matchFoods('salmon for dinner');
    expect(matches.map((m) => m.template.name)).toEqual(['Salmon']);
  });

  it('prefers longest phrases over their substrings', () => {
    const matches = matchFoods('grilled chicken with rice');
    expect(matches.map((m) => m.template.name)).toEqual(['Grilled chicken', 'Rice']);
  });

  it('does not re-match consumed words', () => {
    const matches = matchFoods('greek yogurt');
    expect(matches.map((m) => m.template.name)).toEqual(['Greek yogurt']);
  });

  it('matches multiple distinct foods in text order', () => {
    const matches = matchFoods('eggs, toast and a latte');
    expect(matches.map((m) => m.template.name)).toEqual(['Eggs', 'Toast', 'Latte']);
  });

  it('applies quantity modifiers from the preceding window', () => {
    const matches = matchFoods('two taco lunch');
    expect(matches[0].multiplier).toBe(2);
    expect(matchFoods('large burrito')[0].multiplier).toBe(1.4);
    expect(matchFoods('half sandwich')[0].multiplier).toBe(0.5);
  });

  it('ignores punctuation and case', () => {
    const matches = matchFoods('SALMON!!! (wild-caught)');
    expect(matches[0].template.name).toBe('Salmon');
  });

  it('returns nothing for unknown text', () => {
    expect(matchFoods('mystery casserole xyz')).toEqual([]);
  });
});

describe('EstimateMealAnalyzer.analyze', () => {
  it('throws empty-input when there is no photo and no description', async () => {
    await expect(analyzer.analyze({ mealType: 'lunch' })).rejects.toThrow(AnalyzerError);
    await expect(analyzer.analyze({ mealType: 'lunch', description: '   ' })).rejects.toMatchObject({
      code: 'empty-input',
    });
  });

  it('reference vector: "grilled chicken with brown rice and broccoli" (spec §7.4/§13.2)', async () => {
    const result = await analyzer.analyze({
      description: 'grilled chicken with brown rice and broccoli',
      mealType: 'dinner',
    });
    const expected =
      FOOD_LEXICON['grilled chicken'].calories +
      FOOD_LEXICON['brown rice'].calories +
      FOOD_LEXICON.broccoli.calories;
    expect(result.calories).toBe(Math.round(expected)); // 550
    expect(result.foodItems).toEqual(['Grilled chicken', 'Brown rice', 'Broccoli']);
    expect(result.confidence).toBe('medium');
    expect(result.processingLevel).toBe(1); // all level-1 foods
    expect(result.fruitVegServings).toBeCloseTo(1.5, 1);
  });

  it('reference vector: "two taco" doubles the portion', async () => {
    const result = await analyzer.analyze({ description: 'two taco', mealType: 'lunch' });
    expect(result.calories).toBe(FOOD_LEXICON.taco.calories * 2); // 420
    expect(result.proteinG).toBeCloseTo(FOOD_LEXICON.taco.proteinG * 2, 1);
  });

  it('reference vector: unknown text falls back to the meal-type default at low confidence', async () => {
    const result = await analyzer.analyze({
      description: 'mystery casserole xyz',
      mealType: 'breakfast',
    });
    expect(result.calories).toBe(MEAL_TYPE_DEFAULTS.breakfast.calories);
    expect(result.confidence).toBe('low');
    expect(result.foodItems).toEqual(['mystery casserole xyz']);
  });

  it('photo-only input uses the meal-type default (offline cannot see the photo)', async () => {
    const result = await analyzer.analyze({ photoBase64: 'abc123', mealType: 'dinner' });
    expect(result.calories).toBe(MEAL_TYPE_DEFAULTS.dinner.calories);
    expect(result.confidence).toBe('low');
  });

  it('computes a calorie-weighted processing level', async () => {
    // donut (300 kcal, level 4) + coffee (5 kcal, level 1) → weighted ≈ 3.95 → 4
    const result = await analyzer.analyze({ description: 'donut and coffee', mealType: 'snack' });
    expect(result.processingLevel).toBe(4);
  });

  it('is deterministic: identical input → identical output', async () => {
    const input = { description: 'burger and fries with a soda', mealType: 'dinner' as const };
    const first = await analyzer.analyze(input);
    const second = await analyzer.analyze(input);
    expect(second).toEqual(first);
  });

  it('every lexicon template passes validation untouched (internal consistency)', async () => {
    for (const [key, template] of Object.entries(FOOD_LEXICON)) {
      const result = await analyzer.analyze({ description: key, mealType: 'lunch' });
      expect(result.calories).toBe(template.calories);
      expect(result.fiberG).toBeLessThanOrEqual(result.carbsG);
      expect(result.sugarG).toBeLessThanOrEqual(result.carbsG);
      expect(result.saturatedFatG).toBeLessThanOrEqual(result.fatG);
    }
  });
});
