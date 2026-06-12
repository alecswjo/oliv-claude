import AsyncStorage from '@react-native-async-storage/async-storage';
import { newId } from '@/domain/ids';
import type { Meal } from '@/domain/types';
import { storageKey } from '@/services/storage';
import { useMealStore } from '@/store/mealStore';
import { useUserStore } from '@/store/userStore';
import { flushPersistence } from '@/store/persist';

function makeMeal(overrides: Partial<Meal> = {}): Meal {
  return {
    id: newId(),
    userId: 'me',
    description: 'lunch',
    mealType: 'lunch',
    loggedAt: new Date(2026, 5, 10, 12).toISOString(),
    nutrition: {
      calories: 500, proteinG: 30, carbsG: 50, fatG: 15,
      fiberG: 5, sugarG: 8, sodiumMg: 500, saturatedFatG: 4,
    },
    foodItems: ['bowl'],
    fruitVegServings: 1,
    processingLevel: 2,
    confidence: 'high',
    healthScore: { value: 4, factors: [] },
    source: 'ai',
    isPrivate: false,
    oliveUserIds: [],
    comments: [],
    ...overrides,
  };
}

function seedProfile() {
  useUserStore.getState().completeOnboarding({
    displayName: 'Test', username: 'test_user', avatarEmoji: '🫒', avatarColor: '#708238',
    goals: { dailyCalories: 2000, proteinG: 100, carbsG: 263, fatG: 61 },
    goalsAreDefault: true,
  });
}

beforeEach(async () => {
  await AsyncStorage.clear();
  useMealStore.setState({ meals: [], hydrated: false });
  useUserStore.setState({ profile: null, hydrated: false });
});

describe('mealStore CRUD', () => {
  it('adds meals newest-first', () => {
    const a = makeMeal();
    const b = makeMeal();
    useMealStore.getState().addMeal(a);
    useMealStore.getState().addMeal(b);
    expect(useMealStore.getState().meals.map((m) => m.id)).toEqual([b.id, a.id]);
  });

  it('persists and hydrates round-trip', async () => {
    const meal = makeMeal();
    useMealStore.getState().addMeal(meal);
    await flushPersistence();

    useMealStore.setState({ meals: [], hydrated: false });
    await useMealStore.getState().hydrate();
    expect(useMealStore.getState().meals).toEqual([meal]);
    expect(useMealStore.getState().hydrated).toBe(true);
  });

  it('re-keys legacy non-uuid ids to uuids on hydrate (backend compatibility)', async () => {
    const legacy = {
      ...makeMeal(),
      id: 'meal_mbnq3k2001abcde',
      comments: [{ id: 'comment_legacy1', userId: 'me', text: 'hi', createdAt: '2026-06-10T12:00:00.000Z' }],
    };
    await AsyncStorage.setItem(storageKey('meals'), JSON.stringify({ meals: [legacy] }));
    await useMealStore.getState().hydrate();
    const [migrated] = useMealStore.getState().meals;
    expect(migrated.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(migrated.comments[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(migrated.description).toBe(legacy.description);
  });

  it('hydrates to empty state on corrupt storage', async () => {
    await AsyncStorage.setItem(storageKey('meals'), 'not json');
    await useMealStore.getState().hydrate();
    expect(useMealStore.getState().meals).toEqual([]);
    expect(useMealStore.getState().hydrated).toBe(true);
  });

  it('updateMeal patches fields', () => {
    const meal = makeMeal();
    useMealStore.getState().addMeal(meal);
    useMealStore.getState().updateMeal(meal.id, { description: 'renamed', isPrivate: true });
    const updated = useMealStore.getState().meals[0];
    expect(updated.description).toBe('renamed');
    expect(updated.isPrivate).toBe(true);
  });

  it('editing analysis fields flips source ai → ai-adjusted (spec F2.8)', () => {
    const meal = makeMeal({ source: 'ai' });
    useMealStore.getState().addMeal(meal);
    useMealStore.getState().updateMeal(meal.id, {
      nutrition: { ...meal.nutrition, calories: 600 },
      healthScore: { value: 3.5, factors: [] },
    });
    expect(useMealStore.getState().meals[0].source).toBe('ai-adjusted');
  });

  it('editing non-analysis fields keeps the source', () => {
    const meal = makeMeal({ source: 'ai' });
    useMealStore.getState().addMeal(meal);
    useMealStore.getState().updateMeal(meal.id, { description: 'still ai', isPrivate: true });
    expect(useMealStore.getState().meals[0].source).toBe('ai');
  });

  it('manual meals never become ai-adjusted', () => {
    const meal = makeMeal({ source: 'manual' });
    useMealStore.getState().addMeal(meal);
    useMealStore.getState().updateMeal(meal.id, { nutrition: { ...meal.nutrition, calories: 1 } });
    expect(useMealStore.getState().meals[0].source).toBe('manual');
  });

  it('deletes meals', () => {
    const meal = makeMeal();
    useMealStore.getState().addMeal(meal);
    useMealStore.getState().deleteMeal(meal.id);
    expect(useMealStore.getState().meals).toEqual([]);
  });
});

describe('mealStore longest-streak sync (spec F6.1/F2.8)', () => {
  it('recomputes longest streak on add and delete', () => {
    seedProfile();
    const day = (d: number, id: string) =>
      makeMeal({ id, loggedAt: new Date(2026, 5, d, 12).toISOString() });

    useMealStore.getState().addMeal(day(8, 'a'));
    useMealStore.getState().addMeal(day(9, 'b'));
    useMealStore.getState().addMeal(day(10, 'c'));
    expect(useUserStore.getState().profile?.longestStreak).toBe(3);

    // Deleting the middle day breaks the run — longest drops (can go down).
    useMealStore.getState().deleteMeal('b');
    expect(useUserStore.getState().profile?.longestStreak).toBe(1);
  });
});

describe('mealStore social interactions on own meals', () => {
  it('toggles olives idempotently', () => {
    const meal = makeMeal();
    useMealStore.getState().addMeal(meal);
    useMealStore.getState().toggleOlive(meal.id, 'me');
    expect(useMealStore.getState().meals[0].oliveUserIds).toEqual(['me']);
    useMealStore.getState().toggleOlive(meal.id, 'me');
    expect(useMealStore.getState().meals[0].oliveUserIds).toEqual([]);
  });

  it('adds and deletes comments', () => {
    const meal = makeMeal();
    useMealStore.getState().addMeal(meal);
    useMealStore.getState().addComment(meal.id, {
      id: 'c1', userId: 'me', text: 'yum', createdAt: new Date().toISOString(),
    });
    expect(useMealStore.getState().meals[0].comments).toHaveLength(1);
    useMealStore.getState().deleteComment(meal.id, 'c1');
    expect(useMealStore.getState().meals[0].comments).toHaveLength(0);
  });
});
