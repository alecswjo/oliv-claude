import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Thin wrapper over expo-notifications. Imported dynamically by
 * notificationStore so the native module never loads in the offline/test graph.
 */

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

const DAILY_REMINDER_ID = 'oliv-daily-reminder';

let handlerConfigured = false;

/** Show banners while the app is foregrounded. Idempotent. */
export function configureHandler(): void {
  if (handlerConfigured) return;
  handlerConfigured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function setupAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

function normalize(status: Notifications.PermissionStatus): PermissionStatus {
  if (status === 'granted') return 'granted';
  if (status === 'denied') return 'denied';
  return 'undetermined';
}

export async function getPermission(): Promise<PermissionStatus> {
  const { status } = await Notifications.getPermissionsAsync();
  return normalize(status);
}

export async function requestPermission(): Promise<PermissionStatus> {
  const { status } = await Notifications.requestPermissionsAsync();
  return normalize(status);
}

/** The Expo push token for this device, or null (simulator / no project id / web). */
export async function getPushToken(): Promise<string | null> {
  if (Platform.OS === 'web' || !Device.isDevice) return null;
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  const projectId =
    extra?.eas?.projectId ?? (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  if (!projectId) return null;
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch {
    return null;
  }
}

/** (Re)schedule the local daily "log your meals" reminder at the given time. */
export async function scheduleDailyReminder(hour: number, minute: number): Promise<void> {
  await cancelDailyReminder();
  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_REMINDER_ID,
    content: {
      title: 'Time to log your meals 🥗',
      body: "Keep your streak going — add what you ate today.",
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
  });
}

export async function cancelDailyReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_ID).catch(() => {});
}

/** Listen for taps on a delivered notification. Returns an unsubscribe. */
export function addResponseListener(handler: (data: Record<string, unknown>) => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    handler((response.notification.request.content.data ?? {}) as Record<string, unknown>);
  });
  return () => sub.remove();
}

/** Data of the notification that cold-launched the app (tapped while killed). */
export async function getInitialResponseData(): Promise<Record<string, unknown> | null> {
  const r = await Notifications.getLastNotificationResponseAsync();
  return (r?.notification.request.content.data ?? null) as Record<string, unknown> | null;
}
