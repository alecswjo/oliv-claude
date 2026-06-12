import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import { computeHealthScore } from '@/domain/healthScore';
import type { Meal, MealAnalysis } from '@/domain/types';
import { DEFAULT_GOALS } from '@/domain/types';
import { useMealStore } from '@/store/mealStore';
import { useSocialStore } from '@/store/socialStore';
import { useUserStore } from '@/store/userStore';

let mockMealId = 'own1';
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: jest.fn(), canGoBack: jest.fn(() => true) }),
  useLocalSearchParams: () => ({ id: mockMealId }),
  Stack: { Screen: () => null },
}));

jest.mock('@/services/photos', () => ({
  preparePhotoForAnalysis: jest.fn(),
  persistPhotos: jest.fn(),
  deletePhotos: jest.fn(),
}));

import MealDetailScreen from '@/app/meal/[id]';

const ANALYSIS: MealAnalysis = {
  calories: 430, proteinG: 35, carbsG: 18, fatG: 24,
  fiberG: 4, sugarG: 3, sodiumMg: 740, saturatedFatG: 6,
  fruitVegServings: 1.5, processingLevel: 2, confidence: 'high',
  foodItems: ['Chicken caesar'],
};

function ownMeal(): Meal {
  return {
    id: 'own1',
    userId: useUserStore.getState().profile!.id,
    description: 'big caesar',
    mealType: 'lunch',
    loggedAt: new Date().toISOString(),
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
  mockMealId = 'own1';
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
  useSocialStore.getState().seedIfNeeded(new Date());
});

describe('Meal detail (spec §F4.4/F4.5/F2.8)', () => {
  it('renders nutrition, score breakdown, and author', async () => {
    useMealStore.getState().addMeal(ownMeal());
    await render(<MealDetailScreen />);

    expect(screen.getByText('Chicken caesar')).toBeTruthy();
    expect(screen.getByText('430 kcal')).toBeTruthy();
    expect(screen.getByText('Why this score')).toBeTruthy();
    expect(screen.getByText('Excellent protein')).toBeTruthy();
    expect(screen.getByLabelText('Health score 4 out of 5')).toBeTruthy();
  });

  it('adds a comment through the composer and persists it to the store', async () => {
    useMealStore.getState().addMeal(ownMeal());
    await render(<MealDetailScreen />);

    await fireEvent.changeText(screen.getByLabelText('Add a comment…'), 'Solid lunch choice');
    await fireEvent.press(screen.getByLabelText('Post'));

    expect(screen.getByText('Solid lunch choice')).toBeTruthy();
    expect(useMealStore.getState().meals[0].comments).toHaveLength(1);
    expect(useMealStore.getState().meals[0].comments[0].text).toBe('Solid lunch choice');
  });

  it('lets the owner delete comments on their own meal (moderation, spec F4.5)', async () => {
    const meal = ownMeal();
    meal.comments = [
      { id: 'c1', userId: 'demo_maya', text: 'looks amazing', createdAt: new Date().toISOString() },
    ];
    useMealStore.getState().addMeal(meal);
    await render(<MealDetailScreen />);

    expect(screen.getByText('looks amazing')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Delete comment'));
    expect(useMealStore.getState().meals[0].comments).toHaveLength(0);
  });

  it('toggles olives on the meal', async () => {
    useMealStore.getState().addMeal(ownMeal());
    await render(<MealDetailScreen />);

    await fireEvent.press(screen.getByLabelText('Give an olive'));
    expect(useMealStore.getState().meals[0].oliveUserIds).toHaveLength(1);
  });

  it('edits nutrition inline, recomputes the score, and flips source to ai-adjusted', async () => {
    useMealStore.getState().addMeal(ownMeal());
    await render(<MealDetailScreen />);

    await fireEvent.press(screen.getByLabelText('Edit'));
    await fireEvent.changeText(screen.getByLabelText('Calories'), '1300');
    await fireEvent.changeText(screen.getByLabelText('Protein (g)'), '20');
    await fireEvent.press(screen.getByLabelText('Save changes'));

    const updated = useMealStore.getState().meals[0];
    expect(updated.nutrition.calories).toBe(1300);
    expect(updated.source).toBe('ai-adjusted');
    // Rescaled protein keeps +0.5, level 2 +0.15, produce +0.25, calorie bomb −0.4 → 3.5
    expect(updated.healthScore.value).toBe(3.5);
    expect(updated.healthScore.value).not.toBe(ownMeal().healthScore.value);
  });

  it('toggles privacy from the detail screen', async () => {
    useMealStore.getState().addMeal(ownMeal());
    await render(<MealDetailScreen />);

    await fireEvent(screen.getByLabelText('Private meal'), 'valueChange', true);
    expect(useMealStore.getState().meals[0].isPrivate).toBe(true);
  });

  it('deletes the meal after confirmation and navigates back', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.style === 'destructive')?.onPress?.();
    });
    useMealStore.getState().addMeal(ownMeal());
    await render(<MealDetailScreen />);

    await fireEvent.press(screen.getByLabelText('Delete meal'));

    expect(alertSpy).toHaveBeenCalled();
    expect(useMealStore.getState().meals).toHaveLength(0);
    expect(mockBack).toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('renders demo meals read-only (no edit/delete affordances)', async () => {
    const demoMeal = useSocialStore.getState().demoMeals[0];
    mockMealId = demoMeal.id;
    await render(<MealDetailScreen />);

    expect(screen.queryByLabelText('Edit')).toBeNull();
    expect(screen.queryByLabelText('Delete meal')).toBeNull();
  });

  it('shows a not-found state for unknown ids', async () => {
    mockMealId = 'nope';
    await render(<MealDetailScreen />);
    expect(screen.getByText('Meal not found')).toBeTruthy();
  });
});
