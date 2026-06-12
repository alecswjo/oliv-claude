import type { Session } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { getSupabase } from './client';

/** Auth wrappers. All no-op/throw cleanly when the backend isn't configured. */

export interface AuthUser {
  id: string;
  email?: string;
}

export type OAuthProvider = 'google' | 'apple';

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Backend not configured');
  return supabase;
}

export async function signUpEmail(email: string, password: string): Promise<void> {
  const { error } = await requireClient().auth.signUp({ email, password });
  if (error) throw error;
}

export async function signInEmail(email: string, password: string): Promise<void> {
  const { error } = await requireClient().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/**
 * Native Sign in with Apple (iOS): the system sheet returns an identity token
 * we exchange directly — no browser round-trip. Required by App Store
 * Guideline 4.8 alongside any third-party login. Falls back to the web OAuth
 * flow off-iOS.
 */
export async function signInWithApple(): Promise<void> {
  if (Platform.OS !== 'ios') {
    return signInWithProvider('apple');
  }
  const supabase = requireClient();
  const Apple = await import('expo-apple-authentication');
  let credential: import('expo-apple-authentication').AppleAuthenticationCredential;
  try {
    credential = await Apple.signInAsync({
      requestedScopes: [
        Apple.AppleAuthenticationScope.FULL_NAME,
        Apple.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'ERR_REQUEST_CANCELED') {
      throw new Error('Sign-in was cancelled.');
    }
    throw err;
  }
  if (!credential.identityToken) throw new Error('Apple returned no identity token.');
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw error;
}

/**
 * OAuth sign-in (PKCE). On web this is a full-page redirect — the promise
 * resolves as the page navigates away, and the redirected-back page picks up
 * the session via `detectSessionInUrl`. On native we open the provider in an
 * in-app browser and exchange the returned code; when this resolves the
 * session is live.
 */
export async function signInWithProvider(provider: OAuthProvider): Promise<void> {
  const supabase = requireClient();
  const Linking = await import('expo-linking');
  const redirectTo = Linking.createURL('/sign-in');

  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
    if (error) throw error;
    return;
  }

  const WebBrowser = await import('expo-web-browser');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') throw new Error('Sign-in was cancelled.');
  const code = new URL(result.url).searchParams.get('code');
  if (!code) {
    const desc = new URL(result.url).searchParams.get('error_description');
    throw new Error(desc ?? 'Sign-in failed: the provider returned no code.');
  }
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
}

/**
 * Permanently delete the signed-in account (server function purges photos and
 * the auth user; rows cascade). Resolves on success; throws otherwise.
 */
export async function deleteAccount(): Promise<void> {
  const supabase = requireClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not signed in.');
  const { deleteAccountUrl } = await import('@/config');
  const response = await fetch(deleteAccountUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: '{}',
  });
  if (!response.ok) {
    throw new Error('Account deletion failed — please contact support.');
  }
  await supabase.auth.signOut().catch(() => {}); // session is already invalid
}

export async function signOut(): Promise<void> {
  const supabase = getSupabase();
  if (supabase) await supabase.auth.signOut();
}

export async function currentUser(): Promise<AuthUser | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  return user ? { id: user.id, email: user.email ?? undefined } : null;
}

export function onAuthChange(cb: (user: AuthUser | null) => void): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session: Session | null) => {
    const user = session?.user;
    cb(user ? { id: user.id, email: user.email ?? undefined } : null);
  });
  return () => data.subscription.unsubscribe();
}
