/**
 * The sync gate decides whether mutations mirror to the backend; the queue
 * guarantees ordering (a meal insert never races the profile row it
 * references); hydrateForUser reconciles instead of clobbering local state.
 * The actual Supabase writes are thin wrappers verified live; the repo is
 * mocked here so the SDK never loads.
 */

let mockConfigured = false;
jest.mock('@/config', () => ({
  isBackendConfigured: () => mockConfigured,
  analyzeFunctionUrl: () => 'https://x/functions/v1/analyze',
}));

jest.mock('@/services/supabase/repo', () => ({
  fetchProfile: jest.fn(),
  fetchOwnMeals: jest.fn(),
  upsertProfile: jest.fn(),
  insertMeal: jest.fn(),
  setMealPhotoPaths: jest.fn(),
  publicPhotoUrl: jest.fn((path: string) => `https://cdn/${path}`),
  updateMeal: jest.fn(),
  deleteMeal: jest.fn(),
  setOlive: jest.fn(),
  insertComment: jest.fn(),
  deleteComment: jest.fn(),
}));
jest.mock('@/services/supabase/photos', () => ({
  uploadMealPhoto: jest.fn(),
  deleteMealPhotos: jest.fn(),
}));

import type { Meal, UserProfile } from '@/domain/types';
import * as repo from '@/services/supabase/repo';
import * as sync from '@/services/sync';
import { useAuthStore } from '@/store/authStore';
import { useMealStore } from '@/store/mealStore';
import { flushPersistence } from '@/store/persist';
import { useUserStore } from '@/store/userStore';

const mocked = repo as jest.Mocked<typeof repo>;

function mkMeal(id: string, userId: string, loggedAt: string): Meal {
  return {
    id,
    userId,
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
    confidence: 'high',
    healthScore: { value: 4, factors: [] },
    source: 'ai',
    isPrivate: false,
    oliveUserIds: [],
    comments: [],
  };
}

const localProfile: UserProfile = {
  id: 'user-local', username: 'al', displayName: 'Al', avatarEmoji: '🫒',
  avatarColor: '#708238', bio: '', joinedAt: '2026-06-01T00:00:00.000Z',
  goals: { dailyCalories: 2000, proteinG: 100, carbsG: 250, fatG: 60 },
  goalsAreDefault: true, defaultPrivate: false, longestStreak: 0, isDemo: false,
};

const meal = { id: 'm1', userId: 'u1' } as Meal;

let warnSpy: jest.SpyInstance;

beforeEach(async () => {
  jest.clearAllMocks();
  sync.resetPendingForTests();
  await (await import('@react-native-async-storage/async-storage')).default.clear();
  mockConfigured = false;
  useAuthStore.setState({ status: 'signedOut', userId: null, requiresAuth: false });
  useUserStore.setState({ profile: null, hydrated: true });
  useMealStore.setState({ meals: [], hydrated: true });
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
  await sync.flushSync();
  await flushPersistence();
  warnSpy.mockRestore();
});

function signIn(userId = 'auth-1') {
  mockConfigured = true;
  useAuthStore.setState({ status: 'signedIn', userId });
}

describe('sync gate', () => {
  it('is inactive with no backend configured', () => {
    expect(sync.backendActive()).toBe(false);
    expect(sync.currentUserId()).toBeNull();
  });

  it('is inactive when configured but signed out', () => {
    mockConfigured = true;
    expect(sync.backendActive()).toBe(false);
    expect(sync.currentUserId()).toBeNull();
  });

  it('is active and exposes the user id when configured + signed in', () => {
    signIn('u1');
    expect(sync.backendActive()).toBe(true);
    expect(sync.currentUserId()).toBe('u1');
  });

  it('push helpers are safe no-ops when inactive (offline-first)', async () => {
    expect(() => {
      sync.pushNewMeal(meal);
      sync.pushMealUpdate('m1', { isPrivate: true });
      sync.pushMealDelete(meal);
      sync.pushOlive('m1', 'u1', true);
      sync.pushCommentDelete('c1');
    }).not.toThrow();
    await sync.flushSync();
    expect(mocked.insertMeal).not.toHaveBeenCalled();
    expect(mocked.updateMeal).not.toHaveBeenCalled();
  });

  it('hydrateForUser is a no-op without a backend', async () => {
    await expect(sync.hydrateForUser('u1')).resolves.toEqual({ hasProfile: false });
  });
});

describe('push queue', () => {
  it('runs pushes in order, with the profile ensured before a new meal (FK)', async () => {
    signIn();
    useUserStore.setState({ profile: { ...localProfile, id: 'auth-1' }, hydrated: true });
    const calls: string[] = [];
    mocked.upsertProfile.mockImplementation(async () => { calls.push('profile'); });
    mocked.insertMeal.mockImplementation(async () => { calls.push('meal'); });

    sync.pushProfile({ ...localProfile, id: 'auth-1' });
    sync.pushNewMeal(mkMeal('m-new', 'auth-1', '2026-06-12T12:00:00.000Z'));
    await sync.flushSync();

    // pushProfile, then pushNewMeal's own ensure-profile, then the insert
    expect(calls).toEqual(['profile', 'profile', 'meal']);
  });

  it('uploads local photos, records their paths, and writes public URLs back (no push)', async () => {
    signIn();
    useUserStore.setState({ profile: { ...localProfile, id: 'auth-1' }, hydrated: true });
    const meal = {
      ...mkMeal('m-photo', 'auth-1', '2026-06-12T12:00:00.000Z'),
      photoUris: ['file:///tmp/a.jpg', 'data:image/jpeg;base64,xyz'],
    };
    useMealStore.setState({ meals: [meal], hydrated: true });
    const photos = jest.requireMock('@/services/supabase/photos') as {
      uploadMealPhoto: jest.Mock;
    };
    photos.uploadMealPhoto.mockImplementation(
      async (_src: unknown, userId: string, mealId: string, index: number) =>
        `${userId}/${mealId}-${index}.jpg`,
    );

    sync.pushNewMeal(meal);
    await sync.flushSync();

    expect(photos.uploadMealPhoto).toHaveBeenCalledTimes(2);
    expect(mocked.setMealPhotoPaths).toHaveBeenCalledWith('m-photo', [
      'auth-1/m-photo-0.jpg',
      'auth-1/m-photo-1.jpg',
    ]);
    // permanent URLs adopted locally so reloads don't lose the images
    expect(useMealStore.getState().meals[0].photoUris).toEqual([
      'https://cdn/auth-1/m-photo-0.jpg',
      'https://cdn/auth-1/m-photo-1.jpg',
    ]);
  });

  it('a failed push is logged and does not block later pushes', async () => {
    signIn();
    mocked.updateMeal.mockRejectedValue(new Error('boom'));
    mocked.setOlive.mockResolvedValue(undefined);

    sync.pushMealUpdate('m1', { isPrivate: true });
    sync.pushOlive('m1', 'auth-1', true);
    await sync.flushSync();

    expect(mocked.setOlive).toHaveBeenCalledWith('m1', 'auth-1', true);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('mealUpdate failed'),
      expect.any(Error),
    );
  });

  it('queues a transiently-failed op and replays it on the next push', async () => {
    signIn();
    mocked.updateMeal.mockRejectedValueOnce(new Error('network down'));
    mocked.updateMeal.mockResolvedValue(undefined);
    mocked.setOlive.mockResolvedValue(undefined);

    sync.pushMealUpdate('m1', { isPrivate: true });
    await sync.flushSync();
    expect(sync.pendingOpCount()).toBe(1);

    // The next push drains the log first — the edit lands, not reverts.
    sync.pushOlive('m1', 'auth-1', true);
    await sync.flushSync();
    expect(sync.pendingOpCount()).toBe(0);
    expect(mocked.updateMeal).toHaveBeenCalledTimes(2);
    expect(mocked.updateMeal).toHaveBeenLastCalledWith('m1', { isPrivate: true });
  });

  it('drops permanently-failed ops (SQLSTATE errors) instead of retrying forever', async () => {
    signIn();
    const pgError = Object.assign(new Error('duplicate key'), { code: '23505' });
    mocked.setOlive.mockRejectedValue(pgError);

    sync.pushOlive('m1', 'auth-1', true);
    await sync.flushSync();
    expect(sync.pendingOpCount()).toBe(0);
  });
});

describe('hydrateForUser reconciliation', () => {
  it('adopts the server profile and merges meal sets, re-pushing local-only meals', async () => {
    signIn();
    const serverProfile = { ...localProfile, id: 'auth-1', displayName: 'Server Al' };
    const serverMeal = mkMeal('m-server', 'auth-1', '2026-06-11T12:00:00.000Z');
    const localMeal = mkMeal('m-local', 'user-local', '2026-06-12T08:00:00.000Z');
    useUserStore.setState({ profile: localProfile, hydrated: true });
    useMealStore.setState({ meals: [localMeal], hydrated: true });
    mocked.fetchProfile.mockResolvedValue(serverProfile);
    mocked.fetchOwnMeals.mockResolvedValue([serverMeal]);
    mocked.insertMeal.mockResolvedValue(undefined);

    const result = await sync.hydrateForUser('auth-1');

    expect(result.hasProfile).toBe(true);
    expect(useUserStore.getState().profile?.displayName).toBe('Server Al');
    // local-only meal re-keyed to the authenticated user and pushed back
    expect(mocked.insertMeal).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'm-local', userId: 'auth-1' }),
    );
    // merged, newest first — nothing dropped
    expect(useMealStore.getState().meals.map((m) => m.id)).toEqual(['m-local', 'm-server']);
  });

  it('re-keys a local-only profile to the auth user instead of forcing re-onboarding', async () => {
    signIn();
    useUserStore.setState({ profile: localProfile, hydrated: true });
    mocked.fetchProfile.mockResolvedValue(null);
    mocked.fetchOwnMeals.mockResolvedValue([]);
    mocked.upsertProfile.mockResolvedValue(undefined);

    const result = await sync.hydrateForUser('auth-1');

    expect(result.hasProfile).toBe(true);
    expect(mocked.upsertProfile).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'auth-1', username: 'al' }),
    );
    expect(useUserStore.getState().profile?.id).toBe('auth-1');
  });

  it('reports no profile for a brand-new user and pushes nothing', async () => {
    signIn();
    mocked.fetchProfile.mockResolvedValue(null);
    mocked.fetchOwnMeals.mockResolvedValue([]);

    const result = await sync.hydrateForUser('auth-1');

    expect(result.hasProfile).toBe(false);
    expect(mocked.upsertProfile).not.toHaveBeenCalled();
    expect(mocked.insertMeal).not.toHaveBeenCalled();
  });

  it('a server fetch never wipes local meals that failed to push (insert errors logged)', async () => {
    signIn();
    const localMeal = mkMeal('m-local', 'user-local', '2026-06-12T08:00:00.000Z');
    useUserStore.setState({ profile: { ...localProfile, id: 'auth-1' }, hydrated: true });
    useMealStore.setState({ meals: [localMeal], hydrated: true });
    mocked.fetchProfile.mockResolvedValue({ ...localProfile, id: 'auth-1' });
    mocked.fetchOwnMeals.mockResolvedValue([]);
    mocked.insertMeal.mockRejectedValue(new Error('still failing'));

    await sync.hydrateForUser('auth-1');

    // The meal stays local even though the re-push failed; retried next launch.
    expect(useMealStore.getState().meals.map((m) => m.id)).toEqual(['m-local']);
  });
});
