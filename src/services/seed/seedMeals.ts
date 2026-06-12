import { computeHealthScore } from '@/domain/healthScore';
import { validateAnalysis } from '@/domain/nutritionValidation';
import type { Meal, MealType } from '@/domain/types';
import { FOOD_LEXICON } from '@/services/analyzer/foodLexicon';
import { mulberry32, pick, randInt } from './rng';
import { SEED_USER_SPECS, type SeedUserSpec } from './seedUsers';

/**
 * Deterministic ~2-week meal histories for the demo users — spec §F4.1.
 * Generated once at first run (anchored to that date) with stable IDs, then
 * persisted; interactions reference these IDs safely forever after.
 */

const SEED = 0x0011f00d;

interface MealPlanEntry {
  keys: (keyof typeof FOOD_LEXICON)[];
  emoji: string;
  blurb: string;
}

const STYLE_MEALS: Record<SeedUserSpec['style'], MealPlanEntry[]> = {
  clean: [
    { keys: ['oatmeal', 'berries'], emoji: '🥣', blurb: 'Overnight oats with berries' },
    { keys: ['greek yogurt', 'banana'], emoji: '🍌', blurb: 'Greek yogurt + banana pre-run' },
    { keys: ['grilled chicken', 'quinoa', 'broccoli'], emoji: '🥗', blurb: 'Meal-prep bowl, week 4 and still not sick of it' },
    { keys: ['salmon', 'brown rice', 'spinach'], emoji: '🐟', blurb: 'Salmon night' },
    { keys: ['salad', 'avocado'], emoji: '🥑', blurb: 'Big green salad, extra avocado' },
    { keys: ['smoothie'], emoji: '🫐', blurb: 'Post-run smoothie' },
    { keys: ['stir fry', 'tofu'], emoji: '🥦', blurb: 'Tofu veggie stir fry' },
  ],
  highProtein: [
    { keys: ['eggs', 'toast', 'bacon'], emoji: '🍳', blurb: 'Standard issue lifter breakfast' },
    { keys: ['protein shake', 'banana'], emoji: '🥤', blurb: 'Shake between meetings' },
    { keys: ['grilled chicken', 'white rice'], emoji: '🍗', blurb: 'Chicken & rice. Again.' },
    { keys: ['steak', 'potato'], emoji: '🥩', blurb: 'Steak night, earned it' },
    { keys: ['tuna', 'sandwich'], emoji: '🥪', blurb: 'Tuna sando' },
    { keys: ['burger'], emoji: '🍔', blurb: 'Bulk season burger' },
    { keys: ['greek yogurt', 'granola'], emoji: '🥣', blurb: 'Casein before bed' },
  ],
  balanced: [
    { keys: ['avocado', 'toast', 'egg'], emoji: '🥑', blurb: 'Avo toast, runny egg' },
    { keys: ['sandwich', 'apple'], emoji: '🥪', blurb: 'Desk lunch' },
    { keys: ['pasta', 'salad'], emoji: '🍝', blurb: 'Pasta + side salad balance' },
    { keys: ['sushi'], emoji: '🍣', blurb: 'Sushi Friday' },
    { keys: ['curry', 'rice'], emoji: '🍛', blurb: 'Homemade curry' },
    { keys: ['soup', 'bread'], emoji: '🍲', blurb: 'Soup & sourdough' },
    { keys: ['cookie', 'latte'], emoji: '🍪', blurb: 'Afternoon treat, no regrets' },
  ],
  indulgent: [
    { keys: ['pancakes', 'bacon'], emoji: '🥞', blurb: 'Weekend stack' },
    { keys: ['burrito'], emoji: '🌯', blurb: 'Mission-style, the big one' },
    { keys: ['pizza'], emoji: '🍕', blurb: 'Pizza research continues' },
    { keys: ['ramen'], emoji: '🍜', blurb: 'Tonkotsu, extra chashu' },
    { keys: ['taco', 'taco', 'taco'], emoji: '🌮', blurb: 'Taco trilogy' },
    { keys: ['fried chicken', 'fries'], emoji: '🍟', blurb: 'Cheat day went great' },
    { keys: ['ice cream'], emoji: '🍦', blurb: 'Dessert is a food group' },
  ],
  plantBased: [
    { keys: ['oatmeal', 'almonds', 'berries'], emoji: '🌾', blurb: 'Oats, the faithful' },
    { keys: ['hummus', 'vegetables', 'bread'], emoji: '🥕', blurb: 'Hummus plate' },
    { keys: ['tofu', 'noodles', 'veggies'], emoji: '🍜', blurb: 'Tofu noodle bowl' },
    { keys: ['salad', 'quinoa', 'avocado'], emoji: '🥗', blurb: 'Quinoa power salad' },
    { keys: ['soup', 'spinach'], emoji: '🍲', blurb: 'Green soup experiment #12' },
    { keys: ['burrito'], emoji: '🌯', blurb: 'Bean burrito, no notes' },
    { keys: ['smoothie', 'banana'], emoji: '🥤', blurb: 'Banana-everything smoothie' },
  ],
};

const MEAL_HOURS: Record<MealType, [number, number]> = {
  breakfast: [7, 9],
  lunch: [12, 13],
  dinner: [18, 20],
  snack: [15, 16],
};

const SEED_COMMENTS = [
  'This looks incredible 🤤',
  'Recipe please!!',
  'Okay this is motivating me to cook tonight',
  'The meal prep dedication 🙌',
  'Need this in my life',
  'Solid macros on this one',
  'Bookmarking for the weekend',
  'Chef behavior honestly',
];

function isoAt(daysAgo: number, hour: number, minute: number, anchor: Date): string {
  const date = new Date(anchor);
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

/**
 * Build the full demo meal set. `anchor` is "now" at first run; pass a fixed
 * date in tests for snapshot-stable output.
 */
export function buildSeedMeals(anchor: Date, days = 14): Meal[] {
  const rand = mulberry32(SEED);
  const meals: Meal[] = [];

  for (const spec of SEED_USER_SPECS) {
    const plan = STYLE_MEALS[spec.style];

    for (let daysAgo = 0; daysAgo < days; daysAgo++) {
      // Most demo users log 2–3 meals/day; some days are quieter.
      const mealCount = randInt(rand, 0, 10) < 2 ? 1 : randInt(rand, 2, 3);

      for (let slot = 0; slot < mealCount; slot++) {
        const entry = plan[randInt(rand, 0, plan.length - 1)];
        const mealType: MealType =
          slot === 0 ? 'breakfast' : slot === 1 ? (randInt(rand, 0, 1) ? 'lunch' : 'snack') : 'dinner';
        const [hourMin, hourMax] = MEAL_HOURS[mealType];
        const hour = randInt(rand, hourMin, hourMax);
        const minute = randInt(rand, 0, 59);

        // Sum the lexicon templates with mild portion variance (deterministic).
        const portion = 0.85 + rand() * 0.4;
        const totals = {
          calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0,
          sugarG: 0, sodiumMg: 0, saturatedFatG: 0, fruitVegServings: 0,
        };
        let processingWeighted = 0;
        const foodItems: string[] = [];
        for (const key of entry.keys) {
          const template = FOOD_LEXICON[key];
          totals.calories += template.calories * portion;
          totals.proteinG += template.proteinG * portion;
          totals.carbsG += template.carbsG * portion;
          totals.fatG += template.fatG * portion;
          totals.fiberG += template.fiberG * portion;
          totals.sugarG += template.sugarG * portion;
          totals.sodiumMg += template.sodiumMg * portion;
          totals.saturatedFatG += template.saturatedFatG * portion;
          totals.fruitVegServings += template.fruitVegServings * portion;
          processingWeighted += template.processingLevel * template.calories * portion;
          foodItems.push(template.name);
        }

        const analysis = validateAnalysis({
          ...totals,
          calories: Math.round(totals.calories),
          processingLevel: Math.round(
            totals.calories > 0 ? processingWeighted / totals.calories : 2,
          ) as 1 | 2 | 3 | 4,
          confidence: 'high',
          foodItems,
        });

        const id = `seedmeal_${spec.id}_${daysAgo}_${slot}`;
        meals.push({
          id,
          userId: spec.id,
          emoji: entry.emoji,
          description: entry.blurb,
          mealType,
          loggedAt: isoAt(daysAgo, hour, minute, anchor),
          nutrition: {
            calories: analysis.calories,
            proteinG: analysis.proteinG,
            carbsG: analysis.carbsG,
            fatG: analysis.fatG,
            fiberG: analysis.fiberG,
            sugarG: analysis.sugarG,
            sodiumMg: analysis.sodiumMg,
            saturatedFatG: analysis.saturatedFatG,
          },
          foodItems: analysis.foodItems,
          fruitVegServings: analysis.fruitVegServings,
          processingLevel: analysis.processingLevel,
          confidence: analysis.confidence,
          healthScore: computeHealthScore(analysis),
          source: 'ai',
          isPrivate: false,
          oliveUserIds: seededOlives(rand, spec.id),
          comments: seededComments(rand, id, anchor),
        });
      }
    }
  }

  return meals;
}

function seededOlives(rand: () => number, ownerId: string): string[] {
  const count = randInt(rand, 0, 4);
  const others = SEED_USER_SPECS.filter((spec) => spec.id !== ownerId);
  const start = randInt(rand, 0, others.length - 1);
  return Array.from({ length: count }, (_, i) => others[(start + i) % others.length].id);
}

function seededComments(rand: () => number, mealId: string, anchor: Date) {
  if (randInt(rand, 0, 9) < 7) return []; // ~30% of meals get a comment
  const author = pick(rand, SEED_USER_SPECS);
  return [
    {
      id: `seedcomment_${mealId}`,
      userId: author.id,
      text: pick(rand, SEED_COMMENTS),
      createdAt: isoAt(0, randInt(rand, 9, 21), randInt(rand, 0, 59), anchor),
    },
  ];
}
