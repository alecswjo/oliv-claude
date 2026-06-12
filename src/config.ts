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

/** Where report-content / support emails go; shown in Settings and Legal. */
export const SUPPORT_EMAIL = 'support@oliv.app';

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

const configured = SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
if (SUPABASE_URL.length > 0 && !isValidUrl(SUPABASE_URL)) {
  // A malformed URL would otherwise explode deep inside the Supabase client.
  // eslint-disable-next-line no-console
  console.warn(`[oliv] EXPO_PUBLIC_SUPABASE_URL is not a valid URL — running offline`);
}
if (SUPABASE_URL.length > 0 !== SUPABASE_ANON_KEY.length > 0) {
  // eslint-disable-next-line no-console
  console.warn('[oliv] only one EXPO_PUBLIC_SUPABASE_* var is set — running offline');
}

export function isBackendConfigured(): boolean {
  return configured && isValidUrl(SUPABASE_URL);
}

function functionUrl(name: string): string {
  return `${SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/${name}`;
}

/** Full URL of the meal-analysis Edge Function. */
export function analyzeFunctionUrl(): string {
  return functionUrl('analyze');
}

/** Full URL of the account-deletion Edge Function. */
export function deleteAccountUrl(): string {
  return functionUrl('delete-account');
}
