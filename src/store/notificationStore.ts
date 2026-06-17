import { create } from 'zustand';
import { Platform } from 'react-native';
import { isBackendConfigured } from '@/config';
import { loadJson } from '@/services/storage';
import { createPersister } from './persist';

/**
 * Notification preferences + OS permission state. The OS work (permissions,
 * push token, local scheduling) lives in `src/services/notifications.ts` and
 * the backend mirroring in `src/services/sync.ts`; both are dynamically
 * imported so this store (and the native modules) stay out of the offline/test
 * graph. Only `prefs`, `reminder`, and the last-known `permission` persist.
 */

const STORE_NAME = 'notifications';

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

export interface NotifPrefs {
  olives: boolean;
  comments: boolean;
  follows: boolean;
  newPosts: boolean;
}

export interface ReminderPref {
  enabled: boolean;
  hour: number;
  minute: number;
}

const DEFAULT_PREFS: NotifPrefs = { olives: true, comments: true, follows: true, newPosts: true };
const DEFAULT_REMINDER: ReminderPref = { enabled: false, hour: 19, minute: 0 };

interface Persisted {
  prefs: NotifPrefs;
  reminder: ReminderPref;
  permission: PermissionStatus;
}

interface NotificationState extends Persisted {
  hydrated: boolean;
  pushToken: string | null;

  hydrate(): Promise<void>;
  /** Read the live OS permission status into the store. */
  refreshPermission(): Promise<void>;
  /** Prompt for permission, register the push token, mirror prefs. Returns granted. */
  enable(): Promise<boolean>;
  setPref(key: keyof NotifPrefs, value: boolean): void;
  setReminderEnabled(enabled: boolean): Promise<void>;
  setReminderTime(hour: number, minute: number): Promise<void>;
  /** Re-register the device token + reschedule the reminder (call on launch / sign-in). */
  syncRegistration(): Promise<void>;
  reset(): void;
}

export const useNotificationStore = create<NotificationState>()((set, get) => {
  const persist = createPersister<Persisted>(STORE_NAME, () => {
    const { prefs, reminder, permission } = get();
    return { prefs, reminder, permission };
  });

  /** Push the current prefs to the backend (best-effort, gated). */
  const mirrorPrefs = async () => {
    if (!isBackendConfigured()) return;
    const sync = await import('@/services/sync');
    if (!sync.backendActive()) return;
    sync.pushNotificationPrefs(get().prefs);
  };

  return {
    prefs: DEFAULT_PREFS,
    reminder: DEFAULT_REMINDER,
    permission: 'undetermined',
    hydrated: false,
    pushToken: null,

    async hydrate() {
      const saved = await loadJson<Persisted>(STORE_NAME);
      set({
        prefs: { ...DEFAULT_PREFS, ...saved?.prefs },
        reminder: { ...DEFAULT_REMINDER, ...saved?.reminder },
        permission: saved?.permission ?? 'undetermined',
        hydrated: true,
      });
    },

    async refreshPermission() {
      try {
        const notif = await import('@/services/notifications');
        const permission = await notif.getPermission();
        set({ permission });
        persist();
      } catch {
        // native module unavailable (web / unsupported) — leave as-is
      }
    },

    async enable() {
      try {
        const notif = await import('@/services/notifications');
        notif.configureHandler();
        await notif.setupAndroidChannel();
        const permission = await notif.requestPermission();
        set({ permission });
        persist();
        if (permission !== 'granted') return false;

        const token = await notif.getPushToken();
        set({ pushToken: token });
        if (token && isBackendConfigured()) {
          const sync = await import('@/services/sync');
          if (sync.backendActive()) sync.pushDeviceToken(token, Platform.OS);
        }
        await mirrorPrefs();
        if (get().reminder.enabled) {
          const { hour, minute } = get().reminder;
          await notif.scheduleDailyReminder(hour, minute);
        }
        return true;
      } catch {
        return false;
      }
    },

    setPref(key, value) {
      set({ prefs: { ...get().prefs, [key]: value } });
      persist();
      void mirrorPrefs();
    },

    async setReminderEnabled(enabled) {
      set({ reminder: { ...get().reminder, enabled } });
      persist();
      try {
        const notif = await import('@/services/notifications');
        if (enabled) {
          const { hour, minute } = get().reminder;
          await notif.scheduleDailyReminder(hour, minute);
        } else {
          await notif.cancelDailyReminder();
        }
      } catch {
        // scheduling unavailable — the persisted flag still reflects intent
      }
    },

    async setReminderTime(hour, minute) {
      set({ reminder: { ...get().reminder, hour, minute } });
      persist();
      if (!get().reminder.enabled) return;
      try {
        const notif = await import('@/services/notifications');
        await notif.scheduleDailyReminder(hour, minute);
      } catch {
        // best-effort
      }
    },

    async syncRegistration() {
      try {
        const notif = await import('@/services/notifications');
        notif.configureHandler();
        await notif.setupAndroidChannel();
        const permission = await notif.getPermission();
        set({ permission });
        persist();
        if (permission !== 'granted') return;

        const token = await notif.getPushToken();
        set({ pushToken: token });
        if (token && isBackendConfigured()) {
          const sync = await import('@/services/sync');
          if (sync.backendActive()) {
            sync.pushDeviceToken(token, Platform.OS);
            sync.pushNotificationPrefs(get().prefs);
          }
        }
        // Re-assert the local reminder schedule (cleared by OS reinstalls).
        if (get().reminder.enabled) {
          const { hour, minute } = get().reminder;
          await notif.scheduleDailyReminder(hour, minute);
        }
      } catch {
        // never block startup
      }
    },

    reset() {
      set({ prefs: DEFAULT_PREFS, reminder: DEFAULT_REMINDER, permission: 'undetermined', pushToken: null });
      persist();
      void import('@/services/notifications').then((n) => n.cancelDailyReminder()).catch(() => {});
    },
  };
});
