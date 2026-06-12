/**
 * The sync gate decides whether mutations mirror to the backend. The actual
 * Supabase writes are thin wrappers verified live; here we lock down the gating
 * logic and the offline-safety guarantee (no backend => silent no-ops).
 */

let mockConfigured = false;
jest.mock('@/config', () => ({
  isBackendConfigured: () => mockConfigured,
  analyzeFunctionUrl: () => 'https://x/functions/v1/analyze',
}));

import type { Meal } from '@/domain/types';
import { useAuthStore } from '@/store/authStore';
import * as sync from '@/services/sync';

const meal = { id: 'm1', userId: 'u1' } as Meal;

beforeEach(() => {
  mockConfigured = false;
  useAuthStore.setState({ status: 'signedOut', userId: null, requiresAuth: false });
});

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
    mockConfigured = true;
    useAuthStore.setState({ status: 'signedIn', userId: 'u1' });
    expect(sync.backendActive()).toBe(true);
    expect(sync.currentUserId()).toBe('u1');
  });

  it('push helpers are safe no-ops when inactive (offline-first)', () => {
    expect(() => {
      sync.pushNewMeal(meal);
      sync.pushMealUpdate('m1', { isPrivate: true });
      sync.pushMealDelete(meal);
      sync.pushOlive('m1', 'u1', true);
      sync.pushCommentDelete('c1');
    }).not.toThrow();
  });

  it('hydrateForUser is a no-op without a backend', async () => {
    await expect(sync.hydrateForUser('u1')).resolves.toEqual({ hasProfile: false });
  });
});
