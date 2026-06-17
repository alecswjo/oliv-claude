/**
 * Notification preferences store: persistence, the permission/enable flow, and
 * mirroring prefs to the backend. The OS service and mockSync are mocked so no
 * native module loads and we assert the orchestration precisely.
 */

jest.mock('@/config', () => ({ isBackendConfigured: () => true }));

const mockSvc = {
  configureHandler: jest.fn(),
  setupAndroidChannel: jest.fn(async () => {}),
  getPermission: jest.fn(async (): Promise<string> => 'undetermined'),
  requestPermission: jest.fn(async (): Promise<string> => 'granted'),
  getPushToken: jest.fn(async () => 'ExponentPushToken[abc]'),
  scheduleDailyReminder: jest.fn(async () => {}),
  cancelDailyReminder: jest.fn(async () => {}),
};
jest.mock('@/services/notifications', () => mockSvc);

const mockSync = {
  backendActive: jest.fn(() => true),
  pushDeviceToken: jest.fn(),
  pushNotificationPrefs: jest.fn(),
};
jest.mock('@/services/sync', () => mockSync);

import { useNotificationStore } from '@/store/notificationStore';
import { flushPersistence } from '@/store/persist';

beforeEach(async () => {
  jest.clearAllMocks();
  await (await import('@react-native-async-storage/async-storage')).default.clear();
  useNotificationStore.setState({
    prefs: { olives: true, comments: true, follows: true, newPosts: true },
    reminder: { enabled: false, hour: 19, minute: 0 },
    permission: 'undetermined',
    pushToken: null,
    hydrated: false,
  });
  mockSvc.requestPermission.mockResolvedValue('granted');
  mockSvc.getPermission.mockResolvedValue('undetermined');
});

afterEach(async () => {
  await flushPersistence();
});

describe('notificationStore', () => {
  it('hydrates to all-on defaults', async () => {
    await useNotificationStore.getState().hydrate();
    expect(useNotificationStore.getState().prefs).toEqual({
      olives: true, comments: true, follows: true, newPosts: true,
    });
    expect(useNotificationStore.getState().reminder.enabled).toBe(false);
  });

  it('enable(): granted → registers token + mirrors prefs, returns true', async () => {
    const ok = await useNotificationStore.getState().enable();
    expect(ok).toBe(true);
    expect(useNotificationStore.getState().permission).toBe('granted');
    expect(useNotificationStore.getState().pushToken).toBe('ExponentPushToken[abc]');
    expect(mockSync.pushDeviceToken).toHaveBeenCalledWith('ExponentPushToken[abc]', expect.any(String));
    expect(mockSync.pushNotificationPrefs).toHaveBeenCalled();
  });

  it('enable(): denied → returns false, no token registered', async () => {
    mockSvc.requestPermission.mockResolvedValue('denied');
    const ok = await useNotificationStore.getState().enable();
    expect(ok).toBe(false);
    expect(useNotificationStore.getState().permission).toBe('denied');
    expect(mockSync.pushDeviceToken).not.toHaveBeenCalled();
  });

  it('setPref persists and mirrors to the backend', async () => {
    useNotificationStore.getState().setPref('olives', false);
    await flushPersistence();
    expect(useNotificationStore.getState().prefs.olives).toBe(false);
    expect(mockSync.pushNotificationPrefs).toHaveBeenCalledWith(
      expect.objectContaining({ olives: false }),
    );
    // persisted
    const saved = await import('@/services/storage').then((s) => s.loadJson('notifications'));
    expect((saved as { prefs: { olives: boolean } }).prefs.olives).toBe(false);
  });

  it('daily reminder schedules when enabled, cancels when disabled', async () => {
    await useNotificationStore.getState().setReminderEnabled(true);
    expect(mockSvc.scheduleDailyReminder).toHaveBeenCalledWith(19, 0);
    await useNotificationStore.getState().setReminderEnabled(false);
    expect(mockSvc.cancelDailyReminder).toHaveBeenCalled();
  });

  it('changing reminder time reschedules only while enabled', async () => {
    await useNotificationStore.getState().setReminderTime(8, 0);
    expect(mockSvc.scheduleDailyReminder).not.toHaveBeenCalled(); // disabled → no schedule
    await useNotificationStore.getState().setReminderEnabled(true);
    mockSvc.scheduleDailyReminder.mockClear();
    await useNotificationStore.getState().setReminderTime(12, 0);
    expect(mockSvc.scheduleDailyReminder).toHaveBeenCalledWith(12, 0);
  });

  it('syncRegistration only registers when permission is already granted', async () => {
    mockSvc.getPermission.mockResolvedValue('granted');
    await useNotificationStore.getState().syncRegistration();
    expect(mockSync.pushDeviceToken).toHaveBeenCalled();

    jest.clearAllMocks();
    mockSvc.getPermission.mockResolvedValue('undetermined');
    await useNotificationStore.getState().syncRegistration();
    expect(mockSync.pushDeviceToken).not.toHaveBeenCalled();
  });
});
