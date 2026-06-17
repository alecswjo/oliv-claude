import { create } from 'zustand';
import { isBackendConfigured } from '@/config';

/**
 * Session state for backend mode. In local/offline mode (no backend
 * configured) auth is irrelevant and `requiresAuth` is false, so the app
 * behaves exactly as before. All Supabase access is dynamically imported so
 * this store stays out of the offline/test module graph.
 */

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface AuthState {
  status: AuthStatus;
  userId: string | null;
  email?: string;
  requiresAuth: boolean;
  /**
   * True when the signed-in user's server state could not be loaded. While
   * set, the app must NOT route to onboarding — completing onboarding would
   * upsert a fresh profile over the user's real one.
   */
  hydrateFailed: boolean;

  init(): Promise<void>;
  setUser(user: { id: string; email?: string } | null): void;
  setHydrateFailed(value: boolean): void;
  signOut(): Promise<void>;
}

let initialized = false;

export const useAuthStore = create<AuthState>()((set, get) => ({
  status: isBackendConfigured() ? 'loading' : 'signedOut',
  userId: null,
  requiresAuth: isBackendConfigured(),
  hydrateFailed: false,

  async init() {
    if (!isBackendConfigured()) {
      set({ status: 'signedOut' });
      return;
    }
    const { currentUser, onAuthChange } = await import('@/services/supabase/auth');
    if (!initialized) {
      initialized = true;
      onAuthChange((user) => get().setUser(user));
    }
    const user = await currentUser();
    get().setUser(user);
  },

  setUser(user) {
    set(
      user
        ? { status: 'signedIn', userId: user.id, email: user.email }
        : { status: 'signedOut', userId: null, email: undefined },
    );
  },

  setHydrateFailed(value) {
    set({ hydrateFailed: value });
  },

  async signOut() {
    if (isBackendConfigured()) {
      // Stop pushes to this device for the departing account before the
      // session is gone (the delete is RLS-scoped to the signed-in user).
      const { useNotificationStore } = await import('@/store/notificationStore');
      const token = useNotificationStore.getState().pushToken;
      if (token) {
        const sync = await import('@/services/sync');
        sync.removeDeviceToken(token);
        await sync.flushSync().catch(() => {});
      }

      const { signOut } = await import('@/services/supabase/auth');
      await signOut();
      // Clear the local cache so another account signing in on this device
      // doesn't inherit (and re-sync) the previous user's data.
      const [{ useUserStore }, { useMealStore }, { useSocialStore }] = await Promise.all([
        import('@/store/userStore'),
        import('@/store/mealStore'),
        import('@/store/socialStore'),
      ]);
      useUserStore.getState().reset();
      useMealStore.getState().reset();
      useSocialStore.getState().reset();
      useSocialStore.getState().seedIfNeeded();
      useNotificationStore.getState().reset();
    }
    set({ status: 'signedOut', userId: null, email: undefined, hydrateFailed: false });
  },
}));
