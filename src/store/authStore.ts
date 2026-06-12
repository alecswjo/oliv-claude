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

  init(): Promise<void>;
  setUser(user: { id: string; email?: string } | null): void;
  signOut(): Promise<void>;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  status: isBackendConfigured() ? 'loading' : 'signedOut',
  userId: null,
  requiresAuth: isBackendConfigured(),

  async init() {
    if (!isBackendConfigured()) {
      set({ status: 'signedOut' });
      return;
    }
    const { currentUser, onAuthChange } = await import('@/services/supabase/auth');
    onAuthChange((user) => get().setUser(user));
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

  async signOut() {
    if (isBackendConfigured()) {
      const { signOut } = await import('@/services/supabase/auth');
      await signOut();
      // Clear the local cache so another account signing in on this device
      // doesn't inherit (and re-sync) the previous user's profile and meals.
      const [{ useUserStore }, { useMealStore }] = await Promise.all([
        import('@/store/userStore'),
        import('@/store/mealStore'),
      ]);
      useUserStore.getState().reset();
      useMealStore.getState().reset();
    }
    set({ status: 'signedOut', userId: null, email: undefined });
  },
}));
