# Oliv — Production Architecture & Roadmap

This document answers the three productionization questions and tracks what's
built vs. what remains before real users.

## Where data lives

| Concern | Local/offline mode (default) | Backend mode (`.env` configured + signed in) |
|---|---|---|
| Meals, profile, social | Zustand → AsyncStorage (on device) | **Postgres** (Supabase) |
| Meal photos | file URI in app documents dir | **Supabase Storage** (`meal-photos` bucket, public-read) |
| Accounts/auth | local generated profile id | **Supabase Auth** (email; Apple = next) |
| AI key | user-pasted, on device (demo) | **server-side** env var on the Edge Function |
| Social feed | seeded demo PRNG | DB query over real follows (data layer ready) |
| Privacy enforcement | client filter | **Row-Level Security** in Postgres |

The app is **local-first**: stores remain the source of truth / offline cache,
and when signed in to a configured backend, mutations write through to Supabase
(`src/services/sync.ts`). Unset the two `EXPO_PUBLIC_SUPABASE_*` vars and the app
is exactly the original offline build.

## The server-side key (every call uses your key)

- `supabase/functions/analyze/` — an Edge Function that verifies the caller's
  Supabase JWT, calls **OpenAI gpt-5.5** with the **server-side** `OPENAI_API_KEY`,
  and returns a `MealAnalysis`. The key never ships in the app binary.
- Provider-pluggable: add Gemini/Anthropic in `providers.ts` and flip
  `ANALYZE_PROVIDER`. Model is `OPENAI_MODEL` (default `gpt-5.5`).
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
- 291 unit tests pass; `tsc` strict clean; full Metro bundle clean.

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
- Social graph over the DB (data layer ready; Feed/Discover/profiles still
  render seeded demo data — wire `repo.fetchFeed/fetchDiscover/fetchStats`).
- Apple provider credentials in the Supabase dashboard (Services ID/key) and
  Google OAuth production consent screen; reviewer demo account.
- Host the privacy policy at a public URL for App Store Connect metadata.
- Image/comment moderation tooling beyond report+block (a review queue).
- Signed URLs (or per-meal ACL) for photos of private meals — the bucket is
  public-read; uuid paths are unguessable but links are shareable.
- Crash reporting (Sentry), analytics, APNs push, CI/CD, designed icon set.
- Multi-device conflict policy beyond last-write-wins (updated_at guard,
  tombstones for deletes).

## Deploy

See `supabase/README.md` for the four steps (db push → enable auth → set
`OPENAI_API_KEY` + deploy function → set `.env`).
