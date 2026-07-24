# Overnight build report — July 24, 2026

**Branch: `codex/text-first-production`** (pushed). Nothing deployed to your live backend and nothing merged to `main` — your call this morning. Two workstreams ran concurrently tonight: this session (Claude, backend/hardening lane) and your Codex session (app/UI lane); this report covers mine fully and the joint state as of the last green checkpoint. Note: the earlier `claude/agent-v1-overnight` remote branch is stale — everything lives on `codex/text-first-production`.

## Verified state at last checkpoint

- **362 Jest tests passing**, `tsc` clean, Expo Doctor 21/21, full web
  export clean, and `deno check` clean on all 7 edge functions.
- The app/UI tail, dependency alignment, CI, and final product audit are now
  complete on the same branch. See `docs/PRODUCT_AUDIT_2026-07-23.md` for the
  current launch assessment rather than relying on this historical lane report.

## What this lane shipped

### 1. Multi-provider AI backend (`e9c8ead`)
`ANALYZE_PROVIDER=openai|anthropic|gemini` selects the meal-photo analyzer (Anthropic = Claude Opus 4.8 with structured outputs; Gemini via `responseSchema`); `CHAT_PROVIDER`/`CHAT_MODEL` do the same for the agent's chat loop through the AI SDK. **OpenAI stays the default — zero behavior change until you set env vars** (`ANTHROPIC_API_KEY` / `GOOGLE_API_KEY` + the provider flags).

### 2. Codebase-review fixes (`821a551`) — all 5 P0s + 9 P1s from a 105-file adversarial review
The review report's highlights and what happened to each:

| Finding (severity) | Status |
|---|---|
| **meal-photos bucket world-readable** (P0, App Store blocker) | **Fixed** — bucket private (0017), storage SELECT policy derived from `can_view_meal` via the meal id in the path; app batch-signs 7-day URLs; sync adopts signed URLs after upload |
| **Two meals in one text → second silently dropped** (P0) | **Fixed** — chat ingestion key now includes the description hash |
| **Webhook-burst race → duplicate meals** (P0) | **Fixed** — unique partial index (one `collecting` run per sender) + 23505 join-the-winner |
| **Account deletion left agent data behind** (P0) | **Fixed** — delete-account purges pre-link messages by phone number, cooldown hashes, usage counters, tombstones |
| **Stuck runs never recovered** (P0) | **Fixed** — the minute warm ping now sweeps runs stranded >2 min (fails + apologizes) and clears orphaned scratch photos (24 h TTL) |
| Outbound double-send race (P1) | Fixed — unique `client_ref` index, insert-first/send-second with claim release |
| Agent delete left photos in storage (P1) | Fixed |
| Repeated amends corrupted the description (P1) | Fixed — numbers update, words stay |
| Tombstone-blocked insert read as success (P1) | Fixed — `commit_agent_meal` returns a status |
| notify N+1 (2 queries × follower) + blocks ignored (P1) | Fixed — batched, block-aware |
| Privacy policy missing texting/AI disclosures (P1) | Fixed (Codex added the payments section alongside) |
| Quota notice race (P2) | Fixed — once/day via date-scoped ref |
| Prompt-injection hardening of delete/privacy tools (P1) | **Open** — model-mediated; mitigations: tools scoped to own data + confirm-before-delete prompt. Worth a deterministic confirm step later |
| analyze/agent quota counters shared confusingly (P1) | **Open** — documented; split counters when it bites |
| Feed comment payload unbounded, discover URL length, misc P2s | **Open** — listed in the review output (kept in my session log) |

### 3. Streaks & habit mechanics (`9d4b8ad`, informed by the Cal AI/Poke/MFP research)
- **Olive Save**: one streak repair per rolling week — `streak_freezes` table + `use_streak_freeze` RPC (0019), callable by the app (authenticated) and the agent (service role).
- Timezone-safe streak math in `src/domain/streaks.ts` (`streakFromKeys`, `repairableDayKey`, milestones 3/7/14/30/50/100/365) shared by app + agent; 11 new reference tests.
- Agent tools: `get_streak` (current streak, next milestone, repairable day) and `use_streak_save` (after user consent). The evening-nudge/celebration UI is wired for the Codex lane via `repo.fetchStreakFreezes`.

### 4. Coupon codes for friends (0020)
`coupon_codes` + `redeem_coupon(code)` provides an optional backend comp-grant path and now preserves longer or non-expiring entitlements. It is intentionally **not wired into the public paywall**: the client reads RevenueCat while the agent gate reads the subscription mirror, so a custom grant needs reconciliation before it is a complete product flow. Apple's native subscription offer codes are the recommended launch path and are wired into the paywall.

### 5. Texting features
- **Daily recap** (opt-in): "turn on my daily recap" → `set_daily_recap` tool; hourly cron (0016) → `agent-recap` function sends a deterministic, template-based day summary at the user's chosen local hour (no LLM — instant, never hallucinates numbers). Respects the once-per-day dedupe and the user's timezone.
- Memory (Codex's `agent_memories` schema + save/forget tools) got its user-facing screen finished across both lanes: Settings → What Oliv remembers, inspect + delete.

### 6. Research deliverable
The competitive brief (Cal AI onboarding/paywall machine, Poke Fit texting patterns, Illume's 3-part insight frame, MFP streak mechanics + 2026 onboarding literature) with a ranked top-20 recommendation list is preserved in my session output — the streak/recap features above implement recs #2, #5, #12; the quiz-onboarding, paywall-timeline, and running-budget-reply recs are the highest-value ones still open.

## App/UI and release-hardening lane
Webhook header auth (`sb-signing-secret` + constant-time compare), text-first onboarding screens (`text-setup`), design-token and component work (theme, ui, MealCard, CoachCard, TextThreadPreview), in-app admin dashboard (`/admin` + `app_admins` table, 0015), RevenueCat integration (purchases service, subscription store, paywall screen, `revenuecat-webhook` function, 0018), memory screen/services, SDK dependency alignment, and CI are complete on this branch.

## ⚠️ Deploy runbook (when you approve the merge — nothing below is done yet)

1. **Migrations 0014–0020 are unapplied** (memory, admin, prefs+recap cron, hardening/private-bucket, subscriptions, streak freezes, coupons): `supabase db push`.
2. **Deploy functions**: `agent-inbound`, `agent-analyze`, `agent-recap` (new), `revenuecat-webhook` (new), `notify`, `delete-account` — all `--no-verify-jwt` except `analyze`/`delete-account` as before.
3. **Secrets**: set `SENDBLUE_WEBHOOK_SECRET` (new header auth — also paste it into the Sendblue webhook config), and if you want the provider switches: `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`. RevenueCat keys per the Codex lane's config (`EXPO_PUBLIC_REVENUECAT_*` in EAS env + RC webhook secret).
4. **Cron settings**: seed `private.app_settings` with `agent_recap_url` and `agent_webhook_secret`; the existing warm-ping URL still uses the legacy query param — either set `ALLOW_LEGACY_AGENT_QUERY_SECRET=true` on `agent-inbound` or update the stored `agent_warm_url` + secret to the header scheme.
5. **Private bucket flips ON at migration time** — old photo URLs in local app caches will 400 until a refresh re-signs them (hydrate/foreground refresh handles it; expect one-time broken images for stale sessions).
6. **Payments need a NEW TestFlight binary** — `react-native-purchases` is a native module, so `eas build` + submit, not just an OTA. Everything else remains OTA-able.
7. Smoke test after deploy: `node scripts/agent-smoke.mjs` (now header-auth: pass `WEBHOOK_SECRET`).

## Decisions for you this morning
1. **Merge `codex/text-first-production` → main?** The full joint branch is
   tested and ready for review; it has not been deployed.
2. **Paywall timing/pricing** (research says: soft paywall after plan-reveal + first scan; 3-day trial → annual anchor ~$29–49/yr; Poke charges $19/mo) — the in-app paywall is wired to RevenueCat and the agent can optionally gate against its server mirror. Leave `REQUIRE_ACTIVE_SUBSCRIPTION` off until the sandbox webhook lifecycle is verified.
3. **Provider switch?** Flipping `CHAT_PROVIDER=anthropic` (Claude Opus 4.8) is a one-secret change if you want to compare the coach's voice.
4. Open review items above (notably deterministic delete confirmation and split quota counters) — none block the pilot.
