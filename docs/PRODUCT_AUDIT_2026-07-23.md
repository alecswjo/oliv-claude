# Oliv product and codebase audit

Audit date: July 23–24, 2026
Branch: `codex/text-first-production`

## Executive view

Oliv has a strong technical core: pure and reference-tested nutrition math,
local-first storage with a durable sync queue, a server-key analyzer, real
Supabase RLS, multi-photo meals, account deletion, and a surprisingly capable
texting gateway. The product should now be described and built as:

> An AI nutrition coach in Messages, backed by an app for review, trends,
> corrections, social accountability, and account control.

The biggest opportunity is not another dashboard feature. It is completing the
message-first loop so that capture, correction, follow-up, memory, subscription,
and debugging are reliable enough to disappear into the user's day.

The branch implements the highest-leverage parts of that direction:

- a text-first onboarding demonstration before profile questions;
- a final “put Oliv in your contacts” setup step;
- one-tap return to the Oliv message thread from the app;
- durable, explicit agent memory with user-visible deletion;
- opt-in daily text recaps;
- provider-pluggable meal analysis and chat (OpenAI, Anthropic, Google);
- faster photo capture, durable run recovery, and stronger idempotency;
- private meal-photo storage with viewer-authorized signed URLs;
- a responsive owner/admin console;
- RevenueCat paywall, restore, introductory offers, and Apple offer-code
  redemption;
- a server-side RevenueCat entitlement mirror and optional paid-agent gate;
- explicit permission before in-app meal data is sent to an AI provider;
- less punitive streak language and a flexible weekly consistency goal;
- a production-oriented iOS icon concept.

This is not yet a responsible “ready to press Submit” build. The remaining
blockers are mostly external configuration, observability, clinical/legal
review, and end-to-end validation—not another architectural rewrite.

## What the best products teach

### Cal AI

Cal AI wins on immediate proof: a short lifestyle onboarding flows directly
into the magic moment—photograph food, see a structured estimate. Its useful
lesson is to demonstrate value before asking for a long profile. Oliv's new
first onboarding screen applies that pattern to the differentiated interaction:
the user sees a meal logged and corrected in a Messages-like thread before
building targets.

Do not copy the weaker pattern of presenting vision output as exact. Oliv should
show its largest assumption and keep correction one reply away.

Sources: [Cal AI](https://calai.app/),
[Cal AI on the App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)

### Poke and Poke Fit

Poke's durable advantages are message-native behavior, concise replies,
persistent memory, inline conversational context, scheduled work, and
proactive follow-up. Poke also demonstrates that the official long-term iOS
route is Apple Messages for Business, not an iMessage extension pretending to
be a remote bot.

Oliv should copy the interaction model, not the general-purpose agent
complexity:

- one normalized channel envelope;
- deterministic tools for nutrition mutations;
- compact bounded conversation history;
- typed memory retrieved only when relevant;
- asynchronous operations with immediate acknowledgment;
- opt-in, high-signal follow-ups;
- a rich app as the audit/deep-analysis surface.

Sources: [Poke](https://poke.com/), [Poke pricing](https://poke.com/pricing),
[Poke release notes](https://poke.com/docs/release-notes),
[Poke Fit](https://poke.com/fit)

### Illume Labs

Illume's strongest idea is longitudinal context across nutrition, sleep,
training, wearables, and biomarkers, while keeping text as the front door. Oliv
should earn the right to expand into those domains in order:

1. reliable meal capture and correction;
2. nutrition preferences and repeat-meal learning;
3. Apple Health read-only context;
4. sleep/recovery correlations stated as patterns, not causes;
5. labs only with clinical governance.

The current product must not market itself as a dietitian. “AI nutrition coach”
or “health companion” is the correct launch boundary.

Sources: [Illume Labs](https://www.illumelabs.ai/),
[Illume privacy](https://www.illumelabs.ai/privacy)

## P0: blockers before public App Store submission

### External and release configuration

- Host the Privacy Policy and Terms at stable public HTTPS URLs and put those
  URLs in App Store Connect. In-app screens alone are insufficient.
- Configure Sign in with Apple in Apple Developer and Supabase, verify account
  name/email edge cases, and provide App Review a working demo account or
  documented passwordless path.
- Create the App Store subscription group and monthly product, configure its
  introductory free trial, attach it to RevenueCat's current offering, and map
  the `pro` entitlement.
- Configure the RevenueCat webhook and test purchase, renewal, cancellation,
  expiration, billing grace period, restore, account switch, and offer-code
  paths in sandbox.
- Do not set `REQUIRE_ACTIVE_SUBSCRIPTION=true` until the RevenueCat webhook has
  been tested against real sandbox events. Once enabled, billing lookup fails
  closed for the paid texting service.
- Decide whether friend access uses Apple's native offer codes (recommended)
  or a separately reviewed comp-grant system. Do not expose a custom code field
  that can be interpreted as an alternate digital-goods purchase route.
- Configure production Apple push credentials and verify notifications on a
  physical device.
- Complete the Sendblue production-number and messaging-consent review. In
  parallel, apply for Apple Messages for Business; Poke's approval sets the
  relevant precedent for clear AI identity and human-support fallback.

### Safety, health claims, and minors

- Have a registered dietitian review goal floors, next-meal guidance, Health
  Score explanations, proactive recap language, pregnancy/condition refusal
  copy, and eating-disorder-sensitive behavior.
- Have counsel review “nutrition coach,” automated text consent, health-data
  privacy, subscriptions, refund language, and the intended 13+ app / 18+
  texting split.
- The app now blocks a known under-18 profile from connecting texting. The
  skip-body path still relies on the adult attestation in the connect dialog;
  make age confirmation a durable server-side eligibility field before public
  launch.
- Add a human escalation/support plan before Apple Messages for Business.
  Never hardcode a country-specific crisis number in the model prompt; locale
  matters and hotlines change.
- Add a user-facing non-calorie mode before intentionally serving users with
  eating-disorder histories.

### Security and privacy

- Run all migrations against a staging clone and verify RLS with two real user
  accounts. Specifically test private photos, public photos, blocks, agent
  memory, reports, subscriptions, and admin RPC denial.
- Rotate `AGENT_SECRET`, `SENDBLUE_WEBHOOK_SECRET`,
  `REVENUECAT_WEBHOOK_AUTH`, and `NOTIFY_SECRET` before launch. They must be
  distinct high-entropy values.
- Keep Sendblue's webhook secret in `sb-signing-secret`; do not put it in a URL
  query string. The legacy query path is now explicit opt-in only.
- Complete a retention schedule for raw message text, outbound replies,
  temporary media, stored photos, model inputs, reports, and operational logs.
- Update the public privacy policy with exact processors, retention, training
  policy, and deletion exceptions for App Store transaction records.
- Provide data export. Account deletion exists, but access/export is also an
  expected health-data trust feature.
- Verify account deletion removes all storage objects and all non-cascading
  operational rows in staging. Document that Apple/RevenueCat transaction
  records may persist for legal/accounting purposes.
- Add dependency and secret scanning in CI. Supabase `.temp` is now ignored and
  removed from version control.

### Reliability and observability

- Add production crash reporting before TestFlight. Sentry or an equivalent
  must capture native JS errors, source maps, release/build, and breadcrumbs
  without meal/message content.
- Add privacy-safe product analytics. At minimum:
  onboarding started/completed, text link started/completed, first meal,
  first correction, first agent reply latency, paywall shown, trial started,
  restore, offer-code redemption, D1/D7/D30 retention, and notification
  opt-out. Never send health values, photos, or raw messages to analytics.
- CI now runs Expo Doctor, typecheck, Jest, a full web export, Deno checks, and
  a critical runtime-advisory gate. Add a staging database job for migration
  reset/RLS integration tests once CI has safe ephemeral Supabase credentials.
- Create alarms for failed agent runs, stuck runs, Sendblue failures, provider
  429/5xx, RevenueCat webhook failures, deletion failures, and push-token
  invalidation.
- Load-test the texting capture window with duplicated and out-of-order
  webhooks. The database now protects one open run and one outbound
  `client_ref`, but the full crash matrix still needs staging fault injection.
- Test on physical iPhones: HEIC, Live Photo selection, five-photo bursts,
  text-after-photo captions, poor network, app foreground sync, expired signed
  photo URLs, and account switching.

## P1: highest-value product work after the blockers

### Texting experience

- Voice notes: transcribe, show the transcript assumption, then use the same
  deterministic meal tools.
- Multiple meals in one message: split only when unambiguous, otherwise ask one
  question.
- Reply context: map “that,” a quoted reply, or an Apple inline reply to the
  exact meal rather than “last meal.”
- Deep links from replies to the exact meal and its correction history.
- “Fast” versus “precise” capture preference. Fast logs immediately; precise
  asks one high-impact question about portion, oil, sauce, or label.
- Saved meals, recipes, restaurant orders, and repeat-meal reuse. Corrections
  should improve the next instance instead of only the current row.
- Quiet hours, recap day selection, pause/snooze, and proactive-message
  frequency in the app—not only conversational commands.
- Delivery-state UX: if analysis is slow, acknowledge immediately and send one
  final result; if it fails, preserve the draft and provide a retry link.
- Channel abstraction for Sendblue/Spectrum now and Apple Messages for
  Business later. Provider IDs must remain opaque.

### Agent quality, memory, and speed

- Keep provider selection server-side. Analysis and chat already support
  OpenAI, Anthropic, and Google; add ordered fallback/circuit breaking rather
  than falling back on every single request independently.
- Log provider/model, latency, token usage, finish reason, schema failures, and
  fallback reason in an analysis-run table. Do not log raw health prompts in
  telemetry.
- Cache stable context (goals, preferences) and retrieve only the memory
  relevant to the current intent. Do not grow an unbounded system prompt.
- Add typed memory classes: explicit dietary facts, correction/repeat-meal
  memory, coaching style, schedule, and bounded conversation summaries.
- Give every memory an origin, confidence, last-used time, and deletion
  control. Explicit durable memory is implemented; inferred correction memory
  remains.
- Stream or acknowledge text turns quickly. The current photo path overlaps
  media prefetch with the two-second capture window and sends typing
  immediately; measure p50/p95 instead of tuning by feel.
- Ground structured nutrition in USDA FoodData Central and package labels.
  Vision should identify and estimate; deterministic sources should own known
  nutrition values.
- Create a prompt/evaluation set containing portion ambiguity, sauces, mixed
  dishes, multiple meals, correction chains, privacy commands, medical
  requests, prompt injection, and hostile images.

### App and onboarding

- Reduce onboarding to progressive disclosure:
  proof of text interaction → account → basic goal → optional personalization
  → connect texting → first meal. Height/weight/sex may be skipped without
  blocking first value.
- Ask dietary pattern, allergies, desired coaching tone, preferred reminder
  time, and whether calorie numbers feel useful. Only ask fields that change
  behavior.
- Add an “import my week” path after the first log, not before it.
- The text setup screen should confirm an actual linked message before
  declaring completion; today it polls inside the connection card.
- Use one terminology system. Remove stale references to direct Claude,
  public photo storage, demo-only social, and features that are now built.

### Retention without harm

- Optimize for “days with a useful check-in,” not maximal streak anxiety.
- Keep the exact daily streak, but pair it with a flexible five-of-seven
  consistency goal and explicit recovery language. This branch implements the
  first version.
- Celebrate 3/7/14/30-day milestones with a useful reflection (“protein at
  breakfast was more consistent”), not confetti alone.
- Offer a weekly “Olive Save” only if the app and agent share the same
  server-authoritative freeze state. Never let the two surfaces report
  different streaks.
- Use implementation intentions: let users set “after dinner I text Oliv,”
  then schedule around that routine.
- Prefer supportive missed-day copy. Do not say a user “failed,” “ruined,” or
  must log to make the day count.
- Add weekly wins, course corrections, and a single next action. Avoid
  leaderboards based on calorie restriction or body weight.
- Monitor notification opt-outs and eating-disorder safety reports as guardrail
  metrics, not just retention.

### Admin console

The branch includes a responsive, read-only operations dashboard with:

- users, meals, analyses, message volume, active text links, and Pro count;
- recent agent runs and errors;
- moderation reports.

Next:

- search by internal user id or masked phone suffix;
- inspect a redacted run timeline and provider latency;
- retry a failed run through an audited server action;
- revoke a channel link;
- suspend/reactivate a reported user;
- resolve reports with reason and moderator audit history;
- grant/revoke time-limited comp access;
- manage notification/provider feature flags and circuit breakers;
- see RevenueCat webhook history and entitlement mismatch;
- show deploy/version/config health without revealing secrets.

Every mutation needs a confirmation, reason, actor id, timestamp, and immutable
audit row. Do not make the service-role key available to the web client.

## P2: expansion opportunities

- Apple Health read-only import: steps, workouts, sleep, and energy, with
  explicit per-type permission and no advertising use.
- Meal-timing and recovery correlations, clearly labeled “pattern, not proof.”
- Barcode and nutrition-label OCR.
- Grocery/restaurant planning from preferences and remaining targets.
- Shared household recipes and meal templates.
- Small accountability circles and collaborative consistency goals.
- A web member portal only after the native/text loop has strong retention.
- Labs, CGM, or condition-specific programs only with clinical governance and
  a new regulatory review.

## Codebase findings by area

### Strong

- `src/domain/` is the right business-logic boundary.
- Health Score hundredths avoid float tie bugs and have reference tests.
- Analyzer outputs pass through one validator before scoring or saving.
- UUIDs, tombstones, and the persisted pending-op log protect local-first sync.
- Supabase stays dynamically imported and optional.
- Account deletion, Sign in with Apple, RLS, report/block, and notification
  preferences are real rather than placeholder checkboxes.
- The agent's photo path uses durable runs, idempotency keys, a capture window,
  prefetch, magic-byte validation, quota guards, and failure recovery.

### Needs attention

- Several documents describe architecture that has already changed. Treat code
  and migrations as source of truth until documentation is reconciled.
- CI now covers static app and edge-function release gates. Crash reporting and
  product analytics are still missing.
- Expo package versions are aligned with SDK 56, and Expo Doctor passes all
  checks on this branch.
- `npm audit --omit=dev` reports transitive advisories, largely in build
  tooling. Triage by runtime reachability and update compatible parents; do not
  accept an Expo major downgrade as an automated “fix.”
- Server Deno checks pass when run from `supabase/functions`, as CI now does.
- Admin is read-only and intentionally lacks remediation/audit actions.
- Subscription client state comes from RevenueCat while server agent access
  comes from the webhook mirror. Add a reconciliation job/API so drift is
  visible and self-healing.
- The current custom/offline mode is useful for development but should not be a
  separate public product with weaker auth/privacy semantics.
- Social features compete with the text-first thesis. Keep them, but make the
  default home hierarchy coach → today → own meals; move friend content lower
  until its retention value is proven.

## Launch scorecard

| Area | Current state | Launch gate |
|---|---|---|
| Text meal capture | Implemented, needs staging fault tests | p95 result < 20s; duplicate meals < 0.1% |
| Agent memory | Explicit memory + delete UI | eval privacy, relevance, and deletion |
| AI providers | OpenAI/Anthropic/Google | fallbacks, telemetry, cost alarms |
| Meal privacy | private bucket + signed URLs | two-user RLS/storage E2E |
| Auth/deletion | implemented | Apple config + deletion staging test |
| Subscriptions | client + webhook mirror | sandbox lifecycle matrix |
| Friend access | native Apple offer-code sheet | App Store Connect codes tested |
| Onboarding | text-first redesign | first-value usability test |
| Admin | read-only dashboard | auth bootstrap + audit-safe actions |
| Retention | streak + flexible consistency | opt-out/safety guardrails |
| Observability | missing | crash + analytics + alerts |
| Clinical/legal | missing | RD and counsel sign-off |
| Store assets/metadata | partial | screenshots, URLs, reviewer notes |

## Recommended sequence

1. Freeze new feature work long enough to make CI, observability, staging, and
   the subscription lifecycle green.
2. Run a 10-person, 18+ private texting pilot and instrument corrections,
   latency, duplicates, follow-up opt-outs, and trust.
3. Improve repeated-meal accuracy and reply-to-correction before expanding
   health data.
4. Complete RD/legal review and public policies.
5. Ship TestFlight, then App Review with a precise reviewer script.
6. Apply for/complete Apple Messages for Business while Sendblue remains the
   pilot adapter.

The product is differentiated when the app is the trustworthy memory and audit
surface for a coach the user can reach without opening it. Every new feature
should strengthen that loop or wait.
