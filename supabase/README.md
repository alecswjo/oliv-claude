# Oliv backend (Supabase)

The production backend: Postgres (data) + Storage (photos) + Auth (accounts) +
an Edge Function that proxies meal-photo analysis so the **LLM key lives only on
the server**.

```
supabase/
  migrations/0001_schema.sql    tables, enums, indexes, RLS policies, profile_stats view
  migrations/0002_storage.sql   `meal-photos` bucket + owner-scoped storage policies
  functions/analyze/            POST proxy → OpenAI gpt-5.5 (provider-pluggable)
```

## One-time setup

```bash
npm i -g supabase            # or: brew install supabase/tap/supabase
supabase login
supabase link --project-ref <YOUR-PROJECT-REF>
```

## 1. Database + storage

```bash
supabase db push             # applies migrations/*.sql
```

This creates the `profiles / meals / follows / olives / comments` tables, the
`meal-photos` storage bucket, and Row-Level Security that enforces the app's
privacy rules (private meals are owner-only; a comment is deletable by its
author or the meal owner).

## 2. Auth

In the dashboard → **Authentication → Providers**, enable **Email** (works out
of the box). For production, also enable **Sign in with Apple** (required for a
social iOS app) — see docs/PRODUCTION.md.

## 3. Analysis proxy (the server-side key)

```bash
supabase secrets set OPENAI_API_KEY=sk-...        # required — never goes in the app
supabase secrets set OPENAI_MODEL=gpt-5.5         # optional (default gpt-5.5)
supabase functions deploy analyze
```

The function authenticates the caller via their Supabase JWT, calls OpenAI with
the server-side key, and returns a normalized `MealAnalysis`. To add another
provider later, implement it in `functions/analyze/providers.ts` and set
`ANALYZE_PROVIDER`.

## 4. Point the app at it

In the repo root, copy `.env.example` → `.env` and fill in
`EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` (dashboard →
Project Settings → API). Restart `npx expo start`. The app now requires sign-in,
stores meals/profile/photos on the server, and routes every analysis through the
proxy. Unset those two vars and it reverts to local/offline mode.

## Smoke test the proxy directly

```bash
# get a user JWT first (sign up via the app, or the Auth API), then:
curl -X POST "$EXPO_PUBLIC_SUPABASE_URL/functions/v1/analyze" \
  -H "Authorization: Bearer <USER_JWT>" \
  -H "content-type: application/json" \
  -d '{"description":"grilled chicken with brown rice and broccoli","mealType":"dinner"}'
# → { "analysis": { "calories": ..., "confidence": "...", ... } }
```
