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

import HomeFeedScreen from '@/app/(tabs)/index';
import DiscoverScreen from '@/app/(tabs)/social';

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
    feed: [], discover: [], searchResults: [], knownUsers: {}, blockedIds: [],
  });
  useUserStore.getState().completeOnboarding({
    displayName: 'Tester', username: 'tester', avatarEmoji: '🫒', avatarColor: '#708238',
    goals: DEFAULT_GOALS, goalsAreDefault: true,
  });
});

describe('Home feed (spec §F3 — yours + friends)', () => {
  it('shows the empty state before any meals or follows', async () => {
    await render(<HomeFeedScreen />);
    expect(screen.getByText('Your plate awaits')).toBeTruthy();
  });

  it('reflects your day in the summary and lists your meals', async () => {
    const now = new Date();
    useMealStore.getState().addMeal(ownMeal(now, 't1'));

    await render(<HomeFeedScreen />);

    expect(screen.getByText('Salmon · Quinoa')).toBeTruthy();
    expect(screen.getByText(/· You/)).toBeTruthy();
    // 520 eaten of 2000 → 1480 remaining.
    expect(screen.getByLabelText('520 of 2000 calories eaten')).toBeTruthy();
    expect(screen.getByLabelText('1480 calories remaining')).toBeTruthy();
  });

  it('merges followed friends\' public meals into the home feed', async () => {
    useSocialStore.getState().seedIfNeeded(new Date());
    useSocialStore.getState().follow('demo_maya');
    useMealStore.getState().addMeal(ownMeal(new Date(), 'mine'));

    await render(<HomeFeedScreen />);

    // your meal + Maya's (she's followed) both present
    expect(screen.getByText('Salmon · Quinoa')).toBeTruthy();
    expect(screen.getAllByText('Maya Chen').length).toBeGreaterThan(0);
  });

  it('does NOT show meals from people you do not follow', async () => {
    useSocialStore.getState().seedIfNeeded(new Date());
    await render(<HomeFeedScreen />);
    expect(screen.queryByText('Maya Chen')).toBeNull();
  });

  it('shows your own private meals to yourself (it is your diary)', async () => {
    useMealStore.getState().addMeal({ ...ownMeal(new Date(), 'priv'), isPrivate: true, foodItems: ['Secret snack'] });
    await render(<HomeFeedScreen />);
    expect(screen.getByText('Secret snack')).toBeTruthy();
    expect(screen.getByLabelText('Private meal')).toBeTruthy();
  });
});

describe('Discover (spec §F4 — find & follow people)', () => {
  it('lists suggested people to follow', async () => {
    useSocialStore.getState().seedIfNeeded(new Date());
    await render(<DiscoverScreen />);
    expect(screen.getByText('Maya Chen')).toBeTruthy();
  });

  it('following someone removes them from the suggestions', async () => {
    useSocialStore.getState().seedIfNeeded(new Date());
    await render(<DiscoverScreen />);

    const before = screen.getAllByLabelText('Follow').length;
    expect(before).toBeGreaterThan(0);

    await fireEvent.press(screen.getAllByLabelText('Follow')[0]);

    expect(useSocialStore.getState().followingIds).toHaveLength(1);
    // the followed person drops out of the suggestion list
    expect(screen.getAllByLabelText('Follow').length).toBe(before - 1);
  });
});
