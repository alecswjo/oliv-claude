/**
 * Backend configuration, read from Expo public env vars (inlined at build).
 * When these are unset the app runs in fully local/offline mode exactly as
 * before — every backend feature is gated on `isBackendConfigured()`.
 *
 * Set in `.env` (see .env.example):
 *   EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
 */

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export function isBackendConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}

/** Full URL of the meal-analysis Edge Function. */
export function analyzeFunctionUrl(): string {
  return `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/analyze`;
}
