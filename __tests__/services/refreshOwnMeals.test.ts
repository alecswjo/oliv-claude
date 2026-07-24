/**
 * refreshOwnMeals: the focused foreground pull that lands agent-created meals
 * in the app. Must merge (never clobber) — local-only meals survive, in-flight
 * photo uploads keep their local URIs — and throttle repeat calls.
 */

let mockConfigured = true;
jest.mock('@/config', () => ({
  isBackendConfigured: () => mockConfigured,
  analyzeFunctionUrl: () => 'https://x/functions/v1/analyze',
}));

jest.mock('@/services/supabase/repo', () => ({
  fetchOwnMeals: jest.fn(),
  fetchDeletedMealIds: jest.fn(async () => new Set()),
  publicPhotoUrl: jest.fn((path: string) => `https://cdn/${path}`),
}));

import type { Meal } from '@/domain/types';
import * as repo from '@/services/supabase/repo';
import * as sync from '@/services/sync';
import { useAuthStore } from '@/store/authStore';
import { useMealStore } from '@/store/mealStore';

const mocked = repo as jest.Mocked<typeof repo>;
const USER = '11111111-1111-4111-8111-111111111111';

function mkMeal(id: string, loggedAt: string, over: Partial<Meal> = {}): Meal {
  return {
    id,
    userId: USER,
    description: id,
    mealType: 'lunch',
    loggedAt,
    nutrition: {
      calories: 500, proteinG: 30, carbsG: 40, fatG: 20,
      fiberG: 5, sugarG: 5, sodiumMg: 500, saturatedFatG: 4,
    },
    foodItems: [id],
    fruitVegServings: 1,
    processingLevel: 2,
    confidence: 'medium',
    healthScore: { value: 3.5, factors: [] },
    source: 'ai',
    isPrivate: true,
    oliveUserIds: [],
    comments: [],
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockConfigured = true;
  useAuthStore.setState({ userId: USER });
  useMealStore.getState().replaceAll([]);
  sync.resetRefreshThrottleForTests();
});

it('merges server meals in while keeping local-only meals', async () => {
  useMealStore.getState().replaceAll([mkMeal('local-only', '2026-07-23T10:00:00Z')]);
  mocked.fetchOwnMeals.mockResolvedValue([mkMeal('from-agent', '2026-07-23T12:00:00Z')]);

  await sync.refreshOwnMeals(true);

  const ids = useMealStore.getState().meals.map((m) => m.id);
  expect(ids).toEqual(['from-agent', 'local-only']); // newest first
});

it('preserves local photo URIs when the server row is still photo-less', async () => {
  const local = mkMeal('m1', '2026-07-23T10:00:00Z', { photoUris: ['file:///p.jpg'] });
  useMealStore.getState().replaceAll([local]);
  mocked.fetchOwnMeals.mockResolvedValue([mkMeal('m1', '2026-07-23T10:00:00Z')]);

  await sync.refreshOwnMeals(true);

  expect(useMealStore.getState().meals[0].photoUris).toEqual(['file:///p.jpg']);
});

it('drops tombstoned local copies (deleted via the agent) instead of keeping them', async () => {
  useMealStore.getState().replaceAll([
    mkMeal('ghost', '2026-07-23T10:00:00Z'),
    mkMeal('alive-local', '2026-07-23T11:00:00Z'),
  ]);
  mocked.fetchOwnMeals.mockResolvedValue([]);
  mocked.fetchDeletedMealIds.mockResolvedValue(new Set(['ghost']));

  await sync.refreshOwnMeals(true);

  expect(useMealStore.getState().meals.map((m) => m.id)).toEqual(['alive-local']);
});

it('throttles unforced refreshes to once a minute', async () => {
  mocked.fetchOwnMeals.mockResolvedValue([]);
  await sync.refreshOwnMeals();
  await sync.refreshOwnMeals();
  expect(mocked.fetchOwnMeals).toHaveBeenCalledTimes(1);
});

it('does nothing when signed out or offline', async () => {
  useAuthStore.setState({ userId: null });
  await sync.refreshOwnMeals(true);
  mockConfigured = false;
  await sync.refreshOwnMeals(true);
  expect(mocked.fetchOwnMeals).not.toHaveBeenCalled();
});

it('a fetch failure leaves the local store untouched', async () => {
  useMealStore.getState().replaceAll([mkMeal('keep', '2026-07-23T10:00:00Z')]);
  mocked.fetchOwnMeals.mockRejectedValue(new Error('network'));
  await sync.refreshOwnMeals(true);
  expect(useMealStore.getState().meals.map((m) => m.id)).toEqual(['keep']);
});
