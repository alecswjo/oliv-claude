// Oliv texting-agent gateway (docs/AGENT_V0_SPEC.md).
//
// Sendblue POSTs one webhook per inbound message. We log it idempotently,
// resolve the sender to an Oliv user, ack fast (typing indicator), return 200
// immediately, and do the real work in EdgeRuntime.waitUntil:
//   photos → 3s capture debounce → claim run → analyze → score → exactly-once
//   commit → upload photos → single-message reply
//   text   → LINK handling / scope guard / chat loop with tools
//
// Deploy:  supabase functions deploy agent-inbound --no-verify-jwt
// Secrets: SENDBLUE_WEBHOOK_SECRET, AGENT_SECRET, provider API keys,
// SENDBLUE_API_KEY, SENDBLUE_API_SECRET
// Webhook URL (set in Sendblue dashboard):
//   https://<ref>.supabase.co/functions/v1/agent-inbound
// Set SENDBLUE_WEBHOOK_SECRET as the webhook secret; Sendblue supplies it in
// the sb-signing-secret header. Keep AGENT_SECRET separate: it authenticates
// only gateway → agent-analyze calls.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { mealTitle } from '../../../src/domain/nutritionValidation.ts';
import {
  FAILURE_REPLY,
  LINK_CONFLICT_REPLY,
  LINK_INVALID_REPLY,
  LINK_SUCCESS_REPLY,
  PHOTO_FORMAT_REPLY,
  REVOKED_SENDER_REPLY,
  UNKNOWN_SENDER_REPLY,
  formatMealReply,
  hourInTimezone,
  ingestionKeyInput,
  isTypingEvent,
  mealTypeForHour,
  normalizeSendblue,
  parseLinkCommand,
  secureEqual,
  scopeGuard,
  sniffImage,
  type MessageEnvelope,
} from './logic.ts';
import { fetchMedia, sendMedia, sendMessage, sendTyping } from './sendblue.ts';
import { callAgentAnalyze, commitMeal, dayKeyInTz, sha256Hex, uploadPhoto } from './ops.ts';
// NOTE: agent.ts (AI SDK + zod) is dynamically imported only on chat turns —
// keeping it out of the boot path cuts cold-start for the photo pipeline.

const DEBOUNCE_MS = 2_000;
const RUN_HARD_CAP_MS = 20_000;
const MAX_RUN_PHOTOS = 5;
const DAILY_MESSAGE_LIMIT = 100;
const STUCK_RUN_MS = 120_000;

function admin(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}

function ok(body: Record<string, unknown> = { ok: true }): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

async function hasRequiredSubscription(db: SupabaseClient, userId: string): Promise<boolean> {
  if (Deno.env.get('REQUIRE_ACTIVE_SUBSCRIPTION') !== 'true') return true;
  const entitlement = Deno.env.get('REVENUECAT_ENTITLEMENT_ID') ?? 'pro';
  const { data, error } = await db
    .from('subscriptions')
    .select('status, expires_at')
    .eq('user_id', userId)
    .eq('entitlement_id', entitlement)
    .maybeSingle();
  if (error) {
    // Billing is an authorization boundary: once enforcement is enabled,
    // infrastructure ambiguity must not silently grant a paid service.
    console.error('subscription lookup failed', error);
    return false;
  }
  if (!data || data.status === 'expired') return false;
  return data.expires_at == null || new Date(data.expires_at).getTime() > Date.now();
}

/**
 * Exactly-once outbound send: claim the client_ref by inserting first (a
 * partial unique index backs this), send second, release the claim if the
 * send fails so a retry can re-attempt.
 */
async function reply(
  db: SupabaseClient,
  env: { externalSenderId: string; lineNumber: string | null },
  userId: string | null,
  content: string,
  clientRef: string,
): Promise<void> {
  const { data: claimed, error: insErr } = await db
    .from('agent_messages')
    .insert({
      provider: 'sendblue',
      external_sender_id: env.externalSenderId,
      user_id: userId,
      direction: 'out',
      content,
      client_ref: clientRef,
    })
    .select('id')
    .maybeSingle();
  if (insErr?.code === '23505') return; // another invocation owns this send
  if (insErr) throw new Error(`outbound log failed: ${insErr.message}`);
  try {
    await sendMessage(env.externalSenderId, content, env.lineNumber);
  } catch (err) {
    await db.from('agent_messages').delete().eq('id', claimed!.id).then(undefined, () => {});
    throw err;
  }
}

/* -------------------------- unknown-sender path -------------------------- */

async function handleUnknown(db: SupabaseClient, env: MessageEnvelope): Promise<void> {
  const senderHash = await sha256Hex(`sendblue:${env.externalSenderId}`);
  const token = parseLinkCommand(env.text);

  if (token) {
    const { data: cd } = await db
      .from('agent_cooldowns')
      .select('attempts, last_sent_at')
      .eq('sender_hash', senderHash)
      .maybeSingle();
    if ((cd?.attempts ?? 0) >= 5) return; // link brute-force cooldown: silent
    const { data, error } = await db.rpc('consume_link_token', {
      p_token: token,
      p_provider: 'sendblue',
      p_sender: env.externalSenderId,
    });
    if (error) throw new Error(`consume_link_token failed: ${error.message}`);
    const status = (data as { status: string }).status;
    if (status === 'linked') {
      const userId = (data as { userId: string }).userId;
      // Adopt the pre-link inbound rows so the thread belongs to the user.
      await db
        .from('agent_messages')
        .update({ user_id: userId })
        .eq('external_sender_id', env.externalSenderId)
        .is('user_id', null);
      await db.from('agent_cooldowns').delete().eq('sender_hash', senderHash);
      await reply(db, env, userId, LINK_SUCCESS_REPLY, `link:${env.externalMessageId}`);
      // Follow with Oliv's contact card so the thread shows a name + logo.
      try {
        const vcfUrl = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/agent-assets/oliv.vcf`;
        await sendMedia(env.externalSenderId, vcfUrl, 'Save me as a contact 🫒', env.lineNumber);
      } catch (err) {
        console.warn('contact card send failed', String(err));
      }
      return;
    }
    await db.from('agent_cooldowns').upsert({
      sender_hash: senderHash,
      last_sent_at: new Date().toISOString(),
      attempts: (cd?.attempts ?? 0) + 1,
    });
    await reply(
      db,
      env,
      null,
      status === 'conflict' ? LINK_CONFLICT_REPLY : LINK_INVALID_REPLY,
      `linkfail:${env.externalMessageId}`,
    );
    return;
  }

  // Non-LINK stranger: one canned reply per 24h.
  const { data: cd } = await db
    .from('agent_cooldowns')
    .select('last_sent_at')
    .eq('sender_hash', senderHash)
    .maybeSingle();
  if (cd && Date.now() - new Date(cd.last_sent_at).getTime() < 86_400_000) return;
  await db
    .from('agent_cooldowns')
    .upsert({ sender_hash: senderHash, last_sent_at: new Date().toISOString(), attempts: 0 });
  await reply(db, env, null, UNKNOWN_SENDER_REPLY, `stranger:${env.externalMessageId}`);
}

/* ----------------------------- meal-run path ----------------------------- */

interface RunRow {
  id: string;
  user_id: string;
  external_sender_id: string;
  state: string;
  meal_id: string | null;
  closes_at: string;
  retry_count: number;
}

/** Open a new run or extend the sender's collecting run; returns the run id. */
async function upsertRun(db: SupabaseClient, env: MessageEnvelope, userId: string): Promise<{ runId: string; opened: boolean }> {
  const { data: open } = await db
    .from('agent_runs')
    .select('id, opened_at')
    .eq('external_sender_id', env.externalSenderId)
    .eq('state', 'collecting')
    .maybeSingle();
  if (open) {
    const hardCap = new Date(open.opened_at).getTime() + RUN_HARD_CAP_MS;
    const closes = Math.min(Date.now() + DEBOUNCE_MS, hardCap);
    await db
      .from('agent_runs')
      .update({ closes_at: new Date(closes).toISOString(), updated_at: new Date().toISOString() })
      .eq('id', open.id)
      .eq('state', 'collecting');
    return { runId: open.id, opened: false };
  }
  const { data, error } = await db
    .from('agent_runs')
    .insert({
      user_id: userId,
      external_sender_id: env.externalSenderId,
      kind: 'meal',
      closes_at: new Date(Date.now() + DEBOUNCE_MS).toISOString(),
    })
    .select('id')
    .single();
  if (error?.code === '23505') {
    // Race: a concurrent delivery opened the run first (unique partial index).
    // Join it instead of double-processing the burst.
    const { data: won } = await db
      .from('agent_runs')
      .select('id')
      .eq('external_sender_id', env.externalSenderId)
      .eq('state', 'collecting')
      .maybeSingle();
    if (won) return { runId: won.id, opened: false };
  }
  if (error) throw new Error(`run insert failed: ${error.message}`);
  return { runId: data.id, opened: true };
}

/**
 * Recover runs stranded in analyzing/committing by a crashed or CPU-killed
 * invocation: fail them and apologize so the user isn't left in silence.
 * Driven by the minute warm ping (empty POST body). Also sweeps scratch
 * prefetch objects older than a day (failure paths can orphan them).
 */
async function sweepStuck(db: SupabaseClient): Promise<void> {
  const cutoff = new Date(Date.now() - STUCK_RUN_MS).toISOString();
  const { data: stuck } = await db
    .from('agent_runs')
    .select('id, user_id, external_sender_id, retry_count, media_urls')
    .in('state', ['analyzing', 'committing'])
    .lt('updated_at', cutoff)
    .limit(10);
  for (const run of stuck ?? []) {
    await db
      .from('agent_runs')
      .update({
        state: 'failed',
        last_error: 'stuck run swept',
        retry_count: (run.retry_count as number) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', run.id);
    const scratch = ((run.media_urls as string[]) ?? [])
      .filter((u) => u.startsWith('scratch:'))
      .map((u) => u.slice('scratch:'.length));
    if (scratch.length > 0) {
      await db.storage.from('agent-scratch').remove(scratch).catch(() => {});
    }
    try {
      await reply(
        db,
        { externalSenderId: run.external_sender_id as string, lineNumber: null },
        run.user_id as string,
        FAILURE_REPLY,
        `fail:${run.id}`,
      );
    } catch (err) {
      console.warn('sweep reply failed', String(err));
    }
  }

  // Orphaned prefetch objects (best-effort TTL sweep).
  const { data: objects } = await db.storage
    .from('agent-scratch')
    .list('runs', { limit: 100, sortBy: { column: 'created_at', order: 'asc' } });
  const dayAgo = Date.now() - 86_400_000;
  const stale = (objects ?? [])
    .filter((o) => o.created_at && new Date(o.created_at).getTime() < dayAgo)
    .map((o) => `runs/${o.name}`);
  if (stale.length > 0) {
    await db.storage.from('agent-scratch').remove(stale).catch(() => {});
  }
}

/** Wait out the debounce, then atomically claim the run (one winner). */
async function claimRun(db: SupabaseClient, runId: string): Promise<RunRow | null> {
  for (let i = 0; i < 20; i++) {
    const { data: run } = await db.from('agent_runs').select('*').eq('id', runId).maybeSingle();
    if (!run || run.state !== 'collecting') return null; // claimed elsewhere / gone
    const wait = new Date(run.closes_at).getTime() - Date.now();
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, Math.min(wait + 100, 4_000)));
      continue;
    }
    const mealId = run.meal_id ?? crypto.randomUUID();
    const { data: claimed } = await db
      .from('agent_runs')
      .update({ state: 'analyzing', meal_id: mealId, updated_at: new Date().toISOString() })
      .eq('id', runId)
      .eq('state', 'collecting')
      .select('*')
      .maybeSingle();
    return (claimed as RunRow | null) ?? null; // null → another invocation won
  }
  return null;
}

/**
 * HEIC → JPEG without burning function CPU: park the raw bytes in the private
 * agent-scratch bucket and read them back through Storage's image
 * transformation (imgproxy decodes HEIC natively). In-function wasm conversion
 * was killed by the CPU cap on real 12MP iPhone photos.
 */
async function convertHeicViaStorage(db: SupabaseClient, bytes: Uint8Array): Promise<Uint8Array> {
  const path = `tmp/${crypto.randomUUID()}.heic`;
  const { error } = await db.storage
    .from('agent-scratch')
    .upload(path, bytes.slice().buffer as ArrayBuffer, { contentType: 'image/heic', upsert: true });
  if (error) throw new Error(`scratch upload failed: ${error.message}`);
  try {
    // width+height+contain: width alone leaves the original height in place
    // (a 5712-tall strip — the "zoomed" bug); contain preserves aspect ratio.
    const url =
      `${Deno.env.get('SUPABASE_URL')}/storage/v1/render/image/authenticated/agent-scratch/${path}` +
      `?width=1280&height=1280&resize=contain&quality=80`;
    // The authenticated render endpoint validates a JWT — the auto-injected
    // SUPABASE_SERVICE_ROLE_KEY may be the new sb_secret_ format, so prefer
    // the explicitly configured legacy JWT (secret SERVICE_ROLE_JWT).
    const renderKey =
      Deno.env.get('SERVICE_ROLE_JWT') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${renderKey}`, Accept: 'image/jpeg' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      throw new PhotoFormatError(`render ${res.status}: ${(await res.text()).slice(0, 120)}`);
    }
    const out = new Uint8Array(await res.arrayBuffer());
    if (!(out[0] === 0xff && out[1] === 0xd8)) {
      throw new PhotoFormatError(
        `render returned ${res.headers.get('content-type')} first-bytes=${[...out.slice(0, 4)].join(',')}`,
      );
    }
    return out;
  } finally {
    await db.storage.from('agent-scratch').remove([path]).catch(() => {});
  }
}

async function normalizePhoto(
  db: SupabaseClient,
  bytes: Uint8Array,
): Promise<{ bytes: Uint8Array; mediaType: string }> {
  const kind = sniffImage(bytes);
  if (kind === 'jpeg') return { bytes, mediaType: 'image/jpeg' };
  if (kind === 'png') return { bytes, mediaType: 'image/png' };
  if (kind === 'webp') return { bytes, mediaType: 'image/webp' };
  if (kind === 'heic') {
    return { bytes: await convertHeicViaStorage(db, bytes), mediaType: 'image/jpeg' };
  }
  throw new PhotoFormatError(
    `sniff unknown: len=${bytes.length} first-bytes=${[...bytes.slice(0, 12)].join(',')}`,
  );
}

class PhotoFormatError extends Error {
  constructor(detail = '') {
    super(`unsupported photo format${detail ? `: ${detail}` : ''}`);
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/* --------------------------------- serve --------------------------------- */

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const secret = Deno.env.get('SENDBLUE_WEBHOOK_SECRET') ?? '';
  const headerSecret = req.headers.get('sb-signing-secret') ?? '';
  const legacySecret =
    Deno.env.get('ALLOW_LEGACY_AGENT_QUERY_SECRET') === 'true'
      ? url.searchParams.get('secret') ?? ''
      : '';
  if (!secret || (!secureEqual(headerSecret, secret) && !secureEqual(legacySecret, secret))) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 });
  }
  if (req.method !== 'POST') return ok({ ignored: 'method' });

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return ok({ ignored: 'body' });
  }
  // "Contact is typing" → they may be writing a caption for photos already in
  // an open capture window: nudge the window so the caption makes the batch.
  const typingFrom = isTypingEvent(payload);
  if (typingFrom) {
    const db = admin();
    await db
      .from('agent_runs')
      .update({ closes_at: new Date(Date.now() + DEBOUNCE_MS + 1_000).toISOString() })
      .eq('external_sender_id', typingFrom)
      .eq('state', 'collecting')
      .gte('opened_at', new Date(Date.now() - RUN_HARD_CAP_MS).toISOString());
    return ok({ ignored: 'typing' });
  }

  const env = normalizeSendblue(payload);
  if (!env) {
    // Warm/maintenance ping (the minute cron POSTs an empty body): use it to
    // recover stuck runs + sweep orphaned scratch objects.
    if (typeof payload.from_number !== 'string') {
      const sweep = sweepStuck(admin()).catch((err) => console.warn('sweep failed', String(err)));
      // @ts-ignore EdgeRuntime is provided by the Supabase Edge runtime.
      if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(sweep);
      else await sweep;
      return ok({ maintained: true });
    }
    return ok({ ignored: 'event' });
  }

  const db = admin();

  // Idempotent inbound log + identity resolve, in parallel — the identity is
  // what gates the instant typing ack, so it must not wait behind anything.
  const [insertRes, identityRes] = await Promise.all([
    db
      .from('agent_messages')
      .insert({
        provider: env.provider,
        external_message_id: env.externalMessageId,
        external_sender_id: env.externalSenderId,
        direction: 'in',
        content: env.text || null,
        media_count: env.mediaUrls.length,
      })
      .select('id')
      .maybeSingle(),
    db
      .from('channel_identities')
      .select('user_id, status')
      .eq('provider', env.provider)
      .eq('external_sender_id', env.externalSenderId)
      .maybeSingle(),
  ]);
  const { data: inserted, error: insErr } = insertRes;
  if (insErr) {
    if (insErr.code === '23505') return ok({ ignored: 'duplicate' });
    console.error('message log failed', insErr);
    return ok({ ignored: 'log-error' });
  }
  const messageRowId = inserted!.id as string;
  const identity = identityRes.data;

  // Instant ack: typing bubble fires before any further work (fire-and-forget;
  // kept alive by the waitUntil below). LINK commands get a reply, not typing.
  const typingAck =
    identity?.status === 'active' && !parseLinkCommand(env.text)
      ? sendTyping(env.externalSenderId, env.lineNumber)
      : Promise.resolve();

  const work = (async () => {
    try {
      if (!identity || identity.status !== 'active') {
        // A revoked sender texting LINK is *relinking* — that must reach the
        // consume flow, not bounce off the disconnect message.
        if (identity && !parseLinkCommand(env.text)) {
          return await reply(db, env, null, REVOKED_SENDER_REPLY, `revoked:${env.externalMessageId}`);
        }
        return await handleUnknown(db, env);
      }
      const userId = identity.user_id as string;
      await db.from('agent_messages').update({ user_id: userId }).eq('id', messageRowId);

      if (!(await hasRequiredSubscription(db, userId))) {
        await reply(
          db,
          env,
          userId,
          'Your Oliv Pro access is not active. Open the Oliv app to start a trial, restore a purchase, or redeem a friend code.',
          `subscription:${userId}:${new Date().toISOString().slice(0, 10)}`,
        ).catch(() => {});
        return;
      }

      // Per-user daily quota.
      const { data: used } = await db.rpc('bump_agent_usage', { p_user_id: userId });
      if (typeof used === 'number' && used > DAILY_MESSAGE_LIMIT) {
        // Once-per-day notice: the date-scoped client_ref dedupes racing
        // over-limit messages (unique index enforces it).
        await reply(
          db,
          env,
          userId,
          "We've hit today's message limit — back tomorrow! 🫒",
          `quota:${userId}:${new Date().toISOString().slice(0, 10)}`,
        ).catch(() => {});
        return;
      }

      // Profile context (timezone, privacy default, goals).
      const { data: profile } = await db
        .from('profiles')
        .select('display_name, timezone, default_private, goals')
        .eq('id', userId)
        .maybeSingle();
      const timezone = (profile?.timezone as string | null) ?? null;
      const defaultPrivate = (profile?.default_private as boolean | undefined) ?? true;

      // Photos → capture run; bare text joins an open run as its caption.
      const { data: openRun } = await db
        .from('agent_runs')
        .select('id')
        .eq('external_sender_id', env.externalSenderId)
        .eq('state', 'collecting')
        .maybeSingle();

      if (env.mediaUrls.length > 0 || openRun) {
        // Prefetch DURING the capture window: download + HEIC-convert each
        // photo now, park the JPEG in agent-scratch, and record a scratch ref.
        // The window's debounce then overlaps the slow part instead of
        // preceding it. Prefetch happens BEFORE the run extend/append so the
        // window can't close while a photo is still converting.
        let mediaEntries: string[] = [];
        if (env.mediaUrls.length > 0) {
          mediaEntries = await Promise.all(
            env.mediaUrls.map(async (mediaUrl, i) => {
              try {
                const raw = await fetchMedia(mediaUrl);
                const norm = await normalizePhoto(db, raw);
                const path = `runs/msg-${messageRowId}-${i}.jpg`;
                const { error } = await db.storage
                  .from('agent-scratch')
                  .upload(path, norm.bytes.slice().buffer as ArrayBuffer, {
                    contentType: 'image/jpeg',
                    upsert: true,
                  });
                if (error) throw new Error(error.message);
                return `scratch:${path}`;
              } catch (err) {
                // Legacy path retries (and reports properly) at claim time.
                console.warn('media prefetch failed; deferring', String(err));
                return mediaUrl;
              }
            }),
          );
        }
        const { runId } = await upsertRun(db, env, userId);
        await db
          .from('agent_messages')
          .update({ run_id: runId, content: env.text || null })
          .eq('id', messageRowId);
        if (mediaEntries.length > 0) {
          await db.rpc('append_run_media', { p_run_id: runId, p_urls: mediaEntries });
        }
        const run = await claimRun(db, runId);
        if (!run) return; // another invocation owns the close

        try {
          const { data: fullRun } = await db
            .from('agent_runs')
            .select('media_urls')
            .eq('id', run.id)
            .single();
          const urls: string[] = (fullRun?.media_urls ?? []).slice(0, MAX_RUN_PHOTOS);
          const { data: runMsgs } = await db
            .from('agent_messages')
            .select('external_message_id, content')
            .eq('run_id', run.id)
            .eq('direction', 'in')
            .order('created_at', { ascending: true });
          const caption = (runMsgs ?? [])
            .map((m) => m.content)
            .filter(Boolean)
            .join(' ')
            .slice(0, 500);
          const messageIds = (runMsgs ?? []).map((m) => m.external_message_id as string);

          const photos: { base64: string; mediaType: string }[] = [];
          const uploadBytes: Uint8Array[] = [];
          for (const entry of urls) {
            let norm: { bytes: Uint8Array; mediaType: string };
            if (entry.startsWith('scratch:')) {
              // Prefetched during the capture window — already a JPEG.
              const path = entry.slice('scratch:'.length);
              const { data, error } = await db.storage.from('agent-scratch').download(path);
              if (error || !data) throw new Error(`scratch download failed: ${error?.message}`);
              norm = { bytes: new Uint8Array(await data.arrayBuffer()), mediaType: 'image/jpeg' };
            } else {
              const raw = await fetchMedia(entry);
              norm = await normalizePhoto(db, raw);
            }
            photos.push({ base64: toBase64(norm.bytes), mediaType: norm.mediaType });
            uploadBytes.push(norm.bytes);
          }
          if (photos.length === 0 && !caption) throw new Error('empty run');

          const mealType = mealTypeForHour(hourInTimezone(new Date(), timezone));
          const analysis = await callAgentAnalyze({
            userId,
            photos,
            description: caption || undefined,
            mealType,
          });
          if (!analysis.ok) {
            const msg =
              analysis.status === 429
                ? "You've hit today's analysis limit — I'll be ready again tomorrow 🫒"
                : FAILURE_REPLY;
            await reply(db, env, userId, msg, `fail:${run.id}`);
            await db.from('agent_runs').update({ state: 'failed', last_error: analysis.error }).eq('id', run.id);
            return;
          }

          const paths: string[] = [];
          for (const [i, bytes] of uploadBytes.entries()) {
            paths.push(await uploadPhoto(db, userId, run.meal_id!, i, bytes));
          }

          const ingestionKey = await sha256Hex(ingestionKeyInput(env.provider, messageIds));
          const { validated, score, mealId } = await commitMeal({
            admin: db,
            runId: run.id,
            mealId: run.meal_id!,
            userId,
            ingestionKey,
            description: caption || validated0(analysis.analysis),
            caption: caption || undefined,
            mealType,
            loggedAt: new Date().toISOString(),
            isPrivate: defaultPrivate,
            photoPaths: paths,
            analysis: analysis.analysis,
          });
          await db.from('agent_messages').update({ meal_id: mealId }).eq('run_id', run.id);

          // Running budget (day-so-far incl. this meal, user's timezone) —
          // the single strongest retention pattern from the competitive
          // research. Optional: a failure only drops the budget line.
          let today: { calories: number; proteinG: number; goalCalories: number; goalProteinG: number } | undefined;
          try {
            const since = new Date(Date.now() - 36 * 3_600_000).toISOString();
            const { data: dayMeals } = await db
              .from('meals')
              .select('logged_at, calories, protein_g')
              .eq('user_id', userId)
              .gte('logged_at', since);
            const todayKey = dayKeyInTz(new Date().toISOString(), timezone);
            const todays = (dayMeals ?? []).filter(
              (m) => dayKeyInTz(m.logged_at as string, timezone) === todayKey,
            );
            const goals = (profile?.goals as { dailyCalories?: number; proteinG?: number }) ?? {};
            today = {
              calories: todays.reduce((a, m) => a + (m.calories as number), 0),
              proteinG: todays.reduce((a, m) => a + (m.protein_g as number), 0),
              goalCalories: goals.dailyCalories ?? 2000,
              goalProteinG: goals.proteinG ?? 100,
            };
          } catch (err) {
            console.warn('running-budget calc failed', String(err));
          }

          await reply(
            db,
            env,
            userId,
            formatMealReply({
              title: mealTitle(validated.foodItems, caption || 'Meal'),
              calories: validated.calories,
              proteinG: validated.proteinG,
              carbsG: validated.carbsG,
              fatG: validated.fatG,
              score: score.value,
              confidence: validated.confidence,
              isPrivate: defaultPrivate,
              today,
            }),
            `reply:${run.id}`,
          );
          await db.from('agent_runs').update({ state: 'replied', updated_at: new Date().toISOString() }).eq('id', run.id);
          // Scratch prefetch objects are transient — clear them (best-effort).
          const scratchPaths = urls
            .filter((u) => u.startsWith('scratch:'))
            .map((u) => u.slice('scratch:'.length));
          if (scratchPaths.length > 0) {
            await db.storage.from('agent-scratch').remove(scratchPaths).catch(() => {});
          }
        } catch (err) {
          const isFormat = err instanceof PhotoFormatError;
          console.error('meal run failed', err);
          await db
            .from('agent_runs')
            .update({
              state: 'failed',
              last_error: String(err).slice(0, 500),
              retry_count: run.retry_count + 1,
            })
            .eq('id', run.id);
          // Failure paths must not leak prefetch objects into agent-scratch.
          const { data: failedRun } = await db
            .from('agent_runs')
            .select('media_urls')
            .eq('id', run.id)
            .maybeSingle();
          const orphaned = ((failedRun?.media_urls as string[]) ?? [])
            .filter((u) => u.startsWith('scratch:'))
            .map((u) => u.slice('scratch:'.length));
          if (orphaned.length > 0) {
            await db.storage.from('agent-scratch').remove(orphaned).catch(() => {});
          }
          await reply(db, env, userId, isFormat ? PHOTO_FORMAT_REPLY : FAILURE_REPLY, `fail:${run.id}`);
        }
        return;
      }

      // Text-only → scope guard, then the chat loop.
      const guarded = scopeGuard(env.text);
      if (guarded) {
        return await reply(db, env, userId, guarded, `guard:${env.externalMessageId}`);
      }
      const { data: historyRows } = await db
        .from('agent_messages')
        .select('direction, content')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(31);
      const history = (historyRows ?? [])
        .slice(1) // exclude the triggering message itself
        .reverse()
        .map((m) => ({ direction: m.direction as 'in' | 'out', content: (m.content as string) ?? '' }));

      const { runChatTurn } = await import('./agent.ts');
      const text = await runChatTurn(
        {
          admin: db,
          userId,
          profile: {
            displayName: (profile?.display_name as string) ?? 'there',
            timezone,
            defaultPrivate,
            goals: (profile?.goals as { dailyCalories: number; proteinG: number; carbsG: number; fatG: number }) ?? {
              dailyCalories: 2000,
              proteinG: 100,
              carbsG: 263,
              fatG: 61,
            },
          },
          triggerMessageId: env.externalMessageId,
          triggerText: env.text,
          history,
        },
        env.text,
      );
      await reply(db, env, userId, text, `chat:${env.externalMessageId}`);
    } catch (err) {
      console.error('agent-inbound work failed', err);
      try {
        await reply(db, env, null, FAILURE_REPLY, `err:${env.externalMessageId}`);
      } catch {
        /* last resort: logged above */
      }
    }
  })();

  // Respond to Sendblue immediately; typing ack + pipeline continue in background.
  const background = Promise.allSettled([typingAck, work]);
  // @ts-ignore EdgeRuntime is provided by the Supabase Edge runtime.
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(background);
  else await background;
  return ok();
});

/** Fallback description when a photo-only meal has no caption. */
function validated0(analysis: { foodItems?: string[] }): string {
  return (analysis.foodItems ?? []).slice(0, 3).join(', ') || 'Texted meal';
}
