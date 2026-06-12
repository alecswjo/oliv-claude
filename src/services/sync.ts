import { isBackendConfigured } from '@/config';
import type { Comment, Meal, UserProfile } from '@/domain/types';
import type { MealEditPatch } from '@/store/mealStore';
import { useAuthStore } from '@/store/authStore';

/**
 * Write-through sync to the backend. Local Zustand stores stay the source of
 * truth / offline cache; when the user is signed in to a configured backend,
 * mutations are mirrored to Supabase (best-effort, non-blocking). Everything
 * is gated on `backendActive()` and the Supabase modules are dynamically
 * imported, so offline mode and the test suite never touch the SDK.
 */

export function backendActive(): boolean {
  return isBackendConfigured() && useAuthStore.getState().userId != null;
}

/** Authenticated user id when signed in to a backend, else null. */
export function currentUserId(): string | null {
  return isBackendConfigured() ? useAuthStore.getState().userId : null;
}

function logSyncError(op: string) {
  return (err: unknown) => {
    // Best-effort: a failed mirror must not break the offline-first UX.
    // eslint-disable-next-line no-console
    console.warn(`[oliv:sync] ${op} failed`, err);
  };
}

function isLocalUri(uri: string): boolean {
  return uri.startsWith('file:') || uri.startsWith('content:') || uri.startsWith('/');
}

function run(op: string, fn: () => Promise<unknown>): void {
  if (!backendActive()) return;
  void fn().catch(logSyncError(op));
}

export function pushNewMeal(meal: Meal): void {
  run('pushNewMeal', async () => {
    const repo = await import('@/services/supabase/repo');
    await repo.insertMeal(meal);
    if (meal.photoUri && isLocalUri(meal.photoUri)) {
      const photos = await import('@/services/supabase/photos');
      const path = await photos.uploadMealPhoto({ fileUri: meal.photoUri }, meal.userId, meal.id);
      await repo.setMealPhotoPath(meal.id, path);
    }
  });
}

export function pushMealUpdate(id: string, patch: MealEditPatch): void {
  run('pushMealUpdate', async () => {
    const repo = await import('@/services/supabase/repo');
    await repo.updateMeal(id, patch);
  });
}

export function pushMealDelete(meal: Meal): void {
  run('pushMealDelete', async () => {
    const repo = await import('@/services/supabase/repo');
    await repo.deleteMeal(meal.id);
    const photos = await import('@/services/supabase/photos');
    await photos.deleteMealPhoto(`${meal.userId}/${meal.id}.jpg`);
  });
}

export function pushOlive(mealId: string, userId: string, on: boolean): void {
  run('pushOlive', async () => {
    const repo = await import('@/services/supabase/repo');
    await repo.setOlive(mealId, userId, on);
  });
}

export function pushComment(mealId: string, comment: Comment): void {
  run('pushComment', async () => {
    const repo = await import('@/services/supabase/repo');
    await repo.insertComment(mealId, comment);
  });
}

export function pushCommentDelete(commentId: string): void {
  run('pushCommentDelete', async () => {
    const repo = await import('@/services/supabase/repo');
    await repo.deleteComment(commentId);
  });
}

export function pushProfile(profile: UserProfile): void {
  run('pushProfile', async () => {
    const repo = await import('@/services/supabase/repo');
    await repo.upsertProfile(profile);
  });
}

/**
 * After sign-in, load the user's profile + own meals from the backend into the
 * local stores. Returns whether a server profile existed (so the caller can
 * route to onboarding when it didn't). Dynamically imports stores to avoid any
 * static cycle; only ever runs in backend mode.
 */
export async function hydrateForUser(userId: string): Promise<{ hasProfile: boolean }> {
  if (!isBackendConfigured()) return { hasProfile: false };
  const repo = await import('@/services/supabase/repo');
  const { useUserStore } = await import('@/store/userStore');
  const { useMealStore } = await import('@/store/mealStore');

  const [profile, meals] = await Promise.all([
    repo.fetchProfile(userId),
    repo.fetchOwnMeals(userId),
  ]);

  if (profile) useUserStore.getState().adoptProfile(profile);
  useMealStore.getState().replaceAll(meals);
  return { hasProfile: profile != null };
}
