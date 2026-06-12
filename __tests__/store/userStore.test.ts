import AsyncStorage from '@react-native-async-storage/async-storage';
import { computeGoals } from '@/domain/goals';
import { DEFAULT_GOALS } from '@/domain/types';
import { flushPersistence } from '@/store/persist';
import { useUserStore } from '@/store/userStore';
import { hydrateAll, resetAllStores, useAppStore } from '@/store/appStore';
import { useMealStore } from '@/store/mealStore';
import { useSocialStore } from '@/store/socialStore';

beforeEach(async () => {
  await AsyncStorage.clear();
  useUserStore.setState({ profile: null, hydrated: false });
  useMealStore.setState({ meals: [], hydrated: false });
  useSocialStore.setState({
    seeded: false, demoUsers: [], demoMeals: [],
    followingIds: [], followerIds: [], hydrated: false,
  });
  useAppStore.setState({ units: 'metric', hydrated: false });
});

describe('userStore onboarding', () => {
  it('creates a profile with computed goals', () => {
    const body = {
      sex: 'male' as const, age: 32, heightCm: 180, weightKg: 84,
      activity: 'moderate' as const, goal: 'gain' as const,
    };
    useUserStore.getState().completeOnboarding({
      displayName: 'Jake', username: 'jake_t', avatarEmoji: '🍗', avatarColor: '#C96F4A',
      goals: computeGoals(body), goalsAreDefault: false, body,
    });

    const profile = useUserStore.getState().profile!;
    expect(profile.username).toBe('jake_t');
    expect(profile.goals.dailyCalories).toBe(3106); // spec §F1.4 reference vector
    expect(profile.goals.proteinG).toBe(155);
    expect(profile.goals.fatG).toBe(95);
    expect(profile.goals.carbsG).toBe(408);
    expect(profile.goalsAreDefault).toBe(false);
    expect(profile.isDemo).toBe(false);
  });

  it('skip flow uses spec defaults and flags them', () => {
    useUserStore.getState().completeOnboarding({
      displayName: 'Quick', username: 'quick', avatarEmoji: '🫒', avatarColor: '#708238',
      goals: DEFAULT_GOALS, goalsAreDefault: true,
    });
    const profile = useUserStore.getState().profile!;
    expect(profile.goals).toEqual({ dailyCalories: 2000, proteinG: 100, carbsG: 263, fatG: 61 });
    expect(profile.goalsAreDefault).toBe(true);
  });

  it('persists across hydration', async () => {
    useUserStore.getState().completeOnboarding({
      displayName: 'P', username: 'p', avatarEmoji: '🫒', avatarColor: '#708238',
      goals: DEFAULT_GOALS, goalsAreDefault: true,
    });
    await flushPersistence();
    useUserStore.setState({ profile: null, hydrated: false });
    await useUserStore.getState().hydrate();
    expect(useUserStore.getState().profile?.username).toBe('p');
  });

  it('updates profile fields and goals', () => {
    useUserStore.getState().completeOnboarding({
      displayName: 'P', username: 'p', avatarEmoji: '🫒', avatarColor: '#708238',
      goals: DEFAULT_GOALS, goalsAreDefault: true,
    });
    useUserStore.getState().updateProfile({ bio: 'hello', defaultPrivate: true });
    useUserStore.getState().setGoals({ dailyCalories: 2200, proteinG: 140, carbsG: 220, fatG: 70 }, false);

    const profile = useUserStore.getState().profile!;
    expect(profile.bio).toBe('hello');
    expect(profile.defaultPrivate).toBe(true);
    expect(profile.goals.dailyCalories).toBe(2200);
    expect(profile.goalsAreDefault).toBe(false);
  });
});

describe('hydrateAll / resetAllStores', () => {
  it('hydrates every store and seeds social content', async () => {
    await hydrateAll();
    expect(useAppStore.getState().hydrated).toBe(true);
    expect(useUserStore.getState().hydrated).toBe(true);
    expect(useMealStore.getState().hydrated).toBe(true);
    expect(useSocialStore.getState().seeded).toBe(true);
    expect(useSocialStore.getState().demoUsers).toHaveLength(10);
  });

  it('reset clears profile, meals, and social state', async () => {
    await hydrateAll();
    useUserStore.getState().completeOnboarding({
      displayName: 'P', username: 'p', avatarEmoji: '🫒', avatarColor: '#708238',
      goals: DEFAULT_GOALS, goalsAreDefault: true,
    });
    resetAllStores();
    expect(useUserStore.getState().profile).toBeNull();
    expect(useMealStore.getState().meals).toEqual([]);
    // Reset re-seeds demo content immediately so Social isn't empty until restart.
    expect(useSocialStore.getState().seeded).toBe(true);
    expect(useSocialStore.getState().demoUsers).toHaveLength(10);
    expect(useSocialStore.getState().followingIds).toEqual([]);
  });
});

describe('appStore settings', () => {
  it('persists units', async () => {
    useAppStore.getState().setUnits('imperial');
    await flushPersistence();
    useAppStore.setState({ units: 'metric', hydrated: false });
    await useAppStore.getState().hydrate();
    expect(useAppStore.getState().units).toBe('imperial');
  });
});
