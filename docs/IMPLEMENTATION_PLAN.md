# Oliv — Implementation Plan

Companion to `PRODUCT_SPEC.md`. Defines the technical architecture, module layout, build order, and test plan for V1.

---

## 1. Stack & Rationale

| Choice | Why |
|---|---|
| **Expo SDK 56 / React Native 0.85 / React 19 / TypeScript strict** | Real iOS app from a single TS codebase; scaffolded with `create-expo-app` (expo-router template) so native config is correct by construction. |
| **expo-router (file-based, JS `Tabs`)** | Standard Expo navigation. We use the stable JS tabs (not `unstable-native-tabs`) because they're customizable (center Log button) and render under Jest. |
| **Zustand + AsyncStorage persistence** | Tiny, testable state management; stores are plain functions → unit-testable without rendering. Custom `persist` wiring with versioned keys (`oliv/v1/*`). |
| **`@anthropic-ai/sdk`** | Official TS SDK (fetch-based, RN-compatible) for the Claude vision analyzer. |
| **expo-image-picker / expo-image-manipulator / expo-secure-store** | Camera+library access; JPEG downscale before upload; secure API-key storage. |
| **jest-expo + @testing-library/react-native** | The whole test pyramid runs on Linux CI — domain, stores, services, components, screens. |
| **No chart/icon/date libraries** | Bars and rings are plain Views; icons are emoji/text; date math is ~80 lines of tested code. Keeps the dependency surface small. |

**Environment constraint:** this machine has no Xcode/simulator. Verification is `tsc --noEmit`, `expo-doctor`-style config sanity, and the Jest suite. The app boots on a Mac with `npx expo start` → Expo Go / dev client.

---

## 2. Module Layout

```
src/
  app/                          # expo-router routes (thin: compose components + stores)
    _layout.tsx                 # root Stack, store hydration gate, onboarding redirect
    onboarding.tsx              # 3-step onboarding (profile → body/goals → targets)
    (tabs)/_layout.tsx          # Tabs: index, social, progress, profile + center Log button
    (tabs)/index.tsx            # My Feed (main page)
    (tabs)/social.tsx           # Social feed + Discover
    (tabs)/progress.tsx         # Charts & streaks
    (tabs)/profile.tsx          # Own profile
    log.tsx                     # Log-meal modal (photo → analyze → review → save)
    meal/[id].tsx               # Meal detail (score breakdown, olives, comments)
    user/[id].tsx               # Other-user profile
    settings.tsx
  domain/                       # PURE logic — no React, no IO. 100% unit-tested.
    types.ts                    # All shared types (§8 of spec)
    healthScore.ts              # §6 algorithm + factor labels
    goals.ts                    # Mifflin-St Jeor, activity, macro split, overrides
    nutritionValidation.ts      # clamp/rescale rules (F2.6)
    summaries.ts                # daily totals, grouping by day, averages
    streaks.ts                  # streak computation (F6.1)
    dates.ts                    # local-day keys, relative labels, 7-day windows
    ids.ts                      # id generation (crypto-free, collision-safe)
  services/
    analyzer/
      types.ts                  # MealAnalyzer interface + AnalyzeInput
      claudeAnalyzer.ts         # @anthropic-ai/sdk vision + structured output
      estimateAnalyzer.ts       # deterministic keyword estimator (demo/fallback)
      foodLexicon.ts            # ~60 keyword → nutrition templates
      provider.ts               # picks analyzer based on stored key; fallback logic
    seed/
      seedUsers.ts              # 10 demo profiles
      seedMeals.ts              # deterministic 2-week meal histories (seeded PRNG)
    storage.ts                  # AsyncStorage JSON wrapper (versioned, safe-parse)
    secureKey.ts                # SecureStore wrapper for the API key
    photos.ts                   # copy-to-documents + compress helpers
  store/
    userStore.ts                # profile, goals, onboarding state
    mealStore.ts                # own meals CRUD + selectors (today, byDay)
    socialStore.ts              # demo users, follows, olives, comments, feed selector
    appStore.ts                 # hydration status, settings (units, default privacy)
  components/
    ui/ (Screen, Card, Button, TextField, Chip, ProgressBar, Ring, Section, EmptyState)
    HealthScoreBadge.tsx        # olives + numeric chip
    MacroPills.tsx
    DailySummaryCard.tsx
    MealCard.tsx
    ScoreBreakdown.tsx
    UserRow.tsx / UserAvatar.tsx
    CommentList.tsx
    theme.ts                    # palette, spacing, typography (replaces template theme)
__tests__/ (mirrors src; *.test.ts[x])
```

**Dependency rule:** `app → components → store → services → domain`. `domain/` imports nothing from upper layers; components never touch services directly.

---

## 3. Key Design Decisions

### 3.1 State & persistence
- Each store is `create<State & Actions>()` with explicit actions; a small `persistStore` helper subscribes and writes JSON to AsyncStorage (debounced 150 ms) and exposes `hydrate()`.
- Root layout awaits `hydrateAll()` before rendering routes (splash holds); corrupt JSON → `safeParse` returns `undefined` → store keeps defaults (NFR-3).
- Selectors (e.g. `selectTodaySummary`, `selectFeed`) are pure functions over store state living beside the store → unit-testable without React.

### 3.2 Analyzer pipeline (F2)
```
LogScreen → provider.getAnalyzer() → analyzer.analyze(input)
        → validateAnalysis() (clamp/rescale)
        → computeHealthScore()
        → ReviewSheet (editable) → mealStore.addMeal()
```
- `claudeAnalyzer` builds: system prompt (frozen string constant), user content `[image?, text]`, `output_config.format` json_schema, `max_tokens: 16000`, model `claude-opus-4-8`. Errors → typed `AnalyzerError` → provider falls back to estimator and annotates `confidence: 'low'`.
- `estimateAnalyzer` tokenizes the description, matches the lexicon (longest-phrase-first), sums templates × quantity modifiers, else meal-type default. Pure & deterministic.

### 3.3 Social layer (F4)
- `socialStore` holds: `demoUsers`, `demoMeals` (generated once per install from a fixed-seed PRNG — mulberry32 — so content is stable), `followingIds`, plus olives/comments **deltas** keyed by meal id (so seeded content stays immutable and user interactions persist).
- Feed selector merges followed users' public demo meals + own public meals, sorts desc, paginates.

### 3.4 Time & streaks
- All "day" logic uses **local** dates via `dates.ts` (`dayKey(date) = YYYY-MM-DD` local). Streak per F6.1 computed from the set of dayKeys of own meals; pure function `computeStreak(dayKeys, today)`.

### 3.5 Theming/UI
- Single `theme.ts` with the §9 palette; light mode only in V1 (dark later). Template's themed components are removed.
- The center Log tab is a `Tabs.Screen` with a custom button that `router.push('/log')` instead of switching tabs.

---

## 4. Build Order (with verification gates)

| Phase | Deliverable | Gate |
|---|---|---|
| 0 | Scaffold merged; deps installed; jest-expo wired; placeholder test green | `npm test`, `tsc --noEmit` |
| 1 | `domain/` complete (types, score, goals, validation, summaries, streaks, dates) | Full domain unit suite incl. §6.3 reference table |
| 2 | `services/` (storage, estimator+lexicon, claude analyzer, provider, seeds, secureKey, photos) | Service unit suite (SDK mocked) |
| 3 | `store/` (user, meal, social, app) + selectors | Store tests (AsyncStorage mocked) |
| 4 | `components/` UI kit + feature components | Component render/interaction tests |
| 5 | `app/` routes: onboarding → tabs → log flow → detail/profile/settings | Screen tests for core loop |
| 6 | Branding (app.json, icons/colors), README, CLAUDE.md | `tsc`, full suite, manual route audit |
| 7 | Final: lint pass, docs sync, commit & push | All green |

Commits at each phase boundary (small, descriptive); single push at the end per remote-branch rules (then push again if review fixes follow).

---

## 5. Test Plan

### 5.1 Domain (highest density)
- `healthScore`: all 8 factors' tier boundaries (≥ edges exactly), §6.3 five reference meals exact values, rounding ties (4.25→4.5), clamping (0.75→1.0), tiny-meal short-circuit, factor-label coverage.
- `goals`: Mifflin-St Jeor vectors (male/female/unspecified), activity multipliers, goal deltas, 1,200 floor, macro split + protein % bounds, override validation bounds.
- `nutritionValidation`: clamps, macro-energy rescale (|4P+4C+9F−kcal|>25%), sub-nutrient caps (fiber≤carbs etc.), NaN/negative input hardening.
- `streaks`: empty, today-only, gap cases, "today empty doesn't break yesterday's streak", longest-streak tracking, month/year boundaries.
- `summaries` & `dates`: totals per day, group ordering, "Today/Yesterday" labels, 7-day window across month edge.

### 5.2 Services
- `estimateAnalyzer`: known phrases → expected templates; quantity words; multi-item sums; unknown → meal-type default; determinism (two calls identical).
- `claudeAnalyzer`: SDK client injected/mocked — asserts request shape (model id, base64 image block, schema in `output_config.format`, max_tokens), parses good response, surfaces `refusal` stop_reason, malformed-JSON → typed error.
- `provider`: no key → estimator; key → claude; claude throws → estimator fallback with `low` confidence.
- `storage`: round-trip, corrupt JSON → undefined, version key prefix.
- `seedMeals`: deterministic across runs; all seed meals pass validation; spread over ~14 days.

### 5.3 Stores
- `mealStore`: add/edit/delete; selectors (today totals, byDay grouping); persistence write & hydrate round-trip.
- `socialStore`: follow/unfollow idempotence; feed selector (privacy filter, sort, own-meals inclusion); olive toggle; comment add/delete (own only).
- `userStore`: onboarding completion, goal recompute vs override, defaults flag.

### 5.4 Components / screens (RTL)
- `HealthScoreBadge` (olive count + a11y label), `DailySummaryCard` (numbers, over-target state), `MealCard` (fields, private lock, olive tap), `ScoreBreakdown` (factor rows).
- Screens: Log flow (type description → Analyze → review shows estimate → Save → mealStore contains meal), My Feed (groups + summary), Social (follow in Discover → meal appears in feed), Meal detail (comment add).

### 5.5 Conventions
- jest-expo preset, `@testing-library/react-native`; AsyncStorage official mock; SecureStore/ImagePicker/router mocked per test; fake timers for date-dependent tests (fixed "now": 2026-06-10T12:00 local).
- Coverage goal: domain/services ≥ 95% lines; overall ≥ 80%. No snapshot tests (brittle) — assert semantics.

---

## 6. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| SDK 56 is newer than tooling knowledge | Pin versions via `npx expo install`; verify jest-expo preset against installed major; keep test config minimal. |
| `@anthropic-ai/sdk` in RN/Hermes quirks | Service consumes an injected client factory; tests mock it; runtime guarded try/catch with estimator fallback either way. |
| React 19 / RTL compatibility | Use latest @testing-library/react-native major; if renderer friction arises, screens stay thin so logic tests don't depend on rendering. |
| Health-score tuning feels wrong | Algorithm table is normative & versioned (`SCORE_VERSION = 1`); changes require updating reference tests deliberately. |
| Demo-only architecture mistaken for prod | Spec §7.2 marks backend proxy as App-Store blocker; README repeats it. |
