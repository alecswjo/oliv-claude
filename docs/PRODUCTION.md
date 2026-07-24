# Oliv — Production Architecture & Roadmap

This document answers the three productionization questions and tracks what's
built vs. what remains before real users.

## Where data lives

| Concern | Local/offline mode (default) | Backend mode (`.env` configured + signed in) |
|---|---|---|
| Meals, profile, social | Zustand → AsyncStorage (on device) | **Postgres** (Supabase) |
| Meal photos | file URI in app documents dir | **Supabase Storage** (private bucket + viewer-authorized signed URLs) |
| Accounts/auth | local generated profile id | **Supabase Auth** (email, Google, native Apple; provider configuration required) |
| AI key | deterministic offline estimator | **server-side** provider keys on Edge Functions |
| Social feed | seeded demo PRNG | DB query over real follows (data layer ready) |
| Privacy enforcement | client filter | **Row-Level Security** in Postgres |

The app is **local-first**: stores remain the source of truth / offline cache,
and when signed in to a configured backend, mutations write through to Supabase
(`src/services/sync.ts`). Unset the two `EXPO_PUBLIC_SUPABASE_*` vars and the app
is exactly the original offline build.

## The server-side key (every call uses your key)

- `supabase/functions/analyze/` verifies the caller's Supabase JWT, calls the
  configured provider with a **server-side** key, and returns a
  `MealAnalysis`. Provider keys never ship in the app binary.
- Analysis supports `ANALYZE_PROVIDER=openai|anthropic|google`; texting chat
  independently supports the same providers via `CHAT_PROVIDER`.
- Client: `ProxyMealAnalyzer` (`src/services/analyzer/proxyAnalyzer.ts`) is the
  top analyzer in the precedence `proxy → offline estimator`.
  Any AI failure still falls back to the deterministic estimator.

## What's built in this milestone

- **Database**: full schema + indexes + RLS + `meal-photos` bucket
  (`supabase/migrations/`). Privacy & moderation rules from the spec enforced in SQL.
- **Server-key proxy**: deployed-ready Edge Function (OpenAI gpt-5.5), authed,
  provider-pluggable. *(unit-tested client; live-tested with your key)*
- **Client data layer**: `src/services/supabase/` — client, typed row↔domain
  mappers (unit-tested), auth, repositories (profiles/meals/social), photo upload.
- **Auth + gating**: `authStore`, sign-in screen, tab gate; backend mode requires
  sign-in, hydrates profile + meals on launch.
- **Write-through sync**: own meals, profile, olives/comments, photo upload mirror
  to Supabase when signed in (`src/services/sync.ts`), gated + non-blocking.
- Text-first onboarding, agent linking/memory/recaps, signed private photos,
  an owner dashboard, and RevenueCat subscription surfaces are also built.

## What remains for real users (gap analysis)

**Done in the production-hardening pass (June 2026)**
- UUID client ids (backend writes work), durable pending-op sync log with
  replay, cross-account cache guard, hydrate-failure retry gate.
- Privacy: owner-only `profiles` rows + `public_profiles` projection,
  security-invoker `profile_stats`, Keychain-backed sessions, storage
  size/MIME caps.
- Abuse guards: per-user daily analyzer quota, input caps, timeouts both
  sides, sanitized errors.
- Compliance: in-app account deletion (`delete-account` function), privacy
  policy + ToS screens, report/block (reports + blocks tables), Sign in with
  Apple (native flow; provider config pending), demo-content labeling,
  privacy manifest + export-compliance keys, eas.json, opaque app icon.

**Still open**
- Apple provider credentials in the Supabase dashboard (Services ID/key) and
  Google OAuth production consent screen; reviewer demo account.
- Host the privacy policy at a public URL for App Store Connect metadata.
- Moderation actions and audit history beyond the read-only report queue.
- Crash reporting, privacy-safe analytics, APNs production validation, and CI.
- App Store Connect/RevenueCat product, trial, offer-code, and webhook setup.
- Multi-device conflict policy beyond last-write-wins (updated_at guard,
  tombstones for deletes).

## Deploy

See `supabase/README.md` for database, auth, provider, agent, subscription, and
app configuration.
