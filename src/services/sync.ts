import { isBackendConfigured } from '@/config';
import { isUuid } from '@/domain/ids';
import type { Comment, Meal, UserProfile } from '@/domain/types';
import { loadJson, saveJson } from '@/services/storage';
import type { MealEditPatch } from '@/store/mealStore';
import { useAuthStore } from '@/store/authStore';
import type { NotifPrefs } from '@/store/notificationStore';
import { showToast } from '@/store/toastStore';

/**
 * Write-through sync to the backend. Local Zustand stores stay the source of
 * truth / offline cache; when the user is signed in to a configured backend,
 * mutations are mirrored to Supabase. Everything is gated on `backendActive()`
 * and the Supabase modules are dynamically imported, so offline mode and the
 * test suite never touch the SDK.
 *
 * Failure model: transient failures (network, 5xx) are queued in a persisted
 * pending-op log and replayed on the next push / next launch, so an edit made
 * in a tunnel doesn't silently un-happen. Permanent failures (Postgres
 * constraint/RLS errors carry a SQLSTATE code) are dropped with a warning —
 * retrying them forever can never succeed. New-meal inserts are not queued:
 * `hydrateForUser`'s reconcile already re-pushes local-only meals.
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

/* ----------------------------- pending-op log ---------------------------- */

type PendingOp =
  | { kind: 'mealUpdate'; id: string; patch: MealEditPatch }
  | { kind: 'mealDelete'; meal: Meal }
  | { kind: 'photos'; meal: Meal }
  | { kind: 'olive'; mealId: string; userId: string; on: boolean }
  | { kind: 'comment'; mealId: string; comment: Comment }
  | { kind: 'commentDelete'; commentId: string }
  | { kind: 'follow'; followerId: string; followingId: string; on: boolean }
  | { kind: 'profile'; profile: UserProfile }
  | { kind: 'deviceToken'; token: string; platform: string }
  | { kind: 'deviceTokenRemove'; token: string }
  | { kind: 'notifPrefs'; prefs: NotifPrefs };

type QueuedOp = PendingOp & { attempts: number };

const OPS_STORE = 'sync-ops';
const MAX_ATTEMPTS = 10;

let pending: QueuedOp[] = [];
let pendingLoaded = false;

async function loadPending(): Promise<void> {
  if (pendingLoaded) return;
  pendingLoaded = true;
  pending = (await loadJson<QueuedOp[]>(OPS_STORE)) ?? [];
}

function persistPending(): void {
  void saveJson(OPS_STORE, pending);
}

export function pendingOpCount(): number {
  return pending.length;
}

/** Postgres/PostgREST errors carry a 5-char SQLSTATE — retrying can't help. */
function isPermanentError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code);
}

function enqueue(op: PendingOp): void {
  const wasEmpty = pending.length === 0;
  pending.push({ ...op, attempts: 0 });
  persistPending();
  if (wasEmpty) showToast('Saved on this device — will sync when online');
}

async function execute(op: PendingOp): Promise<void> {
  const repo = await import('@/services/supabase/repo');
  switch (op.kind) {
    case 'mealUpdate':
      return repo.updateMeal(op.id, op.patch);
    case 'mealDelete': {
      await repo.deleteMeal(op.meal.id);
      const photos = await import('@/services/supabase/photos');
      await photos.deleteMealPhotos(mealPhotoPaths(op.meal));
      return;
    }
    case 'photos':
      return uploadMealPhotos(op.meal);
    case 'olive':
      return repo.setOlive(op.mealId, op.userId, op.on);
    case 'follow':
      return op.on
        ? repo.follow(op.followerId, op.followingId)
        : repo.unfollow(op.followerId, op.followingId);
    case 'comment':
      return repo.insertComment(op.mealId, op.comment);
    case 'commentDelete':
      return repo.deleteComment(op.commentId);
    case 'profile':
      return repo.upsertProfile(op.profile);
    case 'deviceToken': {
      const uid = currentUserId();
      if (!uid) return;
      return repo.upsertDeviceToken(uid, op.token, op.platform);
    }
    case 'deviceTokenRemove': {
      const uid = currentUserId();
      if (!uid) return;
      return repo.deleteDeviceToken(uid, op.token);
    }
    case 'notifPrefs': {
      const uid = currentUserId();
      if (!uid) return;
      return repo.upsertNotificationPrefs(uid, op.prefs);
    }
  }
}

/** Drain the persisted log, re-queueing only retryable failures. Never throws. */
async function replayPending(): Promise<void> {
  if (pending.length === 0) return;
  const ops = pending;
  pending = [];
  for (const op of ops) {
    try {
      await execute(op);
    } catch (err) {
      logSyncError(`replay.${op.kind}`)(err);
      if (!isPermanentError(err) && op.attempts + 1 < MAX_ATTEMPTS) {
        pending.push({ ...op, attempts: op.attempts + 1 });
      }
    }
  }
  persistPending();
}

/* ------------------------------- push queue ------------------------------ */

/**
 * Pushes run through a single queue so they land in the order they were made
 * (a meal insert must not race the profile row it references).
 */
let queue: Promise<void> = Promise.resolve();

function run(op: PendingOp): void {
  if (!backendActive()) return;
  queue = queue
    .then(async () => {
      await loadPending();
      await replayPending();
      await execute(op);
    })
    .then(
      () => undefined,
      (err) => {
        logSyncError(op.kind)(err);
        if (!isPermanentError(err)) enqueue(op);
      },
    );
}

/** Test/await seam: resolves when every queued push so far has settled. */
export function flushSync(): Promise<void> {
  return queue;
}

/** Test seam: reset the module-level op log between tests. */
export function resetPendingForTests(): void {
  pending = [];
  pendingLoaded = false;
}

/* ------------------------------ photo mirror ----------------------------- */

/**
 * Mirror a meal's local photos to Storage, then write the permanent public
 * URLs back into the local store (no push-back) so the photos keep rendering
 * across reloads — local blob:/data: URIs on web die with the page.
 */
async function uploadMealPhotos(meal: Meal): Promise<void> {
  const localUris = (meal.photoUris ?? []).filter(isLocalUri);
  if (localUris.length === 0) return;

  const repo = await import('@/services/supabase/repo');
  const photos = await import('@/services/supabase/photos');
  const paths: string[] = [];
  for (const [index, uri] of localUris.entries()) {
    paths.push(await photos.uploadMealPhoto({ fileUri: uri }, meal.userId, meal.id, index));
  }
  await repo.setMealPhotoPaths(meal.id, paths);

  const { useMealStore } = await import('@/store/mealStore');
  useMealStore.getState().adoptPhotoUris(meal.id, paths.map(repo.publicPhotoUrl));
}

/** Every storage path a meal's photos may live at (indexed + legacy single). */
function mealPhotoPaths(meal: Meal): string[] {
  const indexed = (meal.photoUris ?? []).map((_, i) => `${meal.userId}/${meal.id}-${i}.jpg`);
  return [...indexed, `${meal.userId}/${meal.id}.jpg`];
}

/* ------------------------------ push helpers ----------------------------- */

export function pushNewMeal(meal: Meal): void {
  if (!backendActive()) return;
  queue = queue
    .then(async () => {
      await loadPending();
      await replayPending();
      // The meal row references the profile row (FK + RLS), so make sure the
      // profile exists even if its own push was lost — upsert is idempotent.
      const repo = await import('@/services/supabase/repo');
      const { useUserStore } = await import('@/store/userStore');
      const profile = useUserStore.getState().profile;
      if (profile) await repo.upsertProfile(profile).catch(logSyncError('ensureProfile'));
      await repo.insertMeal(meal);
      // Insert failures are healed by hydrate's reconcile; photo failures
      // after a successful insert are NOT — queue those for retry.
      try {
        await uploadMealPhotos(meal);
      } catch (err) {
        logSyncError('pushNewMeal.photos')(err);
        if (!isPermanentError(err)) enqueue({ kind: 'photos', meal });
      }
    })
    .then(() => undefined, logSyncError('pushNewMeal'));
}

export function pushMealUpdate(id: string, patch: MealEditPatch): void {
  run({ kind: 'mealUpdate', id, patch });
}

export function pushMealDelete(meal: Meal): void {
  run({ kind: 'mealDelete', meal });
}

export function pushOlive(mealId: string, userId: string, on: boolean): void {
  run({ kind: 'olive', mealId, userId, on });
}

export function pushFollow(followingId: string, on: boolean): void {
  const followerId = currentUserId();
  if (!followerId) return;
  run({ kind: 'follow', followerId, followingId, on });
}

export function pushComment(mealId: string, comment: Comment): void {
  run({ kind: 'comment', mealId, comment });
}

export function pushCommentDelete(commentId: string): void {
  run({ kind: 'commentDelete', commentId });
}

export function pushProfile(profile: UserProfile): void {
  run({ kind: 'profile', profile });
}

export function pushDeviceToken(token: string, platform: string): void {
  run({ kind: 'deviceToken', token, platform });
}

export function removeDeviceToken(token: string): void {
  run({ kind: 'deviceTokenRemove', token });
}

export function pushNotificationPrefs(prefs: NotifPrefs): void {
  run({ kind: 'notifPrefs', prefs });
}

/* ---------------------------- foreground refresh -------------------------- */

let lastOwnMealsRefresh = 0;

/**
 * Focused pull of the user's own meals (for server-created meals — e.g. logged
 * via the texting agent) merged into the local store. Deliberately NOT
 * `hydrateForUser`: no pending-op replay, no local-only re-push — just a fetch
 * + photo-preserving merge. Throttled to once a minute unless forced.
 */
export async function refreshOwnMeals(force = false): Promise<void> {
  if (!backendActive()) return;
  if (!force && Date.now() - lastOwnMealsRefresh < 60_000) return;
  lastOwnMealsRefresh = Date.now();
  const userId = currentUserId();
  if (!userId) return;
  try {
    const repo = await import('@/services/supabase/repo');
    const [serverMeals, deletedIds] = await Promise.all([
      repo.fetchOwnMeals(userId),
      repo.fetchDeletedMealIds(userId).catch(() => new Set<string>()),
    ]);
    const { useMealStore } = await import('@/store/mealStore');
    const localById = new Map(useMealStore.getState().meals.map((meal) => [meal.id, meal]));
    const serverIds = new Set(serverMeals.map((meal) => meal.id));
    // Keep local meals the server doesn't know yet (offline logs mid-push) —
    // unless they're tombstoned: deleted on another surface (e.g. by the
    // texting agent), so the local copy is a ghost, not an unsynced log.
    const localKept = [...localById.values()].filter(
      (meal) => !serverIds.has(meal.id) && !deletedIds.has(meal.id),
    );
    // Same photo-preserving reconcile as hydrate: a row whose photo upload is
    // still in flight must not clobber the local photos.
    const reconciled = serverMeals.map((server) => {
      const local = localById.get(server.id);
      return !server.photoUris?.length && local?.photoUris?.length
        ? { ...server, photoUris: local.photoUris }
        : server;
    });
    const merged = [...localKept, ...reconciled].sort((a, b) => (a.loggedAt < b.loggedAt ? 1 : -1));
    useMealStore.getState().replaceAll(merged);
  } catch (err) {
    logSyncError('refreshOwnMeals')(err);
  }
}

/** Test seam. */
export function resetRefreshThrottleForTests(): void {
  lastOwnMealsRefresh = 0;
}

/* -------------------------------- hydrate -------------------------------- */

/**
 * After sign-in, reconcile the server state with the local stores.
 *
 * - Pending ops replay FIRST, so offline edits/deletes land before the fetch —
 *   otherwise the fetch would restore the stale server version of a meal the
 *   user edited in a tunnel.
 * - Profile: a server profile wins. When the server has none but a local one
 *   exists (the device onboarded offline / before sign-in), the local profile
 *   is re-keyed to the authenticated user id and created server-side.
 * - Meals: NEVER blindly replace local with server. Local meals the server
 *   doesn't have are re-keyed to the authenticated user and pushed back; both
 *   sets are merged. A meal can resurrect after being deleted on another
 *   device — acceptable next to silently losing logged data.
 * - Cross-account guard: a cache keyed to a different server account is wiped,
 *   never adopted.
 */
export async function hydrateForUser(userId: string): Promise<{ hasProfile: boolean }> {
  if (!isBackendConfigured()) return { hasProfile: false };
  const repo = await import('@/services/supabase/repo');
  const { useUserStore } = await import('@/store/userStore');
  const { useMealStore } = await import('@/store/mealStore');

  const cached = useUserStore.getState().profile;
  if (cached && isUuid(cached.id) && cached.id !== userId) {
    useUserStore.getState().reset();
    useMealStore.getState().reset();
    pending = [];
    pendingLoaded = true;
    persistPending();
  }

  await loadPending();
  await replayPending();

  let [profile, serverMeals, deletedIds] = await Promise.all([
    repo.fetchProfile(userId),
    repo.fetchOwnMeals(userId),
    repo.fetchDeletedMealIds(userId).catch(() => new Set<string>()),
  ]);

  if (!profile) {
    const local = useUserStore.getState().profile;
    if (local) {
      profile = { ...local, id: userId };
      await repo.upsertProfile(profile).catch(logSyncError('hydrate.adoptProfile'));
    }
  }
  if (profile) useUserStore.getState().adoptProfile(profile);

  const localById = new Map(useMealStore.getState().meals.map((meal) => [meal.id, meal]));
  const serverIds = new Set(serverMeals.map((meal) => meal.id));
  // Tombstoned meals were deleted on another surface (agent/another device):
  // dropping the local copy is correct; re-pushing it would resurrect it (the
  // server blocks that insert anyway).
  const localOnly = [...localById.values()]
    .filter(
      (meal) =>
        !serverIds.has(meal.id) &&
        !deletedIds.has(meal.id) &&
        (!isUuid(meal.userId) || meal.userId === userId),
    )
    .map((meal) => ({ ...meal, userId }));

  // A meal whose row reached the server but whose photo upload didn't would
  // come back photo-less and clobber the local copy — keep the local photos
  // so the queued `photos` op can still mirror them.
  const reconciledServer = serverMeals.map((server) => {
    const local = localById.get(server.id);
    return !server.photoUris?.length && local?.photoUris?.length
      ? { ...server, photoUris: local.photoUris }
      : server;
  });

  const merged = [...localOnly, ...reconciledServer].sort((a, b) =>
    a.loggedAt < b.loggedAt ? 1 : -1,
  );
  // Replace BEFORE re-pushing: the photo upload writes permanent URLs back
  // into the store, which a later replaceAll would clobber.
  useMealStore.getState().replaceAll(merged);

  if (profile) {
    for (const meal of localOnly) {
      try {
        const repoMod = await import('@/services/supabase/repo');
        await repoMod.insertMeal(meal);
        await uploadMealPhotos(meal);
      } catch (err) {
        logSyncError('hydrate.pushLocalMeal')(err);
      }
    }
  }
  return { hasProfile: profile != null };
}
