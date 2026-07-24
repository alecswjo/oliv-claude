import { isBackendConfigured } from '@/config';
import { backendActive, currentUserId } from '@/services/sync';

/**
 * Linking the Oliv texting agent (docs/AGENT_V0_SPEC.md §11).
 * Mirrors the sync.ts pattern: Supabase modules are dynamically imported and
 * everything is gated on backend mode, so the offline/test graph never loads
 * the SDK.
 */

export interface AgentLink {
  phone: string;
  linkedAt: string;
}

export interface AgentLinkToken {
  token: string;
  expiresAt: string;
}

/** The signed-in user's active agent link, if any. */
export async function fetchAgentLink(): Promise<AgentLink | null> {
  if (!backendActive()) return null;
  const { getSupabase } = await import('@/services/supabase/client');
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('channel_identities')
    .select('external_sender_id, linked_at')
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw error;
  return data ? { phone: data.external_sender_id, linkedAt: data.linked_at } : null;
}

/** Mint a one-time link code (server-side hashed; 15-minute expiry). */
export async function mintAgentLinkToken(): Promise<AgentLinkToken> {
  if (!backendActive()) throw new Error('Sign in to connect the agent');
  const { getSupabase } = await import('@/services/supabase/client');
  const supabase = getSupabase();
  if (!supabase) throw new Error('Backend not configured');
  let timezone: string | null = null;
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    // leave null — the gateway falls back gracefully
  }
  const { data, error } = await supabase.rpc('mint_link_token', { p_timezone: timezone });
  if (error) throw error;
  return { token: (data as { token: string }).token, expiresAt: (data as { expiresAt: string }).expiresAt };
}

/** Disconnect this account's texting link (gateway refuses the number after). */
export async function revokeAgentLink(): Promise<void> {
  const userId = currentUserId();
  if (!userId || !isBackendConfigured()) return;
  const { getSupabase } = await import('@/services/supabase/client');
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase
    .from('channel_identities')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('status', 'active');
  if (error) throw error;
}
