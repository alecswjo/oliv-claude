import { create } from 'zustand';
import { dayKeyFromIso } from '@/domain/dates';
import { longestStreak } from '@/domain/streaks';
import type { Meal, NutritionFacts } from '@/domain/types';
import { loadJson } from '@/services/storage';
import { createPersister } from './persist';
import { useUserStore } from './userStore';

/** Own-meal CRUD — spec §F2/F3. Social interactions on own meals also land here. */

const STORE_NAME = 'meals';

/** Editing any of these flips `source` ai → ai-adjusted (spec F2.8). */
export interface MealEditPatch {
  description?: string;
  mealType?: Meal['mealType'];
  nutrition?: NutritionFacts;
  foodItems?: string[];
  fruitVegServings?: number;
  processingLevel?: Meal['processingLevel'];
  healthScore?: Meal['healthScore'];
  isPrivate?: boolean;
}

const ANALYSIS_FIELDS: (keyof MealEditPatch)[] = [
  'nutrition', 'foodItems', 'fruitVegServings', 'processingLevel', 'healthScore',
];

interface MealState {
  meals: Meal[];
  hydrated: boolean;

  hydrate(): Promise<void>;
  addMeal(meal: Meal): void;
  updateMeal(id: string, patch: MealEditPatch): void;
  deleteMeal(id: string): void;
  toggleOlive(mealId: string, userId: string): void;
  addComment(mealId: string, comment: Meal['comments'][number]): void;
  deleteComment(mealId: string, commentId: string): void;
  reset(): void;
}

function syncLongestStreak(meals: Meal[]) {
  const dayKeys = meals.map((meal) => dayKeyFromIso(meal.loggedAt));
  useUserStore.getState().setLongestStreak(longestStreak(dayKeys));
}

export const useMealStore = create<MealState>()((set, get) => {
  const persist = createPersister(STORE_NAME, () => ({ meals: get().meals }));

  const setMeals = (meals: Meal[], { affectsStreak = false } = {}) => {
    set({ meals });
    persist();
    if (affectsStreak) syncLongestStreak(meals);
  };

  return {
    meals: [],
    hydrated: false,

    async hydrate() {
      const saved = await loadJson<{ meals: Meal[] }>(STORE_NAME);
      set({ meals: saved?.meals ?? [], hydrated: true });
    },

    addMeal(meal) {
      setMeals([meal, ...get().meals], { affectsStreak: true });
    },

    updateMeal(id, patch) {
      const meals = get().meals.map((meal) => {
        if (meal.id !== id) return meal;
        const touchesAnalysis = ANALYSIS_FIELDS.some((field) => patch[field] !== undefined);
        return {
          ...meal,
          ...patch,
          nutrition: patch.nutrition ?? meal.nutrition,
          source: touchesAnalysis && meal.source === 'ai' ? ('ai-adjusted' as const) : meal.source,
        };
      });
      setMeals(meals);
    },

    deleteMeal(id) {
      setMeals(get().meals.filter((meal) => meal.id !== id), { affectsStreak: true });
    },

    toggleOlive(mealId, userId) {
      const meals = get().meals.map((meal) => {
        if (meal.id !== mealId) return meal;
        const has = meal.oliveUserIds.includes(userId);
        return {
          ...meal,
          oliveUserIds: has
            ? meal.oliveUserIds.filter((id) => id !== userId)
            : [...meal.oliveUserIds, userId],
        };
      });
      setMeals(meals);
    },

    addComment(mealId, comment) {
      const meals = get().meals.map((meal) =>
        meal.id === mealId ? { ...meal, comments: [...meal.comments, comment] } : meal,
      );
      setMeals(meals);
    },

    deleteComment(mealId, commentId) {
      const meals = get().meals.map((meal) =>
        meal.id === mealId
          ? { ...meal, comments: meal.comments.filter((c) => c.id !== commentId) }
          : meal,
      );
      setMeals(meals);
    },

    reset() {
      set({ meals: [], hydrated: true });
      persist();
    },
  };
});
