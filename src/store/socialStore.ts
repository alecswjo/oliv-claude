import { create } from 'zustand';
import { isBackendConfigured } from '@/config';
import type { Comment, Meal, UserProfile } from '@/domain/types';
import { buildSeedMeals } from '@/services/seed/seedMeals';
import { buildSeedUsers, SEED_FOLLOWER_IDS } from '@/services/seed/seedUsers';
import { loadJson } from '@/services/storage';
import * as sync from '@/services/sync';
import { createPersister } from './persist';
import { useMealStore } from './mealStore';

/**
 * Social graph — spec §F4.
 * - Offline: a seeded demo graph (stable IDs, persisted), mutated locally.
 * - Backend: real users. `loadSocial` pulls the live feed + discover from
 *   Supabase; follow/olive/comment mirror to the backend via `sync`. Demo data
 *   is ignored when a backend is configured (the screens read the live fields).
 */

const STORE_NAME = 'social';

interface PersistedSocial {
  seeded: boolean;
  demoUsers: UserProfile[];
  demoMeals: Meal[];
  followingIds: string[];
  followerIds: string[];
  /** Users this account has blocked — their content is filtered everywhere. */
  blockedIds: string[];
}

interface SocialState extends PersistedSocial {
  hydrated: boolean;
  /** Backend-only live data (not persisted; refetched on demand). */
  feed: Meal[];
  discover: UserProfile[];
  searchResults: UserProfile[];
  knownUsers: Record<string, UserProfile>;

  hydrate(): Promise<void>;
  /** No-op after first run. `anchor` is injectable for tests. */
  seedIfNeeded(anchor?: Date): void;
  /** Backend: pull the live following set, feed, and discover suggestions. */
  loadSocial(): Promise<void>;
  searchUsers(query: string): Promise<void>;
  clearSearch(): void;
  follow(userId: string): void;
  unfollow(userId: string): void;
  isFollowing(userId: string): boolean;
  block(userId: string): void;
  unblock(userId: string): void;
  isBlocked(userId: string): boolean;
  /** Routes to demo meals, the live feed, or the user's own meals automatically. */
  toggleOlive(mealId: string, byUserId: string): void;
  addComment(mealId: string, comment: Comment): void;
  /** Owner-moderation rules live in the caller (canDeleteComment below). */
  deleteComment(mealId: string, commentId: string): void;
  reset(): void;
}

/** Add/remove a user's olive on a meal. */
function withOliveToggled(meal: Meal, userId: string): Meal {
  const has = meal.oliveUserIds.includes(userId);
  return {
    ...meal,
    oliveUserIds: has
      ? meal.oliveUserIds.filter((id) => id !== userId)
      : [...meal.oliveUserIds, userId],
  };
}

export const useSocialStore = create<SocialState>()((set, get) => {
  const persist = createPersister<PersistedSocial>(STORE_NAME, () => {
    const { seeded, demoUsers, demoMeals, followingIds, followerIds, blockedIds } = get();
    return { seeded, demoUsers, demoMeals, followingIds, followerIds, blockedIds };
  });

  const mutateDemoMeal = (mealId: string, fn: (meal: Meal) => Meal): boolean => {
    const { demoMeals } = get();
    if (!demoMeals.some((meal) => meal.id === mealId)) return false;
    set({ demoMeals: demoMeals.map((meal) => (meal.id === mealId ? fn(meal) : meal)) });
    persist();
    return true;
  };

  // Live feed meals (backend others' posts) live outside the persisted demo set;
  // mutate them in place for optimistic olive/comment UX (not persisted).
  const mutateFeedMeal = (mealId: string, fn: (meal: Meal) => Meal): boolean => {
    const { feed } = get();
    if (!feed.some((meal) => meal.id === mealId)) return false;
    set({ feed: feed.map((meal) => (meal.id === mealId ? fn(meal) : meal)) });
    return true;
  };

  return {
    seeded: false,
    demoUsers: [],
    demoMeals: [],
    followingIds: [],
    followerIds: [],
    blockedIds: [],
    hydrated: false,
    feed: [],
    discover: [],
    searchResults: [],
    knownUsers: {},

    async hydrate() {
      const saved = await loadJson<PersistedSocial>(STORE_NAME);
      if (saved?.seeded) {
        set({ ...saved, blockedIds: saved.blockedIds ?? [], hydrated: true });
      } else {
        set({ hydrated: true });
      }
    },

    seedIfNeeded(anchor = new Date()) {
      if (get().seeded) return;
      set({
        seeded: true,
        demoUsers: buildSeedUsers(anchor.toISOString()),
        demoMeals: buildSeedMeals(anchor),
        followingIds: [],
        // Baseline demo followers only make sense in the local demo experience;
        // with a real backend the user's follower count must be honest (zero).
        followerIds: isBackendConfigured() ? [] : [...SEED_FOLLOWER_IDS],
        blockedIds: [],
      });
      persist();
    },

    async loadSocial() {
      if (!sync.backendActive()) return;
      const me = sync.currentUserId();
      if (!me) return;
      const repo = await import('@/services/supabase/repo');
      try {
        const followingIds = await repo.fetchFollowingIds(me);
        const [feed, discover, followed] = await Promise.all([
          repo.fetchFeed(followingIds),
          repo.fetchDiscover([me, ...followingIds, ...get().blockedIds]),
          repo.fetchProfilesByIds(followingIds),
        ]);
        const knownUsers = { ...get().knownUsers };
        for (const user of [...discover, ...followed]) knownUsers[user.id] = user;
        set({ followingIds, feed, discover, knownUsers });
        persist();
      } catch {
        // Best-effort: a failed refresh keeps the last-known state (offline-first).
      }
    },

    async searchUsers(query) {
      if (!sync.backendActive()) return;
      const me = sync.currentUserId();
      if (!me) return;
      const repo = await import('@/services/supabase/repo');
      try {
        const results = await repo.searchProfiles(query, me);
        const knownUsers = { ...get().knownUsers };
        for (const user of results) knownUsers[user.id] = user;
        set({ searchResults: results, knownUsers });
      } catch {
        set({ searchResults: [] });
      }
    },

    clearSearch() {
      set({ searchResults: [] });
    },

    follow(userId) {
      const { followingIds } = get();
      if (followingIds.includes(userId)) return;
      set({ followingIds: [...followingIds, userId] });
      persist();
      if (sync.backendActive()) {
        sync.pushFollow(userId, true);
        void sync.flushSync().then(() => get().loadSocial());
      }
    },

    unfollow(userId) {
      set({ followingIds: get().followingIds.filter((id) => id !== userId) });
      persist();
      if (sync.backendActive()) {
        sync.pushFollow(userId, false);
        void sync.flushSync().then(() => get().loadSocial());
      }
    },

    isFollowing(userId) {
      return get().followingIds.includes(userId);
    },

    block(userId) {
      const { blockedIds, followingIds } = get();
      if (blockedIds.includes(userId)) return;
      // Blocking also unfollows — their content disappears immediately.
      set({
        blockedIds: [...blockedIds, userId],
        followingIds: followingIds.filter((id) => id !== userId),
      });
      persist();
    },

    unblock(userId) {
      set({ blockedIds: get().blockedIds.filter((id) => id !== userId) });
      persist();
    },

    isBlocked(userId) {
      return get().blockedIds.includes(userId);
    },

    toggleOlive(mealId, byUserId) {
      if (mutateDemoMeal(mealId, (meal) => withOliveToggled(meal, byUserId))) return;
      // Live feed meal (someone else's post on the backend): optimistic + mirror.
      const fed = get().feed.find((meal) => meal.id === mealId);
      if (fed) {
        const nowActive = !fed.oliveUserIds.includes(byUserId);
        mutateFeedMeal(mealId, (meal) => withOliveToggled(meal, byUserId));
        sync.pushOlive(mealId, byUserId, nowActive);
        return;
      }
      useMealStore.getState().toggleOlive(mealId, byUserId);
    },

    addComment(mealId, comment) {
      if (mutateDemoMeal(mealId, (meal) => ({ ...meal, comments: [...meal.comments, comment] }))) return;
      if (mutateFeedMeal(mealId, (meal) => ({ ...meal, comments: [...meal.comments, comment] }))) {
        sync.pushComment(mealId, comment);
        return;
      }
      useMealStore.getState().addComment(mealId, comment);
    },

    deleteComment(mealId, commentId) {
      const remove = (meal: Meal): Meal => ({
        ...meal,
        comments: meal.comments.filter((c) => c.id !== commentId),
      });
      if (mutateDemoMeal(mealId, remove)) return;
      if (mutateFeedMeal(mealId, remove)) {
        sync.pushCommentDelete(commentId);
        return;
      }
      useMealStore.getState().deleteComment(mealId, commentId);
    },

    reset() {
      set({
        seeded: false,
        demoUsers: [],
        demoMeals: [],
        followingIds: [],
        followerIds: [],
        blockedIds: [],
        hydrated: true,
        feed: [],
        discover: [],
        searchResults: [],
        knownUsers: {},
      });
      persist();
    },
  };
});

/* ------------------------------ pure selectors ------------------------------ */

/**
 * Home feed: ALL your own meals (private included — it's your diary) merged with
 * the public meals of people you follow, newest first. `friendMeals` is the live
 * backend feed when configured, else the demo meal pool.
 */
export function selectHomeFeed(args: {
  friendMeals: Meal[];
  ownMeals: Meal[];
  followingIds: string[];
  meId: string | undefined;
  blockedIds?: string[];
}): Meal[] {
  const followed = new Set(args.followingIds);
  const blocked = new Set(args.blockedIds ?? []);
  const friends = args.friendMeals.filter(
    (meal) =>
      meal.userId !== args.meId &&
      followed.has(meal.userId) &&
      !meal.isPrivate &&
      !blocked.has(meal.userId),
  );
  return [...args.ownMeals, ...friends].sort(
    (a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime(),
  );
}

/** Social feed — spec §F4.2: followed users' public meals + own public meals, newest first. */
export function selectSocialFeed(args: {
  demoMeals: Meal[];
  ownMeals: Meal[];
  followingIds: string[];
  meId: string | undefined;
  blockedIds?: string[];
}): Meal[] {
  const followed = new Set(args.followingIds);
  const blocked = new Set(args.blockedIds ?? []);
  const fromDemos = args.demoMeals.filter(
    (meal) => followed.has(meal.userId) && !meal.isPrivate && !blocked.has(meal.userId),
  );
  const fromMe = args.meId ? args.ownMeals.filter((meal) => !meal.isPrivate) : [];
  return [...fromDemos, ...fromMe].sort(
    (a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime(),
  );
}

/** Discover — spec §F4.3: demo users not yet followed (or blocked). */
export function selectDiscoverUsers(
  demoUsers: UserProfile[],
  followingIds: string[],
  blockedIds: string[] = [],
): UserProfile[] {
  const followed = new Set(followingIds);
  const blocked = new Set(blockedIds);
  return demoUsers.filter((user) => !followed.has(user.id) && !blocked.has(user.id));
}

/** Follower/following counts — spec §F4.6. */
export function followCountsFor(
  user: UserProfile,
  state: { followingIds: string[]; followerIds: string[] },
): { followers: number; following: number } {
  if (user.isDemo) {
    return {
      followers: (user.baselineFollowers ?? 0) + (state.followingIds.includes(user.id) ? 1 : 0),
      following: user.baselineFollowing ?? 0,
    };
  }
  return { followers: state.followerIds.length, following: state.followingIds.length };
}

/** Comment moderation — spec §F4.5: own comments anywhere, any comment on own meal. */
export function canDeleteComment(args: {
  comment: Comment;
  mealOwnerId: string;
  meId: string | undefined;
}): boolean {
  if (!args.meId) return false;
  return args.comment.userId === args.meId || args.mealOwnerId === args.meId;
}
