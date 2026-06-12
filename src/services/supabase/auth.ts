import type { Session } from '@supabase/supabase-js';
import { getSupabase } from './client';

/** Auth wrappers. All no-op/throw cleanly when the backend isn't configured. */

export interface AuthUser {
  id: string;
  email?: string;
}

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
