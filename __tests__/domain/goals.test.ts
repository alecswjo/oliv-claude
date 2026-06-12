import {
  bmr,
  CALORIE_FLOOR,
  computeGoals,
  dailyCalorieTarget,
  feetInchesToCm,
  lbsToKg,
  macroTargets,
  validateGoalOverride,
} from '@/domain/goals';
import type { BodyProfile } from '@/domain/types';

const maya: BodyProfile = {
  sex: 'female', age: 27, heightCm: 165, weightKg: 62,
  activity: 'light', goal: 'lose',
};

const jake: BodyProfile = {
  sex: 'male', age: 32, heightCm: 180, weightKg: 84,
  activity: 'moderate', goal: 'gain',
};

describe('bmr (Mifflin-St Jeor)', () => {
  it('computes the male formula', () => {
    // 10*84 + 6.25*180 − 5*32 + 5 = 840 + 1125 − 160 + 5 = 1810
    expect(bmr(jake)).toBe(1810);
  });

  it('computes the female formula', () => {
    // 10*62 + 6.25*165 − 5*27 − 161 = 620 + 1031.25 − 135 − 161 = 1355.25
    expect(bmr(maya)).toBeCloseTo(1355.25);
  });

  it('uses the midpoint constant for unspecified sex', () => {
    const base = { age: 30, heightCm: 170, weightKg: 70 };
    const male = bmr({ ...base, sex: 'male' });
    const female = bmr({ ...base, sex: 'female' });
    const mid = bmr({ ...base, sex: 'unspecified' });
    expect(mid).toBeCloseTo((male + female) / 2);
  });
});

describe('dailyCalorieTarget', () => {
  it('applies activity multiplier and goal adjustment (lose)', () => {
    // 1355.25 * 1.375 − 500 = 1863.47 − 500 = 1363 (rounded)
    expect(dailyCalorieTarget(maya)).toBe(1363);
  });

  it('applies gain adjustment', () => {
    // 1810 * 1.55 + 300 = 2805.5 + 300 = 3106 (rounded)
    expect(dailyCalorieTarget(jake)).toBe(3106);
  });

  it('enforces the 1,200 kcal floor', () => {
    const tiny: BodyProfile = {
      sex: 'female', age: 80, heightCm: 150, weightKg: 42,
      activity: 'sedentary', goal: 'lose',
    };
    expect(dailyCalorieTarget(tiny)).toBe(CALORIE_FLOOR);
  });
});

describe('macroTargets', () => {
  it('uses 1.6 g/kg protein when within the 20–35% band', () => {
    const macros = macroTargets(2000, 70); // 112 g = 22.4% of calories → within band
    expect(macros.proteinG).toBe(112);
    expect(macros.fatG).toBe(Math.round((0.275 * 2000) / 9)); // 61
    // carbs absorb the remainder
    expect(macros.carbsG).toBe(Math.round((2000 - 112 * 4 - 61 * 9) / 4));
  });

  it('clamps protein up to the 20% minimum for heavy calorie targets', () => {
    const macros = macroTargets(4000, 60); // 96 g by weight, min is 200 g
    expect(macros.proteinG).toBe(200);
  });

  it('clamps protein down to the 35% maximum for low calorie targets', () => {
    const macros = macroTargets(1200, 100); // 160 g by weight, max is 105 g
    expect(macros.proteinG).toBe(105);
  });

  it('never returns negative carbs', () => {
    const macros = macroTargets(1200, 80);
    expect(macros.carbsG).toBeGreaterThanOrEqual(0);
  });
});

describe('computeGoals', () => {
  it('combines calorie target and macro split, all whole numbers', () => {
    const goals = computeGoals(jake);
    expect(goals.dailyCalories).toBe(3106);
    for (const value of Object.values(goals)) {
      expect(Number.isInteger(value)).toBe(true);
    }
    // macro energy roughly matches calorie target
    const macroEnergy = goals.proteinG * 4 + goals.carbsG * 4 + goals.fatG * 9;
    expect(Math.abs(macroEnergy - goals.dailyCalories)).toBeLessThan(20);
  });
});

describe('validateGoalOverride', () => {
  const valid = { dailyCalories: 2200, proteinG: 140, carbsG: 230, fatG: 70 };

  it('accepts a consistent override', () => {
    expect(validateGoalOverride(valid)).toBeNull();
  });

  it.each([
    [{ ...valid, dailyCalories: 900 }],
    [{ ...valid, dailyCalories: 6500 }],
    [{ ...valid, dailyCalories: Number.NaN }],
  ])('rejects out-of-range calories %o', (goals) => {
    expect(validateGoalOverride(goals)).toMatch(/calories/i);
  });

  it('rejects negative macros', () => {
    expect(validateGoalOverride({ ...valid, proteinG: -5 })).toMatch(/protein/i);
  });

  it('rejects macros drifting >25% from the calorie target', () => {
    expect(
      validateGoalOverride({ dailyCalories: 2000, proteinG: 10, carbsG: 20, fatG: 5 }),
    ).toMatch(/macros/i);
  });
});

describe('unit conversions', () => {
  it('converts pounds to kilograms', () => {
    expect(lbsToKg(150)).toBeCloseTo(68.04, 1);
  });

  it('converts feet/inches to centimeters', () => {
    expect(feetInchesToCm(5, 10)).toBeCloseTo(177.8, 1);
  });
});
