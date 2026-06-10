import { create } from 'zustand';
import type { Comment, Meal, UserProfile } from '@/domain/types';
import { buildSeedMeals } from '@/services/seed/seedMeals';
import { buildSeedUsers, SEED_FOLLOWER_IDS } from '@/services/seed/seedUsers';
import { loadJson } from '@/services/storage';
import { createPersister } from './persist';
import { useMealStore } from './mealStore';

/**
 * Demo-user social graph — spec §F4. Seeded once at first run (stable IDs,
 * then persisted); interactions mutate the persisted copies directly.
 */

const STORE_NAME = 'social';

interface PersistedSocial {
  seeded: boolean;
  demoUsers: UserProfile[];
  demoMeals: Meal[];
  followingIds: string[];
  followerIds: string[];
}

interface SocialState extends PersistedSocial {
  hydrated: boolean;

  hydrate(): Promise<void>;
  /** No-op after first run. `anchor` is injectable for tests. */
  seedIfNeeded(anchor?: Date): void;
  follow(userId: string): void;
  unfollow(userId: string): void;
  isFollowing(userId: string): boolean;
  /** Routes to demo meals or the user's own meals automatically. */
  toggleOlive(mealId: string, byUserId: string): void;
  addComment(mealId: string, comment: Comment): void;
  /** Owner-moderation rules live in the caller (canDeleteComment below). */
  deleteComment(mealId: string, commentId: string): void;
  reset(): void;
}

export const useSocialStore = create<SocialState>()((set, get) => {
  const persist = createPersister<PersistedSocial>(STORE_NAME, () => {
    const { seeded, demoUsers, demoMeals, followingIds, followerIds } = get();
    return { seeded, demoUsers, demoMeals, followingIds, followerIds };
  });

  const mutateDemoMeal = (mealId: string, fn: (meal: Meal) => Meal): boolean => {
    const { demoMeals } = get();
    if (!demoMeals.some((meal) => meal.id === mealId)) return false;
    set({ demoMeals: demoMeals.map((meal) => (meal.id === mealId ? fn(meal) : meal)) });
    persist();
    return true;
  };

  return {
    seeded: false,
    demoUsers: [],
    demoMeals: [],
    followingIds: [],
    followerIds: [],
    hydrated: false,

    async hydrate() {
      const saved = await loadJson<PersistedSocial>(STORE_NAME);
      if (saved?.seeded) {
        set({ ...saved, hydrated: true });
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
        followerIds: [...SEED_FOLLOWER_IDS],
      });
      persist();
    },

    follow(userId) {
      const { followingIds } = get();
      if (followingIds.includes(userId)) return;
      set({ followingIds: [...followingIds, userId] });
      persist();
    },

    unfollow(userId) {
      set({ followingIds: get().followingIds.filter((id) => id !== userId) });
      persist();
    },

    isFollowing(userId) {
      return get().followingIds.includes(userId);
    },

    toggleOlive(mealId, byUserId) {
      const handled = mutateDemoMeal(mealId, (meal) => {
        const has = meal.oliveUserIds.includes(byUserId);
        return {
          ...meal,
          oliveUserIds: has
            ? meal.oliveUserIds.filter((id) => id !== byUserId)
            : [...meal.oliveUserIds, byUserId],
        };
      });
      if (!handled) useMealStore.getState().toggleOlive(mealId, byUserId);
    },

    addComment(mealId, comment) {
      const handled = mutateDemoMeal(mealId, (meal) => ({
        ...meal,
        comments: [...meal.comments, comment],
      }));
      if (!handled) useMealStore.getState().addComment(mealId, comment);
    },

    deleteComment(mealId, commentId) {
      const handled = mutateDemoMeal(mealId, (meal) => ({
        ...meal,
        comments: meal.comments.filter((c) => c.id !== commentId),
      }));
      if (!handled) useMealStore.getState().deleteComment(mealId, commentId);
    },

    reset() {
      set({
        seeded: false,
        demoUsers: [],
        demoMeals: [],
        followingIds: [],
        followerIds: [],
        hydrated: true,
      });
      persist();
    },
  };
});

/* ------------------------------ pure selectors ------------------------------ */

/** Social feed — spec §F4.2: followed users' public meals + own public meals, newest first. */
export function selectSocialFeed(args: {
  demoMeals: Meal[];
  ownMeals: Meal[];
  followingIds: string[];
  meId: string | undefined;
}): Meal[] {
  const followed = new Set(args.followingIds);
  const fromDemos = args.demoMeals.filter((meal) => followed.has(meal.userId) && !meal.isPrivate);
  const fromMe = args.meId ? args.ownMeals.filter((meal) => !meal.isPrivate) : [];
  return [...fromDemos, ...fromMe].sort(
    (a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime(),
  );
}

/** Discover — spec §F4.3: demo users not yet followed. */
export function selectDiscoverUsers(demoUsers: UserProfile[], followingIds: string[]): UserProfile[] {
  const followed = new Set(followingIds);
  return demoUsers.filter((user) => !followed.has(user.id));
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
