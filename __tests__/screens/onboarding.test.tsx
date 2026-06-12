import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { useAppStore } from '@/store/appStore';
import { useUserStore } from '@/store/userStore';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ canGoBack: () => true, push: jest.fn(), back: jest.fn(), replace: mockReplace }),
}));

import OnboardingScreen from '@/app/onboarding';

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  useUserStore.setState({ profile: null, hydrated: true });
  useAppStore.setState({ units: 'metric', hydrated: true });
});

async function fillProfileStep(username = 'jake_t') {
  await fireEvent.changeText(screen.getByLabelText('Display name'), 'Jake');
  await fireEvent.changeText(screen.getByLabelText('Username'), username);
  await fireEvent.press(screen.getByLabelText('Continue'));
}

describe('Onboarding (spec §F1 / §13.1)', () => {
  it('computes the spec reference targets from body inputs end-to-end', async () => {
    await render(<OnboardingScreen />);

    await fillProfileStep();

    // Step 2 — body: M 32y / 180cm / 84kg / moderate / gain (spec §F1.4 vector)
    await fireEvent.press(screen.getByLabelText('Male'));
    await fireEvent.changeText(screen.getByLabelText('Age'), '32');
    await fireEvent.changeText(screen.getByLabelText('Height (cm)'), '180');
    await fireEvent.changeText(screen.getByLabelText('Weight (kg)'), '84');
    await fireEvent.press(screen.getByLabelText('Moderate'));
    await fireEvent.press(screen.getByLabelText('Gain muscle'));
    await fireEvent.press(screen.getByLabelText('Compute my targets'));

    // Step 3 — review shows the exact reference vector
    expect(screen.getByDisplayValue('3106')).toBeTruthy();
    expect(screen.getByDisplayValue('155')).toBeTruthy();
    expect(screen.getByDisplayValue('95')).toBeTruthy();
    expect(screen.getByDisplayValue('408')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Start tracking 🫒'));

    const profile = useUserStore.getState().profile!;
    expect(profile.username).toBe('jake_t');
    expect(profile.goals).toEqual({ dailyCalories: 3106, proteinG: 155, fatG: 95, carbsG: 408 });
    expect(profile.goalsAreDefault).toBe(false);
    expect(profile.body?.weightKg).toBe(84);
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
  });

  it('supports imperial input and converts to metric storage', async () => {
    await render(<OnboardingScreen />);
    await fillProfileStep();

    await fireEvent.press(screen.getByLabelText('lb / ft-in'));
    await fireEvent.changeText(screen.getByLabelText('Age'), '27');
    await fireEvent.changeText(screen.getByLabelText('Height (ft)'), '5');
    await fireEvent.changeText(screen.getByLabelText('(in)'), '5');
    await fireEvent.changeText(screen.getByLabelText('Weight (lb)'), '137');
    await fireEvent.press(screen.getByLabelText('Compute my targets'));
    await fireEvent.press(screen.getByLabelText('Start tracking 🫒'));

    const body = useUserStore.getState().profile!.body!;
    expect(body.heightCm).toBeCloseTo(165.1, 0);
    expect(body.weightKg).toBeCloseTo(62.1, 0);
  });

  it('rejects usernames taken by demo users (spec F1.7)', async () => {
    await render(<OnboardingScreen />);
    await fillProfileStep('maya_eats');
    expect(screen.getByText('That username is taken.')).toBeTruthy();
    expect(useUserStore.getState().profile).toBeNull();
  });

  it('rejects malformed usernames and short names', async () => {
    await render(<OnboardingScreen />);
    await fireEvent.changeText(screen.getByLabelText('Display name'), 'Jake');
    await fireEvent.changeText(screen.getByLabelText('Username'), 'a!');
    await fireEvent.press(screen.getByLabelText('Continue'));
    expect(screen.getByText(/3–20 characters/)).toBeTruthy();
  });

  it('skip flow lands on spec defaults flagged as defaults', async () => {
    await render(<OnboardingScreen />);
    await fillProfileStep();
    await fireEvent.press(screen.getByLabelText('Skip for now'));

    expect(screen.getByDisplayValue('2000')).toBeTruthy();
    expect(screen.getByDisplayValue('263')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Start tracking 🫒'));
    const profile = useUserStore.getState().profile!;
    expect(profile.goalsAreDefault).toBe(true);
    expect(profile.goals.carbsG).toBe(263);
  });

  it('validates body inputs with clear errors', async () => {
    await render(<OnboardingScreen />);
    await fillProfileStep();
    await fireEvent.changeText(screen.getByLabelText('Age'), '7');
    await fireEvent.press(screen.getByLabelText('Compute my targets'));
    expect(screen.getByText('Age must be between 13 and 100.')).toBeTruthy();
  });

  it('rejects inconsistent target overrides on the review step', async () => {
    await render(<OnboardingScreen />);
    await fillProfileStep();
    await fireEvent.press(screen.getByLabelText('Skip for now'));
    await fireEvent.changeText(screen.getByLabelText('Protein (g)'), '10');
    await fireEvent.changeText(screen.getByLabelText('Carbs (g)'), '20');
    await fireEvent.changeText(screen.getByLabelText('Fat (g)'), '5');
    await fireEvent.press(screen.getByLabelText('Start tracking 🫒'));
    expect(screen.getByText(/Macros add up too far/)).toBeTruthy();
    expect(useUserStore.getState().profile).toBeNull();
  });
});
