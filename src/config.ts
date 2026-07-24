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

/**
 * The texting agent's phone number (E.164). Unset ⇒ the "Text your meals"
 * settings card is hidden. Set EXPO_PUBLIC_OLIV_AGENT_NUMBER in `.env`.
 */
export const AGENT_NUMBER = process.env.EXPO_PUBLIC_OLIV_AGENT_NUMBER ?? '';

/**
 * RevenueCat public SDK keys. These are intentionally build-time public
 * values; RevenueCat secret API keys and webhook auth never belong in Expo.
 */
export const REVENUECAT_IOS_API_KEY =
  process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? '';
export const REVENUECAT_ANDROID_API_KEY =
  process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ?? '';
export const REVENUECAT_ENTITLEMENT_ID =
  process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID ?? 'pro';

/** Oliv's contact card (name + logo) — saved by users so the thread isn't a bare number. */
export function agentContactCardUrl(): string {
  return `${SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/public/agent-assets/oliv.vcf`;
}

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
