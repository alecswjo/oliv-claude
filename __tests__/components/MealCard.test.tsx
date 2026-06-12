import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { MealCard } from '@/components/MealCard';
import type { Meal, UserProfile } from '@/domain/types';

function meal(overrides: Partial<Meal> = {}): Meal {
  return {
    id: 'm1',
    userId: 'me',
    description: 'a bowl',
    mealType: 'lunch',
    loggedAt: new Date(2026, 5, 10, 12, 30).toISOString(),
    nutrition: {
      calories: 520, proteinG: 35, carbsG: 48, fatG: 18,
      fiberG: 6, sugarG: 7, sodiumMg: 600, saturatedFatG: 4,
    },
    foodItems: ['Chicken bowl', 'Avocado'],
    fruitVegServings: 1.5,
    processingLevel: 2,
    confidence: 'high',
    healthScore: { value: 4.5, factors: [] },
    source: 'ai',
    isPrivate: false,
    oliveUserIds: ['demo_maya', 'demo_jake'],
    comments: [{ id: 'c1', userId: 'demo_maya', text: 'nice', createdAt: '' }],
    ...overrides,
  };
}

const author: UserProfile = {
  id: 'demo_maya', username: 'maya_eats', displayName: 'Maya Chen',
  avatarEmoji: '🥑', avatarColor: '#708238', bio: '', joinedAt: '',
  goals: { dailyCalories: 2000, proteinG: 100, carbsG: 263, fatG: 61 },
  goalsAreDefault: true, defaultPrivate: false, longestStreak: 0, isDemo: true,
};

describe('MealCard', () => {
  it('renders title, calories, macros, time, score, and counts', async () => {
    await render(<MealCard meal={meal()} isOwn oliveActive={false} />);
    expect(screen.getByText('Chicken bowl · Avocado')).toBeTruthy();
    expect(screen.getByText('520')).toBeTruthy();
    expect(screen.getByText('Calories')).toBeTruthy();
    expect(screen.getByText('35g')).toBeTruthy();
    expect(screen.getByText('48g')).toBeTruthy();
    expect(screen.getByText('18g')).toBeTruthy();
    expect(screen.getByText(/Lunch · 12:30 PM/)).toBeTruthy();
    expect(screen.getByLabelText('Health score 4.5 out of 5')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy(); // olives
    expect(screen.getByText('1')).toBeTruthy(); // comments
  });

  it('shows the lock badge only for private meals', async () => {
    const { rerender } = await render(<MealCard meal={meal({ isPrivate: true })} isOwn oliveActive={false} />);
    expect(screen.getByLabelText('Private meal')).toBeTruthy();
    await rerender(<MealCard meal={meal()} isOwn oliveActive={false} />);
    expect(screen.queryByLabelText('Private meal')).toBeNull();
  });

  it('falls back to an emoji tile when there is no photo', async () => {
    await render(<MealCard meal={meal({ emoji: '🥣', photoUris: undefined })} isOwn oliveActive={false} />);
    expect(screen.getByText('🥣')).toBeTruthy();
  });

  it('fires onToggleOlive and labels the button by state', async () => {
    const onToggleOlive = jest.fn();
    const { rerender } = await render(
      <MealCard meal={meal()} isOwn oliveActive={false} onToggleOlive={onToggleOlive} />,
    );
    await fireEvent.press(screen.getByLabelText('Give an olive'));
    expect(onToggleOlive).toHaveBeenCalledTimes(1);

    await rerender(<MealCard meal={meal()} isOwn oliveActive onToggleOlive={onToggleOlive} />);
    expect(screen.getByLabelText('Remove olive')).toBeTruthy();
  });

  it('shows the author row with a You marker in social contexts', async () => {
    await render(<MealCard meal={meal()} author={author} showAuthor isOwn={false} oliveActive={false} />);
    expect(screen.getByText('Maya Chen')).toBeTruthy();
  });

  it('fires onPress for the card body', async () => {
    const onPress = jest.fn();
    await render(<MealCard meal={meal()} isOwn oliveActive={false} onPress={onPress} />);
    await fireEvent.press(screen.getByLabelText(/Meal: Chicken bowl/));
    expect(onPress).toHaveBeenCalled();
  });
});
