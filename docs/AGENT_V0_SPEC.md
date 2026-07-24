# Oliv Agent v0 — product & engineering spec (v0.2)

*Spec date: July 23, 2026 (v0.2, same day — revised after external review + Alec's notes). Companion to [IMESSAGE_AGENT_RESEARCH.md](IMESSAGE_AGENT_RESEARCH.md).*

**v0.2 changes:** transport moves **Spectrum → Sendblue** (one dedicated number anyone can text; webhook delivery kills the Railway requirement — the whole gateway is now Supabase Edge Functions); ack ≤2s with a 2–4s capture debounce (was 30s); durable ingestion with exactly-once meal commits; separate `agent-analyze` entry point (the piggyback-on-`analyze` auth design was invalid — platform JWT check runs before function code); texted meals follow the user's app privacy default **and new users now default private**; hardened linking (128-bit token, atomic consume, no silent reassign); timezone captured at linking; "nutrition coach" terminology + 18+ gate; agent-chat quotas; retention/deletion semantics defined.

## 1. What v0 is

**One sentence:** anyone texts Oliv's dedicated iMessage number; linked users get meals logged from photos/text into their real account (same Health Score, visible in the app and feed), and can chat with a friendly **AI nutrition coach** grounded in their own entries.

**In scope:** link flow from the app · 1–5 photos (± caption) → meal + reply · text-only logging · corrections on the last texted meal (amend / privacy / delete) · grounded Q&A ("how am I doing today?", "protein this week?") + general nutrition chat · canned reply for unknown numbers.

**Out of scope (deferred, don't build partial versions):** proactive messages of any kind (agent only replies) · text-first signup · voice memos · USDA grounding · wearables · group chats · Apple Messages for Business.

**Acceptance criteria (measurable, per review):**

- Ack (typing indicator or text): **P95 < 2s from webhook receipt** (fully in our control); end-to-end user-perceived ack **measured in the day-1 spike**, target < 3s (Sendblue's inbound-relay latency + whether typing indicators bypass the 1 msg/sec per-line send queue are the unknowns).
- Single-photo final reply: **P50 < 15s**; any batch: **P95 < 30s**.
- **Exactly-once:** a given inbound batch produces at most one meal, across retries, crashes, and duplicate webhook deliveries (enforced by `ingestion_key`, §5).
- A texted meal appears in the app on next foregrounding with no reinstall/re-login.
- Photos arriving after processing started join a follow-up turn ("also logged the second photo as part of lunch") rather than being dropped.
- Cross-user test: no tool call or query path can read or mutate another user's rows (service-role scoping tests are mandatory, §8).

## 2. Transport decision: Sendblue (dedicated number, webhook-native)

Alec's constraints: one dedicated number anyone can text, no per-user provisioning, as few services as possible, paying is fine for DevX/scale.

| | **Sendblue — chosen** | Spectrum Free (tried) | Spectrum Business | LoopMessage |
|---|---|---|---|---|
| Dedicated number, anyone texts first | ✅ ($100/line/mo inbound/AI-agent plan) | ❌ shared pool number + **per-user allowlist** in dashboard | ✅ but $250/line/mo | ✅ (~$60–120/mo w/ add-ons, warm-up rules) |
| Photo intake | **`media_url` in webhook** — plain HTTP download | SDK-only (`getAttachment`, long-lived process) | SDK-only | webhook |
| Infra required | **none new** — Supabase Edge Functions receive webhooks | Railway (persistent SDK connection) | Railway | none new |
| Fallback | SMS/RCS on same number | SMS/RCS | SMS/RCS | add-on |

Spectrum's Free tier (already signed up) turned out to mean: a shared-pool number that *only replies to phones you've pre-added* — anyone-can-text requires Business ($250/mo) — plus the SDK-only attachment path forces an always-on gateway service. Wrong fit for these constraints; the Spectrum project can be abandoned.

**Start on Sendblue's Free Sandbox ($0):** up to 10 verified contacts (= the tester list), inbound-first, full API access including media webhooks — the identical code path and architecture as the paid tier, in a rate-limited test environment. **Upgrade to AI Agent ($100/mo) with no downtime** when a dedicated anyone-can-text number is wanted; Sendblue states $0 per-message fees, no A2P registration, no SMS-fallback fees on both tiers. Day-1 spike must confirm sandbox behavior for: HEIC `media_url` fetch, typing indicators (paid tier lists "media, typing, reactions"; if sandbox lacks typing, the "on it 👀" ack text substitutes), and webhook signature scheme. The provider adapter (§4) keeps a later switch (e.g. Linq at scale — the Poke-proven vendor) a one-file change.

Vendor diligence during setup: signature/verification scheme for webhooks, `media_url` lifetime, typing-indicator + read-receipt endpoints, per-line throughput, retention posture + DPA.

## 3. System overview (all-Supabase — no Railway)

```
User ⇄ Sendblue dedicated number (iMessage, SMS/RCS fallback)
          ⇩ webhook POST (per message; media as media_url)      ⇧ send API (replies, typing)
   Edge Fn: agent-inbound   (verify_jwt=false, x-agent-secret + provider signature)
          • idempotent message log → agent_messages
          • instant ack (typing indicator on first message of a run)
          • respond 200 immediately; EdgeRuntime.waitUntil(background):
              debounce 3s → atomically claim the run → fetch media_urls →
              normalize (HEIC→JPEG ≤1.1MB) → agent-analyze → validateAnalysis +
              scoreMeal (direct Deno import of ../../src/domain/*.ts — pure TS) →
              commit meal via single RPC (exactly-once) → upload photos →
              reply via Sendblue → log outbound
   Edge Fn: agent-analyze   (verify_jwt=false, secret-authed, server-resolved userId,
                             shares providers.ts + quota with `analyze`)
   Postgres: meals · channel_identities · channel_link_tokens · agent_messages · agent_runs
   Expo app: Settings link flow · refreshOwnMeals() on foreground
```

Notes on the architecture change:

- **Deno imports the domain directly.** The gateway is now Deno (edge functions), so `../../src/domain/healthScore.ts` etc. import natively — no Node packaging, no path-alias fragility, no `packages/domain` extraction needed (the review's monorepo concern dissolves). `supabase/` stays excluded from the app tsconfig as today.
- **Background work rides `EdgeRuntime.waitUntil`** — respond to the webhook instantly, keep processing up to the wall-clock limit (well beyond our P95 30s). Local dev needs `policy = "per_worker"` in `config.toml`.
- **Provider adapter:** `supabase/functions/agent-inbound/providers/sendblue.ts` normalizes to `MessageEnvelope { provider, externalMessageId, externalSenderId, text?, mediaUrls[] }` and exposes `send()` / `typing()`. Only this file knows Sendblue exists.

## 4. Capture & responsiveness (Alec: "ack within 2 seconds; posting can be async")

- **On every inbound webhook:** log the message (idempotent), and if it opens a run, fire the typing indicator (or "on it 👀" if typing isn't available) *before* returning 200. Ack P95 < 2s.
- **Debounce, not a 30s window:** a run in `collecting` state carries `closes_at = now() + 3s`, extended by each new message (hard cap: `first_message + 20s` or 5 photos). The background task sleeps until `closes_at`, then attempts the atomic `collecting → analyzing` transition; only the invocation that wins the conditional update proceeds — every other webhook invocation for the same run exits quietly. (Multi-photo iMessage sends arrive as separate webhooks within ~1–2s; 3s catches the batch plus a trailing caption without hurting latency.)
- **Late arrivals:** a photo landing after `analyzing` starts opens a *new* run; the agent folds it in conversationally ("added that to lunch" via amend) rather than dropping it.
- **The 1 msg/sec per-line queue shapes replies:** Sendblue queues outbound at 1 msg/sec per line, shared across all users — so every reply is **one message** (no multi-chunk sends; a 3-chunk reply blocks everyone else's acks for 3s). Ack is a **typing indicator**, on the assumption it bypasses the message queue (verify day 1; fallback: one-word text ack). Sendblue's inbound **"contact is typing" webhook** is used as a free pre-warm: resolve the sender's identity and warm the function before their message arrives, eliminating cold-start cost from the ack path. At scale, more lines split the queue.
- **Daily quotas (per line):** 1,000 inbound/day and unlimited within-24h replies — ample for v0. The **200/day follow-up cap (24h+ since last reply)** is the number that will constrain proactive check-ins in P2; noted now.

## 5. Durable ingestion & exactly-once (promoted from v1-debt to v0, per review)

`agent_runs` is the state machine: `collecting → analyzing → committing → replied` (+ `failed` with `retry_count`, `last_error`).

- **`ingestion_key`** = sha256(provider + sorted inbound `external_message_id`s of the run). `meals.ingestion_key text unique` (nullable). The meal `id` is generated once, at claim time, and stored on the run.
- **Commit is one RPC** (`commit_agent_meal`): inserts the meal row (with `ingestion_key`) and marks the run `committing → replied`-eligible in a single transaction. A retry that lost a race hits the unique constraint → treated as already-committed, proceed to reply.
- **Photos upload to deterministic paths** (`userId/mealId-{i}.jpg`) *before* the commit RPC; uploads are idempotent (upsert). `photo_paths` is part of the commit payload, so the app never sees a photo-less flash.
- **Reply after commit**, then mark `replied`. A crash between commit and reply → retry sends the reply only (run state says the meal exists). Outbound messages log to `agent_messages` with a stable client ref so retries don't double-send.
- A sweeper (pg_cron, every minute) re-drives runs stuck in `analyzing`/`committing` past a staleness threshold, up to 3 retries, then `failed` + apology reply.

## 6. Data model — migration `0008_agent.sql`

```sql
create table channel_identities (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  provider      text not null default 'sendblue',
  external_sender_id text not null,          -- E.164 for Sendblue; opaque for future providers
  status        text not null default 'active',   -- active | revoked
  linked_at     timestamptz not null default now(),
  revoked_at    timestamptz,
  unique (provider, external_sender_id)
);

create table channel_link_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  token_hash  text not null unique,           -- sha256(128-bit URL-safe token)
  timezone    text,                           -- device IANA tz captured at mint
  expires_at  timestamptz not null,           -- now() + 15 min
  consumed_at timestamptz,
  attempts    int not null default 0
);

create table agent_messages (
  id            uuid primary key default gen_random_uuid(),
  provider      text not null default 'sendblue',
  external_message_id text,
  external_sender_id  text not null,
  user_id       uuid references profiles(id) on delete cascade,   -- cascade: deletion wipes content
  direction     text not null,                -- in | out
  content       text,
  media_count   int not null default 0,
  run_id        uuid,
  meal_id       uuid references meals(id) on delete set null,
  client_ref    text,                         -- stable outbound ref (retry-safe sends)
  created_at    timestamptz not null default now(),
  unique (provider, external_message_id)
);
create index agent_messages_user_idx on agent_messages (user_id, created_at desc);

create table agent_runs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  external_sender_id text not null,
  state         text not null default 'collecting',
  ingestion_key text unique,
  meal_id       uuid,
  closes_at     timestamptz not null,
  retry_count   int not null default 0,
  last_error    text,
  created_at    timestamptz not null default now()
);

alter table meals    add column if not exists ingestion_key text unique;
alter table meals    add column if not exists via text not null default 'app';
alter table profiles add column if not exists timezone text;                 -- IANA
alter table profiles alter column default_private set default true;          -- new users: private by default
```

RLS: users select/delete their own `channel_identities` + `agent_messages` (see linked state, wipe thread, disconnect via `status='revoked'` update); all inserts service-role only. **`delete-account` edge function** gains explicit purge of agent tables + any meal-photo objects — cascade covers rows, verify storage.

## 7. Privacy & policy decisions (locked with Alec)

1. **Texted meals follow the user's app default** (`profiles.default_private`) — same behavior as logging in-app. **New users now default private** (migration above + set the same default in onboarding/`DEFAULT`-profile creation in the app); existing users who share by default keep sharing.
2. **The linking screen states the consequence explicitly** before connecting: "Meals you text Oliv will post to your feed for followers" *or* "…will stay private," matching their current setting, with a link to change it. No silent surprises, per review.
3. **Terminology:** Oliv the agent is an **AI nutrition coach** — never "dietitian/dietician" in user-facing copy until clinical/legal review. v0 advice stays within: logging, corrections, factual totals/trends, neutral observations, general food suggestions, explicit uncertainty.
4. **18+:** the app allows 13+; the *agent* doesn't yet. Linking requires 18+ (checkbox at link time; body-profile age gates it too when present). Revisit with minor-safety review.
5. **Deterministic scope guards before the model:** a small classifier/regex layer intercepts medication, eating-disorder, pregnancy/disease-specific, and crash-diet requests → fixed compassionate copy + professional-help pointers. Not left to the system prompt alone.
6. **Photo bucket** stays public-read for friends-family testers **and is a hard blocker before any external tester**: private bucket + `can_view_meal`-derived signed URLs (tracked, not in this build). Reviewer's stricter position noted; Alec accepts tester-scope risk.
7. **Retention:** account deletion cascades all agent rows; disconnect keeps history until deletion (shown in-app); Sendblue/OpenAI processing disclosed on the linking screen before first use; raw `media_url`s are fetched then discarded (photos live only in Oliv storage).

## 8. Service-role discipline (enforced in code, not prompts)

- `userId` derives **only** from the resolved `channel_identities` row — never from model output; tool schemas take no user ids.
- Every mutation includes `.eq('user_id', resolvedUserId)`; meal-targeting tools resolve "last meal" as *the sender's* most recent `via='imessage'` meal server-side.
- Mutations go through narrow RPCs where practical (`commit_agent_meal`, `consume_link_token`).
- **Mandatory tests:** cross-user attempts (user A's sender id targeting user B's meal id) must fail at the query layer.

## 9. Analysis path: new `agent-analyze` entry point

The v0.1 design (shared-secret check inside `analyze` with `verify_jwt` on) was invalid — Supabase's platform JWT check runs **before** function code. Correct shape, precedent `notify`:

- New function `agent-analyze`, deployed `--no-verify-jwt`; auth = `x-agent-secret` (+ timestamp guard) exactly like `notify`.
- Body includes server-resolved `userId`; runs `bump_analyze_usage(userId)` and all existing input caps.
- **Shares `providers.ts` verbatim** (import from `../analyze/providers.ts`) — one prompt, one schema, one OpenAI key. `analyze` (user-JWT) is untouched.

## 10. Agent loop

Unchanged in essence from v0.1, with review refinements:

- **Photos → deterministic path** (no LLM routing): normalize → `agent-analyze` → `validateAnalysis` + `scoreMeal` (Deno domain imports) → `commit_agent_meal` → reply with foods/macros/score + the single biggest assumption. Meal type from time-of-day **in the user's stored timezone** (captured at linking; prompt for it if somehow absent — no silent PT fallback).
- **Text-only → Vercel AI SDK** (`ai` + `@ai-sdk/openai`, gpt-5.5, ≤5 steps) with tools: `log_meal`, `amend_last_meal`, `set_meal_privacy`, `delete_last_meal` (confirm first), `get_daily_summary`, `get_recent_meals`, `get_profile`. (AI SDK runs fine in Deno/edge.)
- **Corrections are structured:** `amend_last_meal` passes `{ previousAnalysis, previousDescription, correction }` to `agent-analyze` (small prompt-side addition to accept prior-analysis context), not a string-concat re-run — then re-validate, re-score, update.
- **Context:** persona prompt + profile/goals + today's summary (domain math) + last 30 `agent_messages` for this user. Conversation is keyed per sender identity; memory per resolved user.
- **Persona:** warm, wry, concise texting register; 🫒 signature; estimates framed honestly; never moralizes; assume the prompt will leak (nothing sensitive in it).
- **Quotas (new):** meal analyses ride the existing 60/day cap; add per-user **agent message cap (100 msgs/day)** and model-call budget per run (≤5 steps, capped output tokens); unknown senders get one canned reply per number per 24h (cooldown row keyed on sender hash). "Chat is cheap" is not a cost control — these are.

## 11. Onboarding & linking (v0 = link flow only, hardened)

App (Settings → "Connect Oliv over text"):

1. Mint a **128-bit URL-safe token** server-side via the user's session (row: hash, device IANA timezone, 15-min expiry). One active token per user (minting invalidates prior). No typing needed — the app opens `sms:<OLIV_NUMBER>&body=LINK <token>`; the screen shows the 18+ confirm + the privacy-consequence line (§7.2) + Sendblue/OpenAI processing disclosure *before* minting.
2. On focus, poll linked state; show "Connected ✓" / Disconnect (sets `status='revoked'`).

Gateway (`consume_link_token` RPC — atomic):

- Single transaction: match unexpired unconsumed hash → set `consumed_at` → upsert `channel_identities` → copy timezone to `profiles.timezone` (if unset). Conditional-update semantics make double-sends no-ops.
- **Already-linked sender texting a new LINK for a different account → refuse** with "this number is already connected to another Oliv account — disconnect it in that app first." Never silently reassign.
- Failed attempts increment counters; >5 bad LINK attempts from a sender → 24h cooldown. Unknown non-LINK texts → one canned "grab the Oliv app → Settings → Connect Oliv over text" per cooldown window.

The dedicated number is a constant (env/`agent-config`) — no per-user provisioning anywhere, per Alec's requirement.

## 12. App changes (Expo)

1. Settings link screen (§11) incl. disclosures; RN-Web caveats respected (confirm service, no nested pressables).
2. **`refreshOwnMeals()`** — a new focused sync op: fetch own meals + merge into the store (reusing hydrate's photo-preserving merge logic *only*), on `AppState → active` (throttled 60s). Explicitly **not** `hydrateForUser()`, which replays pending ops and re-pushes local-only meals (review's catch).
3. New-user onboarding sets `defaultPrivate: true` (matches migration default).
4. Optional 💬 marker on own `via='imessage'` meal cards.

## 13. Testing

- Unit: debounce/claim state machine (fake timers), `consume_link_token` (atomicity, reassign-refusal, cooldowns), envelope fixtures, tool handlers with mocked repo, **cross-user authorization suite (§8)**. Domain math already reference-tested — don't duplicate.
- Crash-injection: kill the pipeline between each pair of steps (analyze/commit/upload/reply) and assert exactly-once + eventual reply via the sweeper.
- Replay fixtures: recorded Sendblue payloads incl. duplicates, HEIC, multi-photo bursts, out-of-order.
- Manual E2E script: link → HEIC photo → ack <2s → reply <15s → app foreground shows meal → "actually two scoops of rice" → updated → "how am I doing today?" → "delete that" → gone → disconnect → texts refused.

## 14. Build order (revised per review; ~3–5 part-time weeks to tester-ready)

1. **Day 1 spike:** Sendblue account + dedicated number; webhook → edge function locally; prove `media_url` fetch for a real HEIC from an iPhone; typing-indicator endpoint; measure webhook latency. *(Go/no-go; fallbacks: LoopMessage same shape, or Spectrum Business + Railway.)*
2. Migration 0008 + `agent-analyze` + RPCs (`consume_link_token`, `commit_agent_meal`).
3. Ingestion pipeline with run state machine + sweeper; idempotent photo upload; crash-injection tests green.
4. Photo→meal end to end for a hand-inserted identity — latency criteria measured.
5. Link flow (app screen + disclosures + RPC) + timezone capture + `refreshOwnMeals()`; remove hand-inserted identity.
6. Agent loop: tools, persona, scope guards (§7.5), quotas; text logging, amend (structured), summaries.
7. Cross-user + retention tests; delete-account purge verified; polish (error copy, cooldowns, single-message reply formatting).
8. Onboard testers (18+, disclosed, friends-family).

## 15. Costs

Sendblue Free Sandbox **$0** (10 verified testers; → $100/mo AI Agent tier only when a public dedicated number is wanted, zero code change) · Supabase existing project ($0 extra at this scale) · OpenAI usage (capped per user) · **no Railway**. Total for the pilot: **$0/mo + tokens**.

## 16. Deferred (v1 seeds)

Private photo bucket + signed URLs (**blocker before external testers**) · proactive check-ins/recaps (consent UX + quiet hours) · text-first signup · Supabase Realtime · voice memos · USDA grounding + correction memory · minor-safety review to open <18 · RD review of coaching copy · Linq evaluation at scale (Poke-proven, hundreds of lines) · Apple Messages for Business.
