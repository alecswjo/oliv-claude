import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Alert } from 'react-native';
import { computeHealthScore } from '@/domain/healthScore';
import type { Meal, MealAnalysis, UserProfile } from '@/domain/types';
import { DEFAULT_GOALS } from '@/domain/types';
import { saveJson } from '@/services/storage';
import { useMealStore } from '@/store/mealStore';
import { useSocialStore } from '@/store/socialStore';
import { useUserStore } from '@/store/userStore';

/**
 * Route-level integration tests: mount the REAL app directory through
 * expo-router — root stack, tab bar, modal presentation, deep links — press
 * the actual buttons and assert where the router ends up. These exist because
 * unit tests with a mocked router can't catch "GO_BACK was not handled".
 */

jest.mock('expo-font', () => ({
  useFonts: () => [true, null],
  isLoaded: () => true,
  loadAsync: jest.fn(async () => {}),
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(async () => true),
  hideAsync: jest.fn(async () => true),
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: false })),
}));

jest.mock('@/services/photos', () => ({
  preparePhotoForAnalysis: jest.fn(),
  persistPhoto: jest.fn((uri: string) => uri),
  deletePhoto: jest.fn(),
}));

const ANALYSIS: MealAnalysis = {
  calories: 520, proteinG: 42, carbsG: 38, fatG: 21,
  fiberG: 8, sugarG: 5, sodiumMg: 380, saturatedFatG: 4,
  fruitVegServings: 2.5, processingLevel: 1, confidence: 'high',
  foodItems: ['Salmon', 'Quinoa'],
};

const PROFILE: UserProfile = {
  id: 'me', username: 'tester', displayName: 'Tester',
  avatarEmoji: '🫒', avatarColor: '#708238', bio: '', joinedAt: '2026-01-01T00:00:00.000Z',
  goals: DEFAULT_GOALS, goalsAreDefault: true, defaultPrivate: false, longestStreak: 0, isDemo: false,
};

function ownMeal(id: string): Meal {
  return {
    id,
    userId: PROFILE.id,
    description: 'salmon dinner',
    mealType: 'dinner',
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

// Seed AsyncStorage directly (awaited writes). The stores' own persister is
// microtask-coalesced; under renderRouter's fake timers (which fake
// queueMicrotask) its scheduled flush can be silently dropped, so tests must
// not depend on it for fixtures. The root layout hydrates from these keys.
async function seedProfile() {
  useUserStore.setState({ profile: PROFILE });
  await saveJson('user', { profile: PROFILE });
}

async function seedMeals(meals: Meal[]) {
  useMealStore.setState({ meals });
  await saveJson('meals', { meals });
}

beforeEach(async () => {
  // renderRouter leaves fake timers installed — seed under real ones.
  jest.useRealTimers();
  await AsyncStorage.clear();
  useMealStore.setState({ meals: [], hydrated: false });
  useUserStore.setState({ profile: null, hydrated: false });
  useSocialStore.setState({
    seeded: false, demoUsers: [], demoMeals: [],
    followingIds: [], followerIds: [], hydrated: false,
  });
});

describe('Routes & navigation (integration through the real router)', () => {
  it('redirects to onboarding when no profile exists', async () => {
    const app = renderRouter('src/app', { initialUrl: '/' });
    await app;
    await waitFor(() => expect(app.getPathname()).toBe('/onboarding'));
    expect(await screen.findByText('Make it yours')).toBeTruthy(); // step 1

  });

  it('navigates between all four tabs from the tab bar', async () => {
    await seedProfile();
    const app = renderRouter('src/app', { initialUrl: '/' });
    await app;

    // My Feed renders the daily summary hero
    expect(await screen.findByText('kcal left')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Social tab'));
    expect(await screen.findByText('Discover')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Progress tab'));
    expect(await screen.findByText('Last 7 days')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Profile tab'));
    expect(await screen.findByLabelText('Settings')).toBeTruthy();
    expect(app.getPathname()).toBe('/profile');
  });

  it('opens the log modal from the center tab button and closes it with the X', async () => {
    await seedProfile();
    const app = renderRouter('src/app', { initialUrl: '/' });
    await app;
    await screen.findByText('kcal left');

    await fireEvent.press(screen.getByLabelText('Log a meal'));
    await waitFor(() => expect(app.getPathname()).toBe('/log'));
    expect(await screen.findByLabelText('Analyze with AI')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Close'));
    await waitFor(() => expect(app.getPathname()).toBe('/'));
  });

  it('logs a meal end-to-end and lands back on the feed exactly once', async () => {
    await seedProfile();
    const app = renderRouter('src/app', { initialUrl: '/' });
    await app;
    await screen.findByText('kcal left');

    await fireEvent.press(screen.getByLabelText('Log a meal'));
    await fireEvent.changeText(
      await screen.findByLabelText('What did you eat?'),
      'grilled chicken with brown rice and broccoli',
    );
    await fireEvent.press(screen.getByLabelText('Analyze with AI'));
    await screen.findByText(/Offline estimate/);
    await fireEvent.press(screen.getByLabelText('Save meal'));

    await waitFor(() => expect(app.getPathname()).toBe('/'));
    expect(useMealStore.getState().meals).toHaveLength(1);
    expect(await screen.findByText('Grilled chicken · Brown rice · Broccoli')).toBeTruthy();
  });

  it('saves from the log modal even when it is the first screen (deep link / web refresh)', async () => {
    await seedProfile();
    const app = renderRouter('src/app', { initialUrl: '/log' });
    await app;

    await fireEvent.changeText(
      await screen.findByLabelText('What did you eat?'),
      'salmon',
    );
    await fireEvent.press(screen.getByLabelText('Analyze with AI'));
    await screen.findByText(/Offline estimate/);
    await fireEvent.press(screen.getByLabelText('Save meal'));

    // The bug: GO_BACK had nowhere to go and stranded the user on the form.
    await waitFor(() => expect(app.getPathname()).toBe('/'));
    expect(useMealStore.getState().meals).toHaveLength(1);
  });

  it('opens a meal from its card and deletes it via the confirm dialog', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.style === 'destructive')?.onPress?.();
    });
    await seedProfile();
    await seedMeals([ownMeal('own1')]);

    const app = renderRouter('src/app', { initialUrl: '/' });
    await app;
    await fireEvent.press(await screen.findByLabelText(/Meal: Salmon · Quinoa/));
    await waitFor(() => expect(app.getPathname()).toBe('/meal/own1'));

    await fireEvent.press(await screen.findByLabelText('Delete meal'));

    expect(useMealStore.getState().meals).toHaveLength(0);
    await waitFor(() => expect(app.getPathname()).toBe('/'));
    alertSpy.mockRestore();
  });

  it('deep links to another user profile and follows them', async () => {
    await seedProfile();
    const app = renderRouter('src/app', { initialUrl: '/user/demo_maya' });
    await app;

    expect(await screen.findByText('Maya Chen')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Follow'));

    expect(useSocialStore.getState().followingIds).toContain('demo_maya');
    expect(await screen.findByLabelText('Following')).toBeTruthy();
    expect(app.getPathname()).toBe('/user/demo_maya');
  });

  it('reaches settings from the profile tab', async () => {
    await seedProfile();
    const app = renderRouter('src/app', { initialUrl: '/' });
    await app;
    await screen.findByText('kcal left');

    await fireEvent.press(screen.getByLabelText('Profile tab'));
    await fireEvent.press(await screen.findByLabelText('Settings'));

    await waitFor(() => expect(app.getPathname()).toBe('/settings'));
    expect(await screen.findByText('Daily targets')).toBeTruthy();
  });

  it('never strands the user on an unknown meal (Go back from a dead-end deep link)', async () => {
    await seedProfile();
    const app = renderRouter('src/app', { initialUrl: '/meal/nope' });
    await app;

    expect(await screen.findByText('Meal not found')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Go back'));

    await waitFor(() => expect(app.getPathname()).toBe('/'));
  });
});
