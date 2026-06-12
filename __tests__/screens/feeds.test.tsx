import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { computeHealthScore } from '@/domain/healthScore';
import type { Meal, MealAnalysis } from '@/domain/types';
import { DEFAULT_GOALS } from '@/domain/types';
import { useMealStore } from '@/store/mealStore';
import { useSocialStore } from '@/store/socialStore';
import { useUserStore } from '@/store/userStore';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ canGoBack: () => true, push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

import MyFeedScreen from '@/app/(tabs)/index';
import SocialScreen from '@/app/(tabs)/social';

const ANALYSIS: MealAnalysis = {
  calories: 520, proteinG: 42, carbsG: 38, fatG: 21,
  fiberG: 8, sugarG: 5, sodiumMg: 380, saturatedFatG: 4,
  fruitVegServings: 2.5, processingLevel: 1, confidence: 'high',
  foodItems: ['Salmon', 'Quinoa'],
};

function ownMeal(loggedAt: Date, id: string): Meal {
  return {
    id,
    userId: useUserStore.getState().profile!.id,
    description: 'salmon dinner',
    mealType: 'dinner',
    loggedAt: loggedAt.toISOString(),
    nutrition: {
      calories: ANALYSIS.calories, proteinG: ANALYSIS.proteinG, carbsG: ANALYSIS.carbsG,
      fatG: ANALYSIS.fatG, fiberG: ANALYSIS.fiberG, sugarG: ANALYSIS.sugarG,
      sodiumMg: ANALYSIS.sodiumMg, saturatedFatG: ANALYSIS.saturatedFatG,
    },
    foodItems: ANALYSIS.foodItems,
    fruitVegServings: ANALYSIS.fruitVegServings,
    processingLevel: ANALYSIS.processingLevel,
    confidence: 'high',
    healthScore: computeHealthScore(ANALYSIS),
    source: 'ai',
    isPrivate: false,
    oliveUserIds: [],
    comments: [],
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  useMealStore.setState({ meals: [], hydrated: true });
  useUserStore.setState({ profile: null, hydrated: true });
  useSocialStore.setState({
    seeded: false, demoUsers: [], demoMeals: [],
    followingIds: [], followerIds: [], hydrated: true,
  });
  useUserStore.getState().completeOnboarding({
    displayName: 'Tester', username: 'tester', avatarEmoji: '🫒', avatarColor: '#708238',
    goals: DEFAULT_GOALS, goalsAreDefault: true,
  });
});

describe('My Feed (spec §F3 / §13.5)', () => {
  it('shows the empty state before any meals', async () => {
    await render(<MyFeedScreen />);
    expect(screen.getByText('Your plate awaits')).toBeTruthy();
  });

  it('groups meals under Today/Yesterday and reflects totals in the summary', async () => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    useMealStore.getState().addMeal(ownMeal(yesterday, 'y1'));
    useMealStore.getState().addMeal(ownMeal(now, 't1'));

    await render(<MyFeedScreen />);

    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('Yesterday')).toBeTruthy();
    expect(screen.getAllByText('Salmon · Quinoa')).toHaveLength(2);

    // Summary counts only today: 520 eaten of 2000 → 1480 remaining, 2-day streak.
    expect(screen.getByLabelText('520 of 2000 calories eaten')).toBeTruthy();
    expect(screen.getByLabelText('1480 calories remaining')).toBeTruthy();
    expect(screen.getByLabelText('2 day streak')).toBeTruthy();
  });
});

describe('Social feed & discover (spec §F4 / §13.6)', () => {
  it('follow in Discover moves their meals into the Following feed', async () => {
    useSocialStore.getState().seedIfNeeded(new Date());

    await render(<SocialScreen />);

    // Empty following feed initially
    expect(screen.getByText('Nothing here yet')).toBeTruthy();

    // Discover lists all 10 demo users
    await fireEvent.press(screen.getByText('Discover'));
    expect(screen.getByText('Maya Chen')).toBeTruthy();

    // Follow Maya
    await fireEvent.press(screen.getAllByLabelText('Follow')[0]);
    // She leaves the discover list
    expect(screen.queryByText('Maya Chen')).toBeNull();

    // Her meals are now in the feed with her as author
    await fireEvent.press(screen.getByText('Following'));
    expect(screen.getAllByText('Maya Chen').length).toBeGreaterThan(0);
  });

  it('unfollow removes their meals from the feed', async () => {
    useSocialStore.getState().seedIfNeeded(new Date());
    useSocialStore.getState().follow('demo_maya');

    await render(<SocialScreen />);
    expect(screen.getAllByText('Maya Chen').length).toBeGreaterThan(0);

    useSocialStore.getState().unfollow('demo_maya');
    await render(<SocialScreen />);
    expect(screen.getByText('Nothing here yet')).toBeTruthy();
  });

  it("includes the user's own public meals with a You marker, but never private ones", async () => {
    useSocialStore.getState().seedIfNeeded(new Date());
    const now = new Date();
    useMealStore.getState().addMeal(ownMeal(now, 'pub'));
    useMealStore.getState().addMeal({ ...ownMeal(now, 'priv'), isPrivate: true, foodItems: ['Secret snack'] });

    await render(<SocialScreen />);

    expect(screen.getByText('Salmon · Quinoa')).toBeTruthy();
    expect(screen.getByText(/· You/)).toBeTruthy();
    expect(screen.queryByText('Secret snack')).toBeNull(); // spec F4.7
  });
});
