import { create } from 'zustand';
import { newId } from '@/domain/ids';
import type { BodyProfile, Goals, UserProfile } from '@/domain/types';
import { DEFAULT_GOALS } from '@/domain/types';
import { loadJson } from '@/services/storage';
import { createPersister } from './persist';

/** Current-user profile & onboarding state — spec §F1. */

const STORE_NAME = 'user';

interface PersistedUser {
  profile: UserProfile | null;
}

interface UserState {
  profile: UserProfile | null;
  hydrated: boolean;

  hydrate(): Promise<void>;
  completeOnboarding(input: {
    displayName: string;
    username: string;
    avatarEmoji: string;
    avatarColor: string;
    goals: Goals;
    goalsAreDefault: boolean;
    body?: BodyProfile;
  }): void;
  updateProfile(patch: Partial<Pick<UserProfile, 'displayName' | 'bio' | 'avatarEmoji' | 'avatarColor' | 'defaultPrivate'>>): void;
  setGoals(goals: Goals, goalsAreDefault: boolean): void;
  setBody(body: BodyProfile): void;
  setLongestStreak(value: number): void;
  reset(): void;
}

export const useUserStore = create<UserState>()((set, get) => {
  const persist = createPersister<PersistedUser>(STORE_NAME, () => ({
    profile: get().profile,
  }));

  return {
    profile: null,
    hydrated: false,

    async hydrate() {
      const saved = await loadJson<PersistedUser>(STORE_NAME);
      set({ profile: saved?.profile ?? null, hydrated: true });
    },

    completeOnboarding(input) {
      const profile: UserProfile = {
        id: newId('user'),
        username: input.username,
        displayName: input.displayName,
        avatarEmoji: input.avatarEmoji,
        avatarColor: input.avatarColor,
        bio: '',
        joinedAt: new Date().toISOString(),
        goals: input.goals,
        goalsAreDefault: input.goalsAreDefault,
        body: input.body,
        defaultPrivate: false,
        longestStreak: 0,
        isDemo: false,
      };
      set({ profile });
      persist();
    },

    updateProfile(patch) {
      const profile = get().profile;
      if (!profile) return;
      set({ profile: { ...profile, ...patch } });
      persist();
    },

    setGoals(goals, goalsAreDefault) {
      const profile = get().profile;
      if (!profile) return;
      set({ profile: { ...profile, goals, goalsAreDefault } });
      persist();
    },

    setBody(body) {
      const profile = get().profile;
      if (!profile) return;
      set({ profile: { ...profile, body } });
      persist();
    },

    setLongestStreak(value) {
      const profile = get().profile;
      if (!profile || profile.longestStreak === value) return;
      set({ profile: { ...profile, longestStreak: value } });
      persist();
    },

    reset() {
      set({ profile: null, hydrated: true });
      persist();
    },
  };
});

export { DEFAULT_GOALS };
