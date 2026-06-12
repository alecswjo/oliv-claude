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
  return (
    uri.startsWith('file:') ||
    uri.startsWith('content:') ||
    uri.startsWith('blob:') || // web
    uri.startsWith('data:') || // web
    uri.startsWith('/')
  );
}

/**
 * Pushes run through a single queue so they land in the order they were made.
 * Without this, the meal insert can race the profile insert it references
 * (FK + RLS) and lose. A failed op is logged and never blocks the queue.
 */
let queue: Promise<void> = Promise.resolve();

function run(op: string, fn: () => Promise<unknown>): void {
  if (!backendActive()) return;
  queue = queue.then(fn).then(
    () => undefined,
    (err) => logSyncError(op)(err),
  );
}

/** Test/await seam: resolves when every queued push so far has settled. */
export function flushSync(): Promise<void> {
  return queue;
}

/** Insert the meal row and, when the photo is a local file, mirror it to Storage. */
async function insertMealWithPhoto(meal: Meal): Promise<void> {
  const repo = await import('@/services/supabase/repo');
  await repo.insertMeal(meal);
  if (meal.photoUri && isLocalUri(meal.photoUri)) {
    const photos = await import('@/services/supabase/photos');
    const path = await photos.uploadMealPhoto({ fileUri: meal.photoUri }, meal.userId, meal.id);
    await repo.setMealPhotoPath(meal.id, path);
  }
}

export function pushNewMeal(meal: Meal): void {
  run('pushNewMeal', async () => {
    // The meal row references the profile row (FK + RLS), so make sure the
    // profile exists even if its own push was lost — upsert is idempotent.
    const repo = await import('@/services/supabase/repo');
    const { useUserStore } = await import('@/store/userStore');
    const profile = useUserStore.getState().profile;
    if (profile) await repo.upsertProfile(profile).catch(logSyncError('ensureProfile'));
    await insertMealWithPhoto(meal);
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
 * After sign-in, reconcile the server state with the local stores.
 *
 * - Profile: a server profile wins. When the server has none but a local one
 *   exists (the device onboarded offline / before sign-in), the local profile
 *   is re-keyed to the authenticated user id and created server-side, so
 *   existing users keep their identity instead of redoing onboarding.
 * - Meals: NEVER blindly replace local with server. Local meals the server
 *   doesn't have (missed/failed pushes, offline logging) are re-keyed to the
 *   authenticated user and pushed back; both sets are merged. A meal can
 *   resurrect after being deleted on another device — acceptable next to
 *   silently losing logged data.
 *
 * Returns whether a profile now exists (so callers route to onboarding when
 * it doesn't). Dynamically imports stores to avoid any static cycle; only
 * ever runs in backend mode.
 */
export async function hydrateForUser(userId: string): Promise<{ hasProfile: boolean }> {
  if (!isBackendConfigured()) return { hasProfile: false };
  const repo = await import('@/services/supabase/repo');
  const { useUserStore } = await import('@/store/userStore');
  const { useMealStore } = await import('@/store/mealStore');

  let [profile, serverMeals] = await Promise.all([
    repo.fetchProfile(userId),
    repo.fetchOwnMeals(userId),
  ]);

  if (!profile) {
    const local = useUserStore.getState().profile;
    if (local) {
      profile = { ...local, id: userId };
      await repo.upsertProfile(profile).catch(logSyncError('hydrate.adoptProfile'));
    }
  }
  if (profile) useUserStore.getState().adoptProfile(profile);

  const serverIds = new Set(serverMeals.map((meal) => meal.id));
  const localOnly = useMealStore
    .getState()
    .meals.filter((meal) => !serverIds.has(meal.id))
    .map((meal) => ({ ...meal, userId }));
  if (profile) {
    for (const meal of localOnly) {
      await insertMealWithPhoto(meal).catch(logSyncError('hydrate.pushLocalMeal'));
    }
  }

  const merged = [...localOnly, ...serverMeals].sort((a, b) =>
    a.loggedAt < b.loggedAt ? 1 : -1,
  );
  useMealStore.getState().replaceAll(merged);
  return { hasProfile: profile != null };
}
