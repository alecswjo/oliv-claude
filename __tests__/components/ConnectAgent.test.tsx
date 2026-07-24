/**
 * The Settings "Text your meals" card: disclosure-gated connect flow,
 * linked/unlinked states, and the privacy-consequence line matching the
 * user's default (agent spec §7.2, §11).
 */

jest.mock('@/config', () => ({
  isBackendConfigured: () => true,
  AGENT_NUMBER: '+13054098546',
}));

const mockFetchLink = jest.fn();
const mockMint = jest.fn();
const mockRevoke = jest.fn();
jest.mock('@/services/agentLink', () => ({
  fetchAgentLink: (...args: unknown[]) => mockFetchLink(...args),
  mintAgentLinkToken: (...args: unknown[]) => mockMint(...args),
  revokeAgentLink: (...args: unknown[]) => mockRevoke(...args),
}));

const mockConfirm = jest.fn();
jest.mock('@/services/confirm', () => ({
  confirmAction: (...args: unknown[]) => mockConfirm(...args),
}));

import React from 'react';
import { Linking } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { ConnectAgent } from '@/components/ConnectAgent';
import { DEFAULT_GOALS, type UserProfile } from '@/domain/types';
import { useUserStore } from '@/store/userStore';

const profile: UserProfile = {
  id: 'u1', username: 'alec', displayName: 'Alec', avatarEmoji: '🫒', avatarColor: '#708238',
  bio: '', joinedAt: '2026-01-01T00:00:00Z', goals: DEFAULT_GOALS, goalsAreDefault: true,
  defaultPrivate: true, longestStreak: 0, isDemo: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  useUserStore.setState({ profile, hydrated: true });
  mockFetchLink.mockResolvedValue(null);
});

it('offers connect with the private-default disclosure', async () => {
  const screen = await render(<ConnectAgent />);
  await waitFor(() => expect(mockFetchLink).toHaveBeenCalled());
  expect(screen.getByText('Connect over iMessage')).toBeTruthy();
  expect(screen.getByText(/stay private unless you share/)).toBeTruthy();
});

it('warns when the user shares by default', async () => {
  useUserStore.setState({ profile: { ...profile, defaultPrivate: false } });
  const screen = await render(<ConnectAgent />);
  await waitFor(() => expect(mockFetchLink).toHaveBeenCalled());
  expect(screen.getByText(/will post to your feed/)).toBeTruthy();
});

it('consent dialog gates minting; accepting opens Messages with the code', async () => {
  mockConfirm.mockResolvedValue(true);
  mockMint.mockResolvedValue({ token: 'ab'.repeat(16), expiresAt: '2026-07-23T12:15:00Z' });
  const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);

  const screen = await render(<ConnectAgent />);
  await waitFor(() => expect(mockFetchLink).toHaveBeenCalled());
  await act(async () => {
    await fireEvent.press(screen.getByText('Connect over iMessage'));
  });

  expect(mockConfirm).toHaveBeenCalledWith(
    expect.objectContaining({ title: expect.stringMatching(/Connect Oliv/) }),
  );
  expect(mockMint).toHaveBeenCalled();
  expect(openUrl).toHaveBeenCalledWith(expect.stringContaining('LINK%20abab'));
  expect(screen.getByText(/Waiting for your text/)).toBeTruthy();
  openUrl.mockRestore();
});

it('declining the dialog mints nothing', async () => {
  mockConfirm.mockResolvedValue(false);
  const screen = await render(<ConnectAgent />);
  await waitFor(() => expect(mockFetchLink).toHaveBeenCalled());
  await act(async () => {
    await fireEvent.press(screen.getByText('Connect over iMessage'));
  });
  expect(mockMint).not.toHaveBeenCalled();
});

it('shows the linked state with a disconnect action', async () => {
  mockFetchLink.mockResolvedValue({ phone: '+14085551234', linkedAt: '2026-07-23T00:00:00Z' });
  mockConfirm.mockResolvedValue(true);
  mockRevoke.mockResolvedValue(undefined);

  const screen = await render(<ConnectAgent />);
  await waitFor(() => expect(screen.getByText(/\+14085551234/)).toBeTruthy());
  await act(async () => {
    await fireEvent.press(screen.getByText('Disconnect'));
  });
  expect(mockRevoke).toHaveBeenCalled();
  await waitFor(() => expect(screen.getByText('Connect over iMessage')).toBeTruthy());
});
