import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { DEFAULT_GOALS } from '@/domain/types';
import { useMealStore } from '@/store/mealStore';
import { useUserStore } from '@/store/userStore';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: mockReplace, canGoBack: mockCanGoBack }),
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: false })),
}));

jest.mock('@/services/photos', () => ({
  preparePhotoForAnalysis: jest.fn(),
  persistPhotos: jest.fn((photos: { uri: string }[]) => photos.map((p) => p.uri)),
  deletePhotos: jest.fn(),
}));

import LogMealScreen from '@/app/log';

function seedProfile() {
  useUserStore.getState().completeOnboarding({
    displayName: 'Tester', username: 'tester', avatarEmoji: '🫒', avatarColor: '#708238',
    goals: DEFAULT_GOALS, goalsAreDefault: true,
  });
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  useMealStore.setState({ meals: [], hydrated: true });
  useUserStore.setState({ profile: null, hydrated: true });
  seedProfile();
});

describe('Log meal flow (spec J2 / §13.2)', () => {
  it('analyzes a described meal offline and saves it with a computed score', async () => {
    await render(<LogMealScreen />);

    await fireEvent.changeText(
      screen.getByLabelText('What did you eat?'),
      'grilled chicken with brown rice and broccoli',
    );
    await fireEvent.press(screen.getByLabelText('Analyze'));

    // Review phase — estimator result (no API key configured)
    expect(await screen.findByText(/Offline estimate · medium confidence/)).toBeTruthy();
    expect(screen.getByDisplayValue('550')).toBeTruthy(); // summed lexicon calories
    expect(screen.getByDisplayValue('Grilled chicken, Brown rice, Broccoli')).toBeTruthy();
    expect(screen.getByLabelText('Health score 4.7 out of 5')).toBeTruthy();
    expect(screen.getByText('Excellent protein')).toBeTruthy(); // breakdown row

    await fireEvent.press(screen.getByLabelText('Save meal'));

    const meals = useMealStore.getState().meals;
    expect(meals).toHaveLength(1);
    expect(meals[0].nutrition.calories).toBe(550);
    expect(meals[0].foodItems).toEqual(['Grilled chicken', 'Brown rice', 'Broccoli']);
    expect(meals[0].healthScore.value).toBe(4.7);
    expect(meals[0].source).toBe('ai');
    // New accounts default private (agent spec §7) — meals stay off the feed
    // until the user flips "Private by default" off or shares explicitly.
    expect(meals[0].isPrivate).toBe(true);
    expect(mockBack).toHaveBeenCalled();
  });

  it('recomputes the score live when the user edits the estimate, and marks it ai-adjusted', async () => {
    await render(<LogMealScreen />);

    await fireEvent.changeText(screen.getByLabelText('What did you eat?'), 'donut');
    await fireEvent.press(screen.getByLabelText('Analyze'));
    await screen.findByText(/Offline estimate/);

    // Donut alone: ultra-processed (−0.9), sugary (−0.6), fatty (−0.35) → 1.15 → 1.0
    expect(screen.getByLabelText('Health score 1.2 out of 5')).toBeTruthy();

    // User corrects it: actually it was a high-protein yogurt bowl
    await fireEvent.changeText(screen.getByLabelText('Calories'), '300');
    await fireEvent.changeText(screen.getByLabelText('Protein (g)'), '30');
    await fireEvent.changeText(screen.getByLabelText('Sugar (g)'), '5');
    await fireEvent.changeText(screen.getByLabelText('Carbs (g)'), '25');
    await fireEvent.changeText(screen.getByLabelText('Fat (g)'), '8');
    await fireEvent.press(screen.getByLabelText('1 · Whole'));

    await fireEvent.press(screen.getByLabelText('Save meal'));

    const meal = useMealStore.getState().meals[0];
    expect(meal.source).toBe('ai-adjusted');
    expect(meal.nutrition.calories).toBe(300);
    expect(meal.processingLevel).toBe(1);
    // protein share 30*4/300 = 0.4 → +0.8; level 1 → +0.4 → a big jump from the donut's 1.2
    expect(meal.healthScore.value).toBeGreaterThanOrEqual(3.5);
  });

  it('blocks analysis with no photo and no description', async () => {
    await render(<LogMealScreen />);
    await fireEvent.press(screen.getByLabelText('Analyze'));
    expect(screen.getByText('Add a photo or describe your meal first.')).toBeTruthy();
    expect(useMealStore.getState().meals).toHaveLength(0);
  });

  it('supports fully manual entry with source manual and hidden confidence', async () => {
    await render(<LogMealScreen />);
    await fireEvent.press(screen.getByLabelText('Enter manually instead'));

    expect(screen.getByText('Manual entry')).toBeTruthy();
    expect(screen.queryByText(/confidence/)).toBeNull();

    await fireEvent.changeText(screen.getByLabelText('Food items (comma separated)'), 'leftover pasta');
    await fireEvent.changeText(screen.getByLabelText('Calories'), '450');
    await fireEvent.changeText(screen.getByLabelText('Carbs (g)'), '70');
    await fireEvent.changeText(screen.getByLabelText('Protein (g)'), '15');
    await fireEvent.changeText(screen.getByLabelText('Fat (g)'), '12');
    await fireEvent.press(screen.getByLabelText('Save meal'));

    const meal = useMealStore.getState().meals[0];
    expect(meal.source).toBe('manual');
    expect(meal.confidence).toBe('high'); // spec F2.7
    expect(meal.foodItems).toEqual(['leftover pasta']);
  });

  it('only saves one meal no matter how many times Save is pressed', async () => {
    await render(<LogMealScreen />);
    await fireEvent.changeText(screen.getByLabelText('What did you eat?'), 'salmon');
    await fireEvent.press(screen.getByLabelText('Analyze'));
    await screen.findByText(/Offline estimate/);

    await fireEvent.press(screen.getByLabelText('Save meal'));
    await fireEvent.press(screen.getByLabelText('Save meal'));
    await fireEvent.press(screen.getByLabelText('Save meal'));

    expect(useMealStore.getState().meals).toHaveLength(1);
  });

  it('falls back to the home feed when there is no history to go back to (web refresh)', async () => {
    mockCanGoBack.mockReturnValueOnce(false);
    await render(<LogMealScreen />);
    await fireEvent.changeText(screen.getByLabelText('What did you eat?'), 'salmon');
    await fireEvent.press(screen.getByLabelText('Analyze'));
    await screen.findByText(/Offline estimate/);

    await fireEvent.press(screen.getByLabelText('Save meal'));

    expect(useMealStore.getState().meals).toHaveLength(1);
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('refuses to save zero-calorie entries', async () => {
    await render(<LogMealScreen />);
    await fireEvent.press(screen.getByLabelText('Enter manually instead'));
    await fireEvent.press(screen.getByLabelText('Save meal'));
    expect(screen.getByText('Calories must be above zero to save.')).toBeTruthy();
    expect(useMealStore.getState().meals).toHaveLength(0);
  });

  it('shows the camera-denied notice while keeping other paths open (spec F2.9)', async () => {
    await render(<LogMealScreen />);
    await fireEvent.press(screen.getByLabelText('Take photo'));
    expect(await screen.findByText(/Camera access is off/)).toBeTruthy();
    // description path still works
    await fireEvent.changeText(screen.getByLabelText('What did you eat?'), 'apple');
    await fireEvent.press(screen.getByLabelText('Analyze'));
    expect(await screen.findByText(/Offline estimate/)).toBeTruthy();
  });

  it('respects the default-private profile setting', async () => {
    useUserStore.getState().updateProfile({ defaultPrivate: true });
    await render(<LogMealScreen />);
    await fireEvent.changeText(screen.getByLabelText('What did you eat?'), 'salmon');
    await fireEvent.press(screen.getByLabelText('Analyze'));
    await screen.findByText(/Offline estimate/);
    await fireEvent.press(screen.getByLabelText('Save meal'));
    expect(useMealStore.getState().meals[0].isPrivate).toBe(true);
  });
});
