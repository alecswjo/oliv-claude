# Spec Review — Findings & Resolutions

An independent review pass was run against `PRODUCT_SPEC.md` v1.1 before implementation
(recomputing all normative arithmetic by hand). All findings were resolved in spec v1.2.
This file is the traceability record.

| # | Severity | Finding (abridged) | Resolution |
|---|---|---|---|
| 1 | BLOCKER | §6.3 reference table contradicted §6.2 for 2 of 5 meals: pizza computes 2.5 (not 2.0) with level 3 / 1900 mg sodium (223.5 mg/100 kcal < 250 tier) and 850 kcal ≤ 900; oatmeal computes 4.0 (not 4.5) with 9 g fiber (2.368/100 kcal < 2.5 tier) | Pizza reclassified processing level 4 ("frozen pepperoni pizza" — pepperoni is ultra-processed): Σ −1.10 → 1.90 → **2.0**. Oatmeal fiber 9→10 g: Σ +1.25 → 4.25 ties-up → **4.5**. All five rows re-verified; Σ-deltas column added to the table |
| 2 | MAJOR | F1.6 skip-defaults (100P/250C/61F @ 2,000 kcal) violate the F1.4 carbs-remainder rule (formula yields 263 g) | Default carbs corrected to **263 g**; noted as derived |
| 3 | MAJOR | No rounding rules or goal-engine test vectors despite exact-match acceptance | Rounding rules added (kcal nearest int; P/F nearest gram; carbs from rounded P/F); two normative vectors added (3106/155/95/408 and 1363/99/42/147) |
| 4 | MAJOR | F2.6 rescale underspecified (target, order vs caps, zero cases) | Normative 4-step order added: clamp → rescale by `kcal/macroEnergy` (skip if either is 0) → sub-nutrient caps → item/confidence sanitation |
| 5 | MAJOR | Manual-entry path didn't define FV/processing/confidence | Manual form: FV default 0, processing default 2, confidence stored `high`, badge hidden |
| 6 | MAJOR | "Regenerated deterministically" conflicted with persistent interactions | Seed **once at first run**, stable IDs, persisted; interactions as deltas; no top-up in V1 |
| 7 | MAJOR | Follower counts had no data source | Demo users get seeded baseline counts (±1 live adjust); current user gets seeded `followerIds` (3 demo followers) |
| 8 | MINOR | Binary-float delta summation can flip ties (true 4.25 landing at 4.2499…) | Spec mandates integer-hundredths accumulation; implementation updated accordingly |
| 9 | MINOR | Tiny-meal short-circuit vs "every score has a breakdown"; per-100kcal sentence over-broad | "Too small to score" row defined; averages include tiny meals; density sentence scoped to factors 2, 5–7 |
| 10 | MINOR | Override floor 1,000 vs engine floor 1,200 unexplained | Stated as intentional |
| 11 | MINOR | Camera-permission denial UX unspecified | F2.9 added (inline notice + Open Settings; library/description paths unaffected) |
| 12 | MINOR | Post-save edit semantics undefined | F2.8 expanded: edit surface, `ai → ai-adjusted` transition, no backdating, longest-streak recompute on delete |
| 13 | MINOR | 7-day chart target ambiguous after goal changes | Current target used for all 7 days (stated) |
| 14 | MINOR | Username collisions with demo users | F1.7 added (case-insensitive validation) |
| 15 | MINOR | Estimator confidence rule undefined; §13.2 untestable | Rule defined (match → `medium`, fallback → `low`); acceptance now references exact estimator vectors |
| 16 | MINOR | Image-token claim used the pre-4.7 cap; no resize target | Resize target long edge ≤ 1568 px @ JPEG 0.7 specified; token math corrected (verified: model id `claude-opus-4-8` and `output_config.format` are current — unchanged) |
| 17 | MINOR | "Test key" states undefined | Three states defined (valid / auth / network) via free Models-API lookup |
| 18 | MINOR | 60 fps / latency targets not CI-verifiable | Marked as manual, non-CI criteria |
| 19 | MINOR | `expo-file-system` missing for photo persistence; no `test` script | Dependency added; `test`/`typecheck` scripts added in Phase 0 |
| 20 | MINOR | Comment moderation on own meals unspecified | Owner may delete any comment on their own meal |

Verified as correct by the review (no change needed): goal-engine formula plausibility
(worked example 2069.64 kcal / 103P / 63F / 273C), clamp behavior at score extremes,
macro-energy tolerance of all reference meals, model ID `claude-opus-4-8`,
`output_config.format` structured-output parameter, and the §13 criteria's Jest-testability.
