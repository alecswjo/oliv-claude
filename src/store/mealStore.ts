import { create } from 'zustand';
import { dayKeyFromIso } from '@/domain/dates';
import { isUuid, newId } from '@/domain/ids';
import { longestStreak } from '@/domain/streaks';
import type { Meal, NutritionFacts } from '@/domain/types';
import { loadJson } from '@/services/storage';
import * as sync from '@/services/sync';
import { createPersister } from './persist';
import { useUserStore } from './userStore';

/** Own-meal CRUD — spec §F2/F3. Social interactions on own meals also land here. */

const STORE_NAME = 'meals';

/** Editing any of these flips `source` ai → ai-adjusted (spec F2.8). */
export interface MealEditPatch {
  caption?: string;
  description?: string;
  mealType?: Meal['mealType'];
  nutrition?: NutritionFacts;
  foodItems?: string[];
  fruitVegServings?: number;
  processingLevel?: Meal['processingLevel'];
  confidence?: Meal['confidence'];
  source?: Meal['source'];
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
  replaceAll(meals: Meal[]): void;
  /** Swap a meal's photo URIs in place WITHOUT a sync push (post-upload write-back). */
  adoptPhotoUris(id: string, photoUris: string[]): void;
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
      const saved = await loadJson<{ meals: (Meal & { photoUri?: string })[] }>(STORE_NAME);
      // Back-compat: meals persisted before multi-photo had a single photoUri,
      // and meals from before UUID ids carry `meal_…`/`comment_…` ids that the
      // backend's uuid columns reject — re-key them once so they can sync.
      const meals = (saved?.meals ?? []).map(({ photoUri, ...meal }) => ({
        ...meal,
        id: isUuid(meal.id) ? meal.id : newId(),
        comments: meal.comments.map((c) => (isUuid(c.id) ? c : { ...c, id: newId() })),
        photoUris: meal.photoUris ?? (photoUri ? [photoUri] : undefined),
      }));
      set({ meals, hydrated: true });
      if (meals.some((m, i) => m.id !== saved?.meals[i]?.id)) persist();
    },

    /** Replace local meals with a server-loaded set (backend hydrate; no push-back). */
    replaceAll(meals: Meal[]) {
      setMeals(meals, { affectsStreak: true });
    },

    adoptPhotoUris(id, photoUris) {
      setMeals(get().meals.map((meal) => (meal.id === id ? { ...meal, photoUris } : meal)));
    },

    addMeal(meal) {
      setMeals([meal, ...get().meals], { affectsStreak: true });
      sync.pushNewMeal(meal);
    },

    updateMeal(id, patch) {
      if (!get().meals.some((meal) => meal.id === id)) return;
      const meals = get().meals.map((meal) => {
        if (meal.id !== id) return meal;
        const touchesAnalysis = ANALYSIS_FIELDS.some((field) => patch[field] !== undefined);
        return {
          ...meal,
          ...patch,
          nutrition: patch.nutrition ?? meal.nutrition,
          source:
            patch.source ??
            (touchesAnalysis && meal.source === 'ai' ? ('ai-adjusted' as const) : meal.source),
        };
      });
      setMeals(meals);
      sync.pushMealUpdate(id, patch);
    },

    deleteMeal(id) {
      const meal = get().meals.find((m) => m.id === id);
      setMeals(get().meals.filter((m) => m.id !== id), { affectsStreak: true });
      if (meal) sync.pushMealDelete(meal);
    },

    toggleOlive(mealId, userId) {
      if (!get().meals.some((meal) => meal.id === mealId)) return;
      let nowActive = false;
      const meals = get().meals.map((meal) => {
        if (meal.id !== mealId) return meal;
        const has = meal.oliveUserIds.includes(userId);
        nowActive = !has;
        return {
          ...meal,
          oliveUserIds: has
            ? meal.oliveUserIds.filter((id) => id !== userId)
            : [...meal.oliveUserIds, userId],
        };
      });
      setMeals(meals);
      sync.pushOlive(mealId, userId, nowActive);
    },

    addComment(mealId, comment) {
      if (!get().meals.some((meal) => meal.id === mealId)) return;
      const meals = get().meals.map((meal) =>
        meal.id === mealId ? { ...meal, comments: [...meal.comments, comment] } : meal,
      );
      setMeals(meals);
      sync.pushComment(mealId, comment);
    },

    deleteComment(mealId, commentId) {
      if (!get().meals.some((meal) => meal.id === mealId)) return;
      const meals = get().meals.map((meal) =>
        meal.id === mealId
          ? { ...meal, comments: meal.comments.filter((c) => c.id !== commentId) }
          : meal,
      );
      setMeals(meals);
      sync.pushCommentDelete(commentId);
    },

    reset() {
      set({ meals: [], hydrated: true });
      persist();
    },
  };
});
