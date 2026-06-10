import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { ScoreBreakdown } from '@/components/ScoreBreakdown';
import { computeHealthScore } from '@/domain/healthScore';
import type { MealAnalysis } from '@/domain/types';

const analysis: MealAnalysis = {
  calories: 520, proteinG: 42, carbsG: 38, fatG: 21,
  fiberG: 8, sugarG: 5, sodiumMg: 380, saturatedFatG: 4,
  fruitVegServings: 2.5, processingLevel: 1, confidence: 'high',
  foodItems: ['salmon'],
};

describe('ScoreBreakdown', () => {
  it('renders one labelled row per factor with signed deltas', async () => {
    const score = computeHealthScore(analysis);
    await render(<ScoreBreakdown score={score} />);

    expect(screen.getByText('Excellent protein')).toBeTruthy();
    expect(screen.getByText('+0.80')).toBeTruthy();
    expect(screen.getByText('High fiber')).toBeTruthy();
    expect(screen.getByText('Plenty of produce')).toBeTruthy();
    expect(screen.getByText('Whole foods')).toBeTruthy();
  });

  it('renders negative deltas with a minus sign', async () => {
    const score = computeHealthScore({
      ...analysis, sugarG: 38, processingLevel: 4, fiberG: 1, fruitVegServings: 0,
      proteinG: 9, calories: 540, carbsG: 70, fatG: 24, saturatedFatG: 11,
    });
    await render(<ScoreBreakdown score={score} />);
    expect(screen.getByText('Ultra-processed')).toBeTruthy();
    expect(screen.getByText('-0.90')).toBeTruthy();
    expect(screen.getByText('Very high sugar')).toBeTruthy();
    expect(screen.getByText('-1.00')).toBeTruthy();
  });

  it('explains the base score', async () => {
    await render(<ScoreBreakdown score={computeHealthScore(analysis)} />);
    expect(screen.getByText(/starts at 3.0/)).toBeTruthy();
  });
});
