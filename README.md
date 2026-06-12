# Oliv 🫒

**A social, AI-powered healthy-food tracker for iOS.** Snap a photo of your meal — Oliv estimates the calories and macros, scores how healthy it is out of 5 olives, and shares it (if you want) with the people who follow you.

> Snap. Score. Share.

| | |
|---|---|
| **Platform** | iOS (Expo SDK 56 / React Native 0.85 / TypeScript strict) |
| **AI** | Server-side proxy (Supabase Edge Function → OpenAI gpt-5.5, key never ships in the app), with a deterministic offline estimator as demo mode & fallback |
| **State** | Zustand + AsyncStorage (local-first), Keychain (SecureStore) for auth sessions |
| **Tests** | 258 Jest tests — domain, services, stores, components, and screen flows |

---

## What it does

- **Photo-first logging (Cal AI-style).** Photo and/or a one-line description → calories, protein/carbs/fat, fiber/sugar/sodium/saturated fat, detected food items, and a confidence level. Everything is editable before saving.
- **Health Score (1–5 olives).** A deterministic, explainable rule-based score — protein & fiber density, fruit/veg servings, processing level (NOVA-inspired), sugar/sodium/saturated-fat load, and portion size. Every score ships with a factor-by-factor breakdown ("Excellent protein +0.8", "Ultra-processed −0.9"). The algorithm is spec'd normatively in [`docs/PRODUCT_SPEC.md` §6](docs/PRODUCT_SPEC.md) and locked by reference tests.
- **My Feed (main page).** Daily summary — calorie dial, macro bars, streak, average score — above a day-grouped timeline of your meals.
- **Social.** Follow people, browse what they eat, give olives 🫒 and comment. Ships with 10 seeded demo eaters (with ~2 weeks of deterministic meal history) so the feed is alive on first run. Per-meal privacy keeps any meal off the social surfaces.
- **Progress.** Streaks (current & longest), 7-day calorie chart vs target, 7-day average score.
- **Goal engine.** Mifflin-St Jeor BMR × activity ± goal → calorie target; protein 1.6 g/kg (clamped 20–35% of calories), fat 27.5%, carbs the remainder. Manual override with validation.

## Offline mode vs backend mode

Oliv is fully usable **offline with no backend**: a deterministic keyword estimator (~60-food lexicon, quantity modifiers, meal-type fallbacks) powers analysis. Configure the two `EXPO_PUBLIC_SUPABASE_*` env vars (see `.env.example`) and the app gains accounts (email, Google, Apple), cross-device sync, and real photo analysis through the server-side proxy (`supabase/functions/analyze`) — the LLM key never ships in the app. Any proxy failure falls back to the estimator with a notice.
## Running it

```bash
npm install
npx expo start        # then press i for the iOS simulator, or scan with Expo Go
```

The repo was built and tested in a Linux CI environment (no Xcode), so verification there is:

```bash
npm test              # full Jest suite (jest-expo)
npm run typecheck     # tsc --noEmit (strict)
npx expo export --platform web   # full Metro bundle of every route
```

## Backend (production) mode

By default Oliv runs fully **local/offline** (on-device storage, seeded demo
social, AI key pasted in Settings). Configure a **Supabase** backend and it
becomes a real multi-user app: accounts (Auth), meals/profile in **Postgres**,
photos in **Storage**, and a server-side-key **proxy** so every analysis call
uses *your* OpenAI key (the key never ships in the app). It's gated on two env
vars — unset them and you're back to offline mode.

- Deploy: `supabase/README.md` (db push → enable Email auth → set `OPENAI_API_KEY` + deploy the `analyze` function → fill `.env`).
- Architecture & production roadmap: `docs/PRODUCTION.md`.

## Project layout

```
docs/                 PRODUCT_SPEC.md · SPEC_REVIEW.md · IMPLEMENTATION_PLAN.md · PRODUCTION.md
supabase/             migrations (schema + RLS + storage) · functions/analyze (server-key proxy)
src/
  domain/             pure logic: health score, goals, validation, streaks, summaries, dates
  services/           analyzer (proxy + estimator), supabase (data layer), sync, safety, seeds, storage
  store/              zustand stores: user, meals, social, app, auth (+ pure selectors)
  components/         theme + UI kit + feature components
  app/                expo-router routes (tabs, log, meal/user detail, settings, onboarding, sign-in)
__tests__/            mirrors src; 279 tests
```

**Layering rule:** `app → components → store → services → domain`; `domain/` imports nothing above it.

## The Health Score, briefly

Every meal starts at **3.0**. Positive factors: protein share of energy (≤ +0.8), fiber per 100 kcal (≤ +0.7), fruit/veg servings (≤ +0.6), whole foods (+0.4). Negative: sugar per 100 kcal (≥ −1.0), ultra-processing (−0.9), sodium (≥ −0.6), saturated fat (≥ −0.6), oversized meals (≥ −0.4). Clamped 1–5, rounded to 0.5 (ties up), accumulated in integer hundredths so floating point can never flip a tie. Grilled salmon + quinoa + broccoli → **5.0**; a glazed donut + latte → **1.0**.

## Docs

- [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md) — full product spec (v1.2, normative)
- [`docs/SPEC_REVIEW.md`](docs/SPEC_REVIEW.md) — the 20-finding pre-implementation review and resolutions
- [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) — architecture, build order, test plan

*AI nutrition estimates are approximations, not medical advice.*
