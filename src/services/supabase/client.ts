import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { isBackendConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from '@/config';

/**
 * Lazily-created Supabase client. Null when the backend isn't configured, so
 * the app degrades cleanly to local/offline mode. Sessions persist in
 * AsyncStorage and auto-refresh.
 */
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isBackendConfigured()) return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        // PKCE + URL detection complete the OAuth redirect on web; on native
        // the in-app browser flow exchanges the code explicitly (auth.ts).
        detectSessionInUrl: Platform.OS === 'web',
        flowType: 'pkce',
      },
    });
    // RN has no web visibility events: supabase-js needs to be told when the
    // app foregrounds so the token auto-refresh timer keeps sessions alive.
    if (Platform.OS !== 'web') {
      const c = client;
      AppState.addEventListener('change', (state) => {
        if (state === 'active') c.auth.startAutoRefresh();
        else c.auth.stopAutoRefresh();
      });
    }
  }
  return client;
}

/** Current access token (for authenticating Edge Function calls), or null. */
export async function getAccessToken(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Test seam: inject a fake client (and reset with `setSupabaseClient(null)`). */
export function setSupabaseClient(fake: SupabaseClient | null): void {
  client = fake;
}
