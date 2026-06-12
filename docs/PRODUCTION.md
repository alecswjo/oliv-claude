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
  top analyzer in the precedence `proxy → local Claude key → offline estimator`.
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
- 279 unit tests pass; `tsc` strict clean; full Metro bundle clean.

## What remains for real users (gap analysis)

**Social graph over the DB (data layer is ready; UI wiring is the next step)**
- Feed/Discover/profiles read from `repo.fetchFeed/fetchDiscover/fetchStats`
  instead of seeded demo data when signed in; olives/comments on *other users'*
  meals (feed items not in the local store) go straight through the repo.

**Auth**
- **Sign in with Apple** (effectively required for a social iOS app): add
  `expo-apple-authentication` + enable the Apple provider; map to Supabase auth.
- In-app **account deletion** (Apple requirement once accounts exist).

**Trust & safety (required before opening real UGC)**
- Image moderation (non-food / inappropriate uploads) and comment moderation.
- Report / block users; abuse + rate handling.

**AI hardening**
- Per-user rate limits and cost caps on the proxy; response caching.
- Optional server-side re-validation of the analysis (defense in depth).
- Nutrition accuracy: validate estimates against USDA FoodData Central.

**Legal / compliance**
- Privacy policy + ToS; GDPR/CCPA data export & delete (you now store PII + photos).

**Ops & release**
- Crash reporting (Sentry), analytics, backend logging/metrics.
- EAS Build → TestFlight; APNs push (engagement); CI/CD.
- Designed app icon set (current icons are generated procedurally).

## Deploy

See `supabase/README.md` for the four steps (db push → enable auth → set
`OPENAI_API_KEY` + deploy function → set `.env`).
