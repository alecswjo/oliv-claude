import { computeHealthScore } from '@/domain/healthScore';
import type { Meal, UserProfile } from '@/domain/types';
import {
  mealToInsert,
  profileToUpsert,
  rowToComment,
  rowToMeal,
  rowToProfile,
  type MealRow,
  type ProfileRow,
} from '@/services/supabase/types';

const profileRow: ProfileRow = {
  id: 'u1',
  username: 'maya_eats',
  display_name: 'Maya',
  avatar_emoji: '🥑',
  avatar_color: '#708238',
  bio: 'hi',
  goals: { dailyCalories: 2000, proteinG: 100, carbsG: 263, fatG: 61 },
  goals_are_default: false,
  body: null,
  default_private: true,
  created_at: '2026-06-01T00:00:00.000Z',
};

const mealRow: MealRow = {
  id: 'm1',
  user_id: 'u1',
  photo_path: 'u1/m1.jpg',
  emoji: null,
  description: 'salmon bowl',
  meal_type: 'dinner',
  logged_at: '2026-06-10T18:00:00.000Z',
  calories: 520, protein_g: 42, carbs_g: 38, fat_g: 21,
  fiber_g: 8, sugar_g: 5, sodium_mg: 380, saturated_fat_g: 4,
  food_items: ['Salmon', 'Quinoa'],
  fruit_veg_servings: 2.5,
  processing_level: 1,
  confidence: 'high',
  health_score_value: 5,
  health_score_factors: [{ factor: 'protein', label: 'Excellent protein', delta: 0.8 }],
  source: 'ai',
  is_private: false,
  olives: [{ user_id: 'u2' }, { user_id: 'u3' }],
  comments: [{ id: 'c1', user_id: 'u2', text: 'yum', created_at: '2026-06-10T19:00:00.000Z' }],
};

describe('rowToProfile', () => {
  it('maps snake_case row to the domain profile', () => {
    const p = rowToProfile(profileRow);
    expect(p).toMatchObject({
      id: 'u1', username: 'maya_eats', displayName: 'Maya',
      defaultPrivate: true, goalsAreDefault: false, isDemo: false,
      joinedAt: '2026-06-01T00:00:00.000Z',
    });
    expect(p.body).toBeUndefined();
  });
});

describe('rowToMeal', () => {
  it('maps nutrition, score, olives, comments, and resolves the photo URL', () => {
    const meal = rowToMeal(mealRow, (path) => `https://cdn/${path}`);
    expect(meal.id).toBe('m1');
    expect(meal.photoUri).toBe('https://cdn/u1/m1.jpg');
    expect(meal.nutrition).toEqual({
      calories: 520, proteinG: 42, carbsG: 38, fatG: 21,
      fiberG: 8, sugarG: 5, sodiumMg: 380, saturatedFatG: 4,
    });
    expect(meal.healthScore.value).toBe(5);
    expect(meal.oliveUserIds).toEqual(['u2', 'u3']);
    expect(meal.comments).toEqual([
      { id: 'c1', userId: 'u2', text: 'yum', createdAt: '2026-06-10T19:00:00.000Z' },
    ]);
  });

  it('omits photoUri when there is no photo path', () => {
    const meal = rowToMeal({ ...mealRow, photo_path: null, emoji: '🥗' }, (p) => p);
    expect(meal.photoUri).toBeUndefined();
    expect(meal.emoji).toBe('🥗');
  });

  it('round-trips a domain meal through mealToInsert → rowToMeal', () => {
    const analysis = {
      calories: 430, proteinG: 35, carbsG: 18, fatG: 24, fiberG: 4, sugarG: 3,
      sodiumMg: 740, saturatedFatG: 6, fruitVegServings: 1.5, processingLevel: 2 as const,
      confidence: 'high' as const, foodItems: ['Caesar'],
    };
    const meal: Meal = {
      id: 'm9', userId: 'u1', description: 'caesar', mealType: 'lunch',
      loggedAt: '2026-06-10T12:00:00.000Z',
      nutrition: {
        calories: analysis.calories, proteinG: analysis.proteinG, carbsG: analysis.carbsG,
        fatG: analysis.fatG, fiberG: analysis.fiberG, sugarG: analysis.sugarG,
        sodiumMg: analysis.sodiumMg, saturatedFatG: analysis.saturatedFatG,
      },
      foodItems: analysis.foodItems, fruitVegServings: analysis.fruitVegServings,
      processingLevel: analysis.processingLevel, confidence: analysis.confidence,
      healthScore: computeHealthScore(analysis), source: 'ai', isPrivate: false,
      oliveUserIds: [], comments: [],
    };
    const row = mealToInsert(meal) as MealRow;
    const back = rowToMeal(row);
    expect(back.nutrition).toEqual(meal.nutrition);
    expect(back.healthScore.value).toBe(meal.healthScore.value);
    expect(back.foodItems).toEqual(meal.foodItems);
    expect(back.mealType).toBe('lunch');
  });
});

describe('rowToComment', () => {
  it('maps a comment row', () => {
    expect(rowToComment({ id: 'c1', user_id: 'u2', text: 'nice', created_at: 't' })).toEqual({
      id: 'c1', userId: 'u2', text: 'nice', createdAt: 't',
    });
  });
});

describe('profileToUpsert', () => {
  it('maps a domain profile to an insert row', () => {
    const profile: UserProfile = {
      id: 'u1', username: 'tester', displayName: 'Test', avatarEmoji: '🫒',
      avatarColor: '#708238', bio: '', joinedAt: '2026-06-01T00:00:00.000Z',
      goals: { dailyCalories: 2000, proteinG: 100, carbsG: 263, fatG: 61 },
      goalsAreDefault: true, defaultPrivate: false, longestStreak: 0, isDemo: false,
    };
    const row = profileToUpsert(profile);
    expect(row).toMatchObject({ id: 'u1', username: 'tester', display_name: 'Test', goals_are_default: true });
    expect(row.body).toBeNull();
  });
});
