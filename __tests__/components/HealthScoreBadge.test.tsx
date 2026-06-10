import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { HealthScoreBadge } from '@/components/HealthScoreBadge';

describe('HealthScoreBadge', () => {
  it('exposes the score as an accessible label', async () => {
    await render(<HealthScoreBadge value={4.5} />);
    expect(screen.getByLabelText('Health score 4.5 out of 5')).toBeTruthy();
  });

  it('shows the numeric chip with one decimal', async () => {
    await render(<HealthScoreBadge value={3} />);
    expect(screen.getByText('3.0')).toBeTruthy();
  });

  it('can hide the numeric chip', async () => {
    await render(<HealthScoreBadge value={2.5} showNumber={false} />);
    expect(screen.queryByText('2.5')).toBeNull();
    expect(screen.getByLabelText('Health score 2.5 out of 5')).toBeTruthy();
  });
});
