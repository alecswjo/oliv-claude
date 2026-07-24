# Oliv backend (Supabase)

The production backend: Postgres (data) + Storage (photos) + Auth (accounts) +
an Edge Function that proxies meal-photo analysis so the **LLM key lives only on
the server**.

```
supabase/
  migrations/0001_schema.sql      tables, enums, indexes, RLS policies
  migrations/0002_storage.sql     `meal-photos` bucket + owner-scoped storage policies
  migrations/0003_photo_paths.sql multi-photo meals (photo_paths text[])
  migrations/0004_privacy_safety.sql owner-only profiles + public_profiles view,
                                  security-invoker profile_stats, reports/blocks,
                                  analyze_usage, bucket size/MIME limits
  migrations/0005_analyze_quota.sql bump_analyze_usage() (service-role only)
  functions/analyze/              POST proxy → configured LLM (quota + caps + timeout)
  functions/agent-inbound/        Sendblue webhook → texting coach + meal capture
  functions/agent-analyze/        internal signed meal-analysis endpoint
  functions/agent-recap/          opt-in local-time daily recaps
  functions/revenuecat-webhook/   subscription lifecycle → entitlement mirror
  functions/delete-account/       POST — purges storage + deletes the auth user
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
of the box). While no SMTP server is configured, also turn on auto-confirm
(Authentication → Providers → Email → "Confirm email" off) or sign-ups will
wait on a rate-limited confirmation mail.

### OAuth (Google / Apple)

The app's sign-in screen has "Continue with Google/Apple" buttons (PKCE flow:
full-page redirect on web, in-app browser + code exchange on native). Each
provider needs credentials pasted into dashboard → **Authentication →
Providers**:

- **Google**: create an OAuth client (type "Web application") in
  [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
  with authorized redirect URI
  `https://<PROJECT-REF>.supabase.co/auth/v1/callback`, then paste the client
  id + secret into the Google provider.
- **Apple**: in the Apple Developer portal create a **Services ID** with
  "Sign in with Apple" enabled and the same callback URL, plus a key for the
  Sign in with Apple capability; paste the Services ID (client id) and the
  generated secret JWT into the Apple provider. (Native iOS builds should
  eventually use the native Apple button — see docs/PRODUCTION.md.)

For native deep-link redirects, add the app scheme to dashboard →
**Authentication → URL Configuration → Redirect URLs**: `oliv://**` (plus
`exp://**` while testing in Expo Go, and your web origin, e.g.
`http://localhost:8081/**`, for web dev).

## 3. Analysis proxy (the server-side key)

```bash
supabase secrets set ANALYZE_PROVIDER=openai
supabase secrets set OPENAI_API_KEY=sk-...        # never goes in the app
supabase secrets set OPENAI_MODEL=gpt-5.5
supabase functions deploy analyze
supabase functions deploy delete-account
```

The function authenticates the caller via their Supabase JWT, calls the
configured provider, and returns a normalized `MealAnalysis`. Anthropic and
Google are implemented too; set `ANALYZE_PROVIDER`, the matching server key,
and model. Text chat uses `CHAT_PROVIDER` and `CHAT_MODEL`.

### Texting agent

Use distinct secrets for every trust boundary:

```bash
supabase secrets set SENDBLUE_WEBHOOK_SECRET=<sendblue-webhook-secret>
supabase secrets set AGENT_SECRET=<random-internal-secret>
supabase secrets set SENDBLUE_API_KEY=<key> SENDBLUE_API_SECRET=<secret>
supabase secrets set SENDBLUE_FROM_NUMBER=<e164>
supabase functions deploy agent-analyze --no-verify-jwt
supabase functions deploy agent-inbound --no-verify-jwt
supabase functions deploy agent-recap --no-verify-jwt
```

Configure Sendblue's webhook without a query secret:
`https://<ref>.supabase.co/functions/v1/agent-inbound`. Sendblue supplies the
configured secret in the `sb-signing-secret` header.

### Subscriptions

Create the `pro` entitlement and monthly current offering in RevenueCat, then:

```bash
supabase secrets set REVENUECAT_WEBHOOK_AUTH=<long-random-value>
supabase secrets set REVENUECAT_ENTITLEMENT_ID=pro
supabase functions deploy revenuecat-webhook --no-verify-jwt
```

Set RevenueCat's webhook Authorization header to the exact secret. Verify
sandbox purchase, renewal, expiration, restore, and Apple offer-code events
before setting `REQUIRE_ACTIVE_SUBSCRIPTION=true` on the agent.

## 4. Point the app at it

In the repo root, copy `.env.example` → `.env` and fill in
`EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` (dashboard →
Project Settings → API). Restart `npx expo start`. The app now requires sign-in,
stores meals/profile/photos on the server, and routes every analysis through the
proxy. Add the RevenueCat public SDK keys to enable the paywall. Unset the
Supabase variables and it reverts to local/offline mode.

## Smoke test the proxy directly

```bash
# get a user JWT first (sign up via the app, or the Auth API), then:
curl -X POST "$EXPO_PUBLIC_SUPABASE_URL/functions/v1/analyze" \
  -H "Authorization: Bearer <USER_JWT>" \
  -H "content-type: application/json" \
  -d '{"description":"grilled chicken with brown rice and broccoli","mealType":"dinner"}'
# → { "analysis": { "calories": ..., "confidence": "...", ... } }
```
