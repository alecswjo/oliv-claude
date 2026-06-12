# Oliv — Product Specification

**Version:** 1.2 (post-review — incorporates the 20-finding spec review; see `SPEC_REVIEW.md`)
**Platform:** iOS (built with Expo / React Native)
**Status:** Approved for implementation

---

## 1. Overview

Oliv is a social, AI-powered healthy-food tracker for iOS. Users log meals by snapping a photo (plus an optional description); on-device flows send the image to a vision LLM that estimates **calories, macronutrients, and a Health Score out of 5**. Meals appear on the user's personal feed (the app's main page), and a social layer lets users follow friends and see what they're eating — turning nutrition tracking from a chore into a shared habit.

**Positioning:** "Cal AI meets Instagram." Cal AI proved photo-first calorie logging removes friction; Oliv adds the accountability and inspiration of a social feed plus an opinionated *healthiness* signal (the Health Score) rather than calories alone.

### 1.1 Why "Oliv"

Olive = the archetypal healthy food. The brand system uses an olive-green palette and rates meals in "olives" (🫒 1–5). Likes are called **olives** ("give an olive").

---

## 2. Goals & Non-Goals

### Goals (V1)
1. **Zero-friction logging:** photo + optional text → full nutrition estimate in one tap.
2. **Healthiness at a glance:** every meal gets a deterministic, explainable Health Score (1–5 olives).
3. **Personal accountability:** main page is *your* feed with a daily summary (calories remaining, macro progress, streak).
4. **Social motivation:** follow people, browse a feed of their meals, react with olives and comments.
5. **Trustworthy AI:** user can review and edit every AI estimate before saving; estimates carry a confidence level.
6. **Works offline / without an API key:** a deterministic built-in estimator powers the full experience in demo mode; the Claude-powered analyzer activates when an API key is configured.

### Non-Goals (V1)
- Android support (codebase is cross-platform-ready, but V1 targets iOS).
- Barcode scanning, food-database search, restaurant menus.
- Real backend / real accounts. V1 is local-first with seeded demo users for the social experience; all services are defined behind interfaces so a backend can be swapped in (see §10.4).
- Push notifications, messaging/DMs.
- Wearable / Apple Health integration.
- Monetization.

---

## 3. Target Users & Personas

| Persona | Need | Key features |
|---|---|---|
| **Maya, 27 — fitness-curious professional** | Wants to eat healthier but hates weighing food and database searches | Photo logging, Health Score, daily summary |
| **Jake, 32 — accountability seeker** | Sticks with habits only when friends are watching | Social feed, streaks, olives/comments |
| **Priya, 41 — health-condition manager** | Needs macro awareness (protein up, sugar down) without obsession | Macro targets, score explanations, trends |

---

## 4. Core User Journeys

### J1 — First run (onboarding)
1. Welcome screen (brand promise: "Snap. Score. Share.").
2. Profile setup: display name, username, avatar (emoji + color).
3. Body & goal inputs: sex, age, height, weight, activity level, goal (lose / maintain / gain).
4. App computes daily calorie & macro targets (user may override).
5. Lands on **My Feed** with an empty state prompting the first meal log. Demo users are pre-seeded and a "find people to follow" card links to Discover.

### J2 — Log a meal (the core loop)
1. Tap the center **Log** tab button (camera icon).
2. Take a photo or choose from the library (photo optional — description alone works).
3. Optionally add a description ("chicken caesar, light dressing") and pick meal type (breakfast/lunch/dinner/snack; pre-selected by time of day).
4. Tap **Analyze** → loading state ("Reading your plate…").
5. Review screen: detected food items, calories, protein/carbs/fat, fiber/sugar/sodium, confidence badge, Health Score with per-factor explanation.
6. User can edit any number or item; Health Score recomputes live.
7. **Save** → meal lands on top of My Feed; daily summary updates; streak updates.

### J3 — Check yourself (main page)
1. Open app → **My Feed**.
2. Header: today's calories consumed vs target (ring), macro bars, streak flame, average Health Score today.
3. Below: reverse-chronological timeline of own meals grouped by day.
4. Tap any meal → detail (full nutrition, score breakdown, social activity on it).

### J4 — Social
1. **Social** tab → feed of meals from followed users (newest first).
2. Empty state → Discover list (suggested users with stats: streak, avg score).
3. Tap user → profile (bio, stats, meal grid/timeline, Follow/Unfollow).
4. Give an olive 🫒 (like) or comment on any meal in the feed.
5. Own meals are visible to followers by default; a meal can be marked **private** at save time (or default-private via Settings).

### J5 — Progress
1. **Progress** tab → streak card, last-7-days calorie bar chart vs target, average Health Score trend, totals (meals logged, current/longest streak).

---

## 5. Feature Requirements

### F1 — Onboarding & Goal Engine
- **F1.1** Collect: display name (required, 1–30 chars), username (required, 3–20 chars, `[a-z0-9_]`), avatar emoji + color (defaults provided).
- **F1.2** Collect: sex (male/female/unspecified), age (13–100), height (cm), weight (kg), activity level (sedentary/light/moderate/active/very active), goal (lose/maintain/gain). Imperial input supported via unit toggle; stored metric.
- **F1.3** Compute targets with **Mifflin-St Jeor BMR** × activity multiplier ± goal adjustment (lose −500, gain +300, maintain +0 kcal). Calorie floor 1,200 kcal. If sex unspecified, use the midpoint of the male/female constants (−78).
  - Activity multipliers: sedentary 1.2, light 1.375, moderate 1.55, active 1.725, very active 1.9.
  - **Rounding:** the calorie target is rounded to the nearest whole kcal *after* the goal adjustment (and floor).
- **F1.4** Macro targets from calories: protein = 1.6 g/kg body weight (min 20% / max 35% of calories), fat = 27.5% of calories, carbs = remainder. **Rounding:** protein and fat round to the nearest gram first; carbs = round((kcal − 4·roundedP − 9·roundedF)/4), clamped ≥ 0. For typical lighter users the 20% floor (not 1.6 g/kg) is the binding protein rule — this is intended.
  - **Reference vectors (normative, unit-tested):**
    | Body | BMR | Calories | P/F/C |
    |---|---|---|---|
    | M 32y, 180 cm, 84 kg, moderate, gain | 1810 | **3106** | 155P (20% floor) / 95F / 408C |
    | F 27y, 165 cm, 62 kg, light, lose | 1355.25 | **1363** | 99P (1.6 g/kg) / 42F / 147C |
- **F1.5** User may override calorie/macro targets (sane bounds: calories 1,000–6,000; macros ≥ 0 and macro-calories within ±25% of calorie target). The 1,000 override floor is deliberately below the engine's 1,200 floor — overrides are the user's call; the engine never *recommends* below 1,200.
- **F1.6** Onboarding is skippable after profile step; skipping uses default targets — **2,000 kcal, 100P / 263C / 61F** (derived by applying F1.4 to 2,000 kcal at the 20% protein floor) — and flags `goalsAreDefault` so Settings nudges setup.
- **F1.7** Username must not collide with a seeded demo username (case-insensitive); onboarding shows "That username is taken."

### F2 — AI Meal Logging
- **F2.1** Inputs: photo (camera or library, optional), description (0–500 chars, optional), meal type. **At least one of photo/description is required.**
- **F2.2** Analysis returns a `MealAnalysis`:
  - `foodItems: string[]` (1–10 items)
  - `calories` (kcal), `proteinG`, `carbsG`, `fatG`, `fiberG`, `sugarG`, `sodiumMg`, `saturatedFatG`
  - `fruitVegServings` (0–10, halves allowed)
  - `processingLevel` (1–4, NOVA-inspired: 1 unprocessed → 4 ultra-processed)
  - `confidence` (`high` / `medium` / `low`)
- **F2.3** The **Health Score is computed client-side** from the analysis via the deterministic algorithm in §6 — never trusted from the model — so edits recompute it identically.
- **F2.4** Review & edit: every numeric field and the item list are editable; score recomputes live; edited results are marked `source: 'ai-adjusted'`.
- **F2.5** Analyzer selection: if a Claude API key is configured → `ClaudeMealAnalyzer` (see §7); otherwise → built-in `EstimateMealAnalyzer` (deterministic keyword model, see §7.4). On Claude failure (network/refusal/parse), fall back to the estimator and tag confidence `low`, surfacing a non-blocking notice.
- **F2.6** Analysis must validate & clamp all values to sane ranges, in this exact order:
  1. Clamp each number to its range (calories 0–5,000; NaN/missing/negative → 0; processing 1–4; FV 0–10).
  2. **Macro-energy rescale:** if `calories > 0` and `macroEnergy = 4P + 4C + 9F > 0` and `|macroEnergy − calories| / calories > 0.25`, multiply P, C, F by `calories / macroEnergy` (calories win — they're the headline number). If either side is 0, skip the rescale.
  3. **Sub-nutrient caps (after rescale):** fiber ≤ carbs, sugar ≤ carbs, saturated fat ≤ fat.
  4. Food items: trim, drop empties, cap 10 items × 60 chars; empty list → `['Meal']`. Invalid confidence → `low`.
- **F2.7** Manual logging path: user can skip analysis and type numbers directly (`source: 'manual'`). The manual form collects the eight nutrition numbers plus optional fruit/veg servings (default **0**) and processing level (default **2**); `confidence` is stored as `high` and the confidence badge is hidden for manual meals.
- **F2.8** Post-save edit semantics: editable fields are description, meal type, all nutrition numbers, food items, fruit/veg, processing level, and privacy. Editing any analysis-derived number flips `source` `ai → ai-adjusted` (`manual` stays `manual`). `loggedAt` is not editable in V1 (no backdating). Deleting a meal updates summaries and streaks; **longest streak is recomputed from remaining history** (it can go down).
- **F2.9** Permission denial UX: if camera permission is denied, show an inline notice with an "Open Settings" action; the photo-library and description-only paths remain available. Analysis is never blocked by a missing photo.

### F3 — Personal Feed (Main Page)
- **F3.1** Default tab on launch (post-onboarding).
- **F3.2** Header **Daily Summary Card**: calories eaten / target with progress ring, remaining kcal, three macro bars (P/C/F eaten vs target), streak flame with day count, today's average Health Score.
- **F3.3** Timeline of own meals, newest first, grouped under day headers ("Today", "Yesterday", "Mon, Jun 8"). Each **MealCard** shows photo (or food-emoji tile), title (top food items), time, meal-type chip, calories, macro pills, Health Score badge, olive/comment counts, privacy indicator if private.
- **F3.4** Pull-to-refresh recomputes summaries. Empty state with CTA to log first meal.

### F4 — Social Layer
- **F4.1** Follow model: one-way follows (like Instagram). Local `SocialService` seeds **10 demo users** with realistic profiles and ~2 weeks of meal history each. Demo content is generated **once at first run** from a fixed-seed PRNG with stable IDs and then persisted; user interactions (olives/comments/follows) are stored as deltas keyed by those stable IDs, so nothing is orphaned across restarts. No content top-up in V1 (history simply ages).
- **F4.2** **Social feed**: meals of followed users, newest first; pagination by 20. Excludes private meals. Includes the user's own public meals (so the feed reads like a community timeline) — own meals carry a "You" badge.
- **F4.3** **Discover**: suggested-user list (not-yet-followed demo users) with avatar, bio, current streak, avg Health Score; follow button inline.
- **F4.4** **Olives (likes)**: toggle per meal; count shown; optimistic update.
- **F4.5** **Comments**: flat list per meal, 1–280 chars, newest last; author + relative time. The user can delete their own comments anywhere, and **any comment on their own meals** (owner moderation). Demo users have seeded comments on some meals.
- **F4.6** **Profiles**: own profile (avatar, bio edit, stats: meals logged, current streak, followers/following counts, avg score) and other-user profiles (same stats + Follow/Unfollow + their public meal timeline). **Follower-count sourcing:** demo users carry seeded baseline follower/following counts (display-only) which adjust live by ±1 when the current user follows/unfollows them; the current user's follower count = seeded demo users who follow *them* (3 at first run, stored as `followerIds`).
- **F4.7** Privacy: per-meal `private` flag; private meals never appear in social feed or on the public profile view, and show a lock badge on My Feed. Default privacy configurable in Settings.

### F5 — Health Score (the opinionated core)
- Deterministic 1.0–5.0 score in 0.5 steps, computed per §6, displayed as olives (filled/half/empty) plus numeric value.
- Every score ships with a **breakdown**: list of `{factor, label, delta}` contributions ("High fiber +0.45", "Ultra-processed −0.9") shown on the review and detail screens. Tiny meals (<30 kcal) get the single informational row "Too small to score" (delta 0).
- Daily average score = mean of the day's meal scores (weighted equally, tiny meals' 3.0 included), shown to one decimal.

### F6 — Progress & Streaks
- **F6.1** Streak = consecutive calendar days (user's local timezone) with ≥1 logged meal, counting back from today; **today does not break the streak if empty until the day ends** (i.e., streak counts back from today if today has a meal, else from yesterday). Longest streak is **recomputed from current meal history** whenever meals change (so deletions can lower it).
- **F6.2** Last-7-days bar chart: calories per day vs target line (rendered with simple Views — no chart dependency). The target line uses the **current** calorie target for all 7 days (no per-day goal history in V1).
- **F6.3** Aggregate stats: total meals, current streak, longest streak, 7-day avg calories, 7-day avg Health Score.

### F7 — Settings
- Edit profile & goals (re-runs goal engine or manual override).
- Units toggle (metric/imperial) for input display.
- Default meal privacy (public/private).
- Claude API key entry (stored via `expo-secure-store`; masked display; "test key" action). Explanatory copy that demo mode works without it. **Test key** performs a free Models-API lookup and reports one of three states: "Key works" / "Invalid key" (auth error) / "Couldn't reach Anthropic — check your connection" (network error).
- Reset demo data / sign out (clears local store, returns to onboarding).

---

## 6. Health Score Algorithm (normative)

The score is **rule-based and unit-tested** — not an LLM output — so it is consistent, explainable, and recomputable after edits. The LLM supplies only the raw analysis inputs.

### 6.1 Inputs
From `MealAnalysis`: `calories`, `proteinG`, `carbsG`, `fatG`, `fiberG`, `sugarG`, `sodiumMg`, `saturatedFatG`, `fruitVegServings`, `processingLevel`. Factors 2 and 5–7 use densities **per 100 kcal** to stay portion-size-neutral (factor 1 uses protein's share of energy; factors 3, 4, 8 use raw values). Meals with `calories < 30` (e.g., black coffee) short-circuit to score 3.0 with the single breakdown row "Too small to score"; they count normally in daily averages.

### 6.2 Factors (deltas applied to base 3.0)

| # | Factor | Definition | Delta |
|---|---|---|---|
| 1 | **Protein density** | proteinG×4 / calories (protein share of energy) | ≥0.30 → **+0.8**; ≥0.20 → **+0.5**; ≥0.12 → **+0.2**; <0.12 → 0 |
| 2 | **Fiber density** | fiberG per 100 kcal | ≥2.5 → **+0.7**; ≥1.5 → **+0.45**; ≥0.7 → **+0.2**; else 0 |
| 3 | **Fruit & veg** | servings | ≥3 → **+0.6**; ≥2 → **+0.4**; ≥1 → **+0.25**; ≥0.5 → **+0.1**; else 0 |
| 4 | **Whole foods** | processingLevel | 1 → **+0.4**; 2 → **+0.15**; 3 → **−0.25**; 4 → **−0.9** |
| 5 | **Sugar load** | sugarG per 100 kcal | ≥7 → **−1.0**; ≥4 → **−0.6**; ≥2.5 → **−0.3**; else 0 |
| 6 | **Sodium load** | sodiumMg per 100 kcal | ≥400 → **−0.6**; ≥250 → **−0.35**; ≥150 → **−0.15**; else 0 |
| 7 | **Saturated fat** | satFatG per 100 kcal | ≥2.5 → **−0.6**; ≥1.5 → **−0.35**; ≥0.8 → **−0.15**; else 0 |
| 8 | **Calorie bomb** | calories per meal | >1200 → **−0.4**; >900 → **−0.2**; else 0 |

`score = clamp(round2half(3.0 + Σ deltas), 1.0, 5.0)` where `round2half` rounds to the nearest 0.5 (ties round up).

**Numeric robustness (normative):** all deltas are multiples of 0.05, so implementations must accumulate in **integer hundredths** (e.g. +80, −35) and only divide at the end — binary-float summation can land a true 4.25 tie at 4.2499…, flipping the rounding. Tier thresholds use `≥` except the calorie-bomb factor, which is a strict `>` on 900/1200 (expressed above as ≥901/≥1201 on whole-kcal inputs).

### 6.3 Reference outcomes (acceptance tests)
| Meal (typical analysis values) | Σ deltas | Expected |
|---|---|---|
| Grilled salmon + quinoa + broccoli (520 kcal, 42P, 38C, 21F, 8 fiber, 5 sugar, 380 sodium, 4 satfat, 2.5 FV, level 1) | +0.8 +0.45 +0.4 +0.4 = **+2.05** | **5.0** |
| Chicken caesar salad, light (430 kcal, 35P, 18C, 24F, 4 fiber, 3 sugar, 740 sodium, 6 satfat, 1.5 FV, level 2) | +0.8 +0.2 +0.25 +0.15 −0.15 −0.15 = **+1.10** | **4.0** |
| Frozen pepperoni pizza, 3 slices (850 kcal, 36P, 90C, 38F, 5 fiber, 9 sugar, 1900 sodium, 16 satfat, 0.5 FV, level 4 — pepperoni is ultra-processed) | +0.2 +0.1 −0.9 −0.15 −0.35 = **−1.10** | **2.0** |
| Glazed donut + latte (540 kcal, 9P, 70C, 24F, 1 fiber, 38 sugar, 320 sodium, 11 satfat, 0 FV, level 4) | −0.9 −1.0 −0.35 = **−2.25** → 0.75, ties-up → | **1.0** |
| Oatmeal + berries + almonds (380 kcal, 12P, 58C, 12F, **10** fiber, 12 sugar, 95 sodium, 1.5 satfat, 1 FV, level 1) | +0.2 +0.7 +0.25 +0.4 −0.3 = **+1.25** → 4.25, ties-up → | **4.5** |

(The implementation's unit tests must assert these exact values. Rows 4–5 deliberately exercise the ties-round-up rule; row 1's satfat density 0.769 and row 4's sugar density 7.037 deliberately sit just off tier boundaries.)

### 6.4 Breakdown copy
Each nonzero factor emits a human label: e.g. Protein density +0.8 → "Excellent protein"; Sugar −1.0 → "Very high sugar"; Processing 4 → "Ultra-processed". Full label table lives beside the implementation and is unit-tested for coverage of every tier.

---

## 7. AI Integration Spec

### 7.1 Service abstraction
```ts
interface MealAnalyzer {
  readonly kind: 'claude' | 'estimate';
  analyze(input: { photoBase64?: string; photoMediaType?: string;
                   description?: string; mealType: MealType }): Promise<MealAnalysis>;
}
```
`AnalyzerProvider` returns `ClaudeMealAnalyzer` when a key is configured, else `EstimateMealAnalyzer`. All UI talks to the interface only.

### 7.2 Claude analyzer
- **Model:** `claude-opus-4-8` (vision-capable; the current default Claude model).
- **Transport:** official `@anthropic-ai/sdk` (TypeScript) — fetch-based, works in React Native/Hermes.
- **Request:** single `messages.create` call; user content = optional base64 `image` block (`media_type` from the picked asset; photo resized to **long edge ≤ 1568 px**, JPEG quality 0.7 via `expo-image-manipulator` — keeps the image at ≤ ~1.6 k tokens and well under size limits) + a `text` block containing the description/meal type; **structured output** via `output_config.format` (`json_schema`) matching `MealAnalysis` exactly (`additionalProperties: false`); `max_tokens: 16000`.
- **System prompt:** instructs the model to act as a registered-dietitian-grade nutrition estimator: estimate the *entire pictured portion*, reconcile photo vs description (description wins for invisible details like "light dressing"), return realistic US-portion values, set `confidence` honestly (`low` when the photo is ambiguous or absent), `processingLevel` per NOVA, and `fruitVegServings` in standard servings.
- **Response handling:** parse the first `text` block as JSON → validate/clamp per F2.6 → compute Health Score client-side. Check `stop_reason`; a `refusal` or parse failure triggers the estimator fallback (F2.5).
- **Key handling:** key is user-supplied in Settings, kept in `expo-secure-store`, passed to the SDK at call time; never logged, never bundled.
- **Production note (explicit):** shipping a direct-to-Anthropic call with a user-pasted key is a **demo/dev architecture**. The launch architecture must proxy through a backend (key server-side, per-user rate limits, abuse controls). The `MealAnalyzer` interface is the seam where the proxy client replaces the direct client; this is a V1-ship blocker for App Store release, documented as such.
- **Privacy:** photos leave the device only for analysis and are not retained by Oliv anywhere except the user's local library/app storage.

### 7.3 Structured-output schema (summary)
JSON schema with required fields exactly matching F2.2, numeric ranges enforced post-hoc in the validator (the API schema constrains types/enums; numeric clamps happen client-side since JSON-schema numeric bounds aren't supported by structured outputs).

### 7.4 Built-in estimator (demo mode & fallback)
Deterministic keyword model over the description (and meal type when no text): a curated table of ~60 food keywords → per-serving nutrition templates; quantity words ("two", "double", "large", "small") scale portions; unknown text falls back to meal-type-typical defaults. Same output type. **Confidence rule:** ≥1 lexicon match → `medium`; meal-type fallback → `low`. Fully unit-tested with exact reference vectors; **never random**, so the demo and tests are stable.

### 7.5 Cost & latency expectations
One analysis ≈ 1 image (≤ ~1.6 k tokens at the 1568-px resize target; Opus 4.8 accepts up to 2576 px / ~4.8 k tokens but we downscale for cost) + ~700 prompt tokens + ~300 output tokens → roughly $0.02–0.04 per meal at Opus 4.8 pricing. Target p50 latency < 6 s (manual, non-CI criterion); UI shows progressive loading copy and is cancelable.

---

## 8. Data Model

```ts
type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
type Confidence = 'high' | 'medium' | 'low';
type MealSource = 'ai' | 'ai-adjusted' | 'manual';

interface NutritionFacts {
  calories: number; proteinG: number; carbsG: number; fatG: number;
  fiberG: number; sugarG: number; sodiumMg: number; saturatedFatG: number;
}

interface MealAnalysis extends NutritionFacts {
  foodItems: string[];
  fruitVegServings: number;     // 0–10
  processingLevel: 1 | 2 | 3 | 4;
  confidence: Confidence;
}

interface ScoreFactor { factor: string; label: string; delta: number }
interface HealthScore { value: number; factors: ScoreFactor[] }

interface Comment { id: string; userId: string; text: string; createdAt: string }

interface Meal {
  id: string; userId: string;
  photoUri?: string;            // local URI; seed meals use emoji tiles instead
  emoji?: string;               // fallback tile for photo-less meals
  description: string;          // user text or generated title
  mealType: MealType;
  loggedAt: string;             // ISO datetime
  nutrition: NutritionFacts;
  foodItems: string[];
  fruitVegServings: number;
  processingLevel: 1 | 2 | 3 | 4;
  confidence: Confidence;
  healthScore: HealthScore;
  source: MealSource;
  isPrivate: boolean;
  oliveUserIds: string[];       // likes
  comments: Comment[];
}

interface Goals { dailyCalories: number; proteinG: number; carbsG: number; fatG: number }

interface UserProfile {
  id: string; username: string; displayName: string;
  avatarEmoji: string; avatarColor: string; bio: string;
  joinedAt: string;
  goals: Goals; goalsAreDefault: boolean;
  body?: { sex: 'male'|'female'|'unspecified'; age: number; heightCm: number;
           weightKg: number; activity: ActivityLevel; goal: 'lose'|'maintain'|'gain' };
  defaultPrivate: boolean;
  longestStreak: number;        // recomputed from history on meal changes
  isDemo: boolean;              // seeded account
  /** Demo users only: seeded display-only baseline counts (F4.6). */
  baselineFollowers?: number;
  baselineFollowing?: number;
}

interface FollowState {
  followingIds: string[];       // who the current user follows
  followerIds: string[];        // seeded demo users who follow the current user
}
```

Persistence: Zustand stores hydrated from AsyncStorage (`oliv/v1/*` keys, versioned for migration). Photos stay as file URIs (copied into app documents dir on save). Secure data (API key) in SecureStore, never in AsyncStorage.

---

## 9. Information Architecture & Screens

```
(onboarding)  welcome → profile → body & goals → targets review
(tabs)
  index      My Feed (main page)         [tab 1]
  social     Social feed + Discover      [tab 2]
  log        ── center action button ──  [opens /log modal]
  progress   Charts & streaks            [tab 3]
  profile    Own profile                 [tab 4]
/log          Log-meal modal (photo → analyze → review → save)
/meal/[id]    Meal detail (nutrition, score breakdown, olives, comments)
/user/[id]    Other-user profile
/settings     Settings (from profile header)
```

### Visual system
- Palette: olive `#708238` (primary), deep olive `#3D4A1F`, cream `#FAF7F0` (bg), charcoal `#23231F` (text), terracotta `#C96F4A` (accents/negative), soft green `#E4EAD5` (fills).
- Type: system font (SF Pro), generous weights; numbers tabular.
- Health Score badge: 1–5 olive glyphs + numeric chip, color-graded (≥4 olive, ≥3 amber-olive, <3 terracotta).
- Cards: white, radius 16, soft shadow; spacing rhythm 4/8/12/16/24.

---

## 10. Non-Functional Requirements

1. **Performance** *(manual, non-CI criteria)*: feed scroll 60 fps on iPhone 12+; analysis UI never blocks; images compressed before upload.
2. **Offline-first:** every feature except Claude analysis works with no network (estimator covers logging).
3. **Persistence integrity:** all writes go through store actions; hydration is versioned; corrupt storage falls back to clean state without crashing.
4. **Replaceable services:** `MealAnalyzer`, `SocialService`, and persistence are interfaces — a future backend swaps implementations without UI changes.
5. **Accessibility:** all interactive elements have `accessibilityLabel`/`Role`; score badges include text equivalents ("4.5 out of 5"); touch targets ≥ 44 pt; color is never the only signal.
6. **Security/privacy:** API key in SecureStore; no analytics SDKs in V1; photos never leave device except to Anthropic during analysis.
7. **Quality bar:** TypeScript strict; unit tests for all domain logic (score, goals, streaks, summaries, validators, estimator); store tests; component/screen tests for the core loop; CI-runnable via `npm test`.

---

## 11. Success Metrics (definitions for V2 instrumentation)
- North star: **meals logged per weekly-active user** (target ≥ 10).
- D7 retention ≥ 35%; median time-to-log < 25 s; % meals receiving social interaction ≥ 25%; AI-estimate edit rate < 40% (proxy for estimate quality).

---

## 12. Out of Scope / V2 Candidates
Real backend & auth, Android, barcode scan, water/exercise tracking, Apple Health sync, notifications, weekly AI coach recap, score algorithm personalization, meal favorites/recipes, image retention & CDN, moderation tooling (required before real UGC ships).

---

## 13. Acceptance Criteria (V1 definition of done)
1. Fresh install → onboarding → computed targets match the §F1.4 reference vectors exactly.
2. Logging via description only (no photo, no API key) produces a meal whose nutrition matches the estimator's reference vectors (§7.4), a Health Score with breakdown, and updates the daily summary — fully offline.
3. With a (mocked) Claude response, the same flow uses the Claude analyzer, validates/clamps values, and computes the same score the algorithm dictates.
4. §6.3 reference meals produce exactly the listed scores (unit-tested).
5. My Feed groups meals by day and the summary card reflects today's totals, remaining calories, and streak per §F6.1.
6. Following a demo user inserts their meals into the Social feed; unfollowing removes them; olives and comments persist across app restarts.
7. Private meals never render in Social feed or public profile.
8. Deleting a meal updates summary, streak, and feeds.
9. `npm test` passes with the full suite (domain + stores + services + components) and `tsc --noEmit` is clean.
