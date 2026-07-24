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
// Secrets: AGENT_SECRET, SENDBLUE_API_KEY, SENDBLUE_API_SECRET, OPENAI_API_KEY
// Webhook URL (set in Sendblue dashboard):
//   https://<ref>.supabase.co/functions/v1/agent-inbound?secret=<AGENT_SECRET>

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
  mealTypeForHour,
  normalizeSendblue,
  parseLinkCommand,
  scopeGuard,
  sniffImage,
  type MessageEnvelope,
} from './logic.ts';
import { fetchMedia, sendMessage, sendTyping } from './sendblue.ts';
import { callAgentAnalyze, commitMeal, sha256Hex, uploadPhoto } from './ops.ts';
import { runChatTurn } from './agent.ts';

const DEBOUNCE_MS = 3_000;
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

/** Retry-safe outbound send: one send per (sender, clientRef), logged. */
async function reply(
  db: SupabaseClient,
  env: { externalSenderId: string },
  userId: string | null,
  content: string,
  clientRef: string,
): Promise<void> {
  const { data: existing } = await db
    .from('agent_messages')
    .select('id')
    .eq('client_ref', clientRef)
    .maybeSingle();
  if (existing) return;
  await sendMessage(env.externalSenderId, content);
  await db.from('agent_messages').insert({
    provider: 'sendblue',
    external_sender_id: env.externalSenderId,
    user_id: userId,
    direction: 'out',
    content,
    client_ref: clientRef,
  });
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
  if (error) throw new Error(`run insert failed: ${error.message}`);
  return { runId: data.id, opened: true };
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

async function normalizePhoto(bytes: Uint8Array): Promise<{ bytes: Uint8Array; mediaType: string }> {
  const kind = sniffImage(bytes);
  if (kind === 'jpeg') return { bytes, mediaType: 'image/jpeg' };
  if (kind === 'png') return { bytes, mediaType: 'image/png' };
  if (kind === 'webp') return { bytes, mediaType: 'image/webp' };
  if (kind === 'heic') {
    const { default: convert } = await import('npm:heic-convert@^2.1.0');
    const out = await convert({ buffer: bytes.slice().buffer, format: 'JPEG', quality: 0.82 });
    return { bytes: new Uint8Array(out as ArrayBuffer), mediaType: 'image/jpeg' };
  }
  throw new PhotoFormatError();
}

class PhotoFormatError extends Error {}

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
  const secret = Deno.env.get('AGENT_SECRET');
  const given = url.searchParams.get('secret') ?? req.headers.get('x-agent-secret');
  if (!secret || given !== secret) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 });
  }
  if (req.method !== 'POST') return ok({ ignored: 'method' });

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return ok({ ignored: 'body' });
  }
  const env = normalizeSendblue(payload);
  if (!env) return ok({ ignored: 'event' });

  const db = admin();

  // Idempotent inbound log — a duplicate delivery ends here.
  const { data: inserted, error: insErr } = await db
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
    .maybeSingle();
  if (insErr) {
    if (insErr.code === '23505') return ok({ ignored: 'duplicate' });
    console.error('message log failed', insErr);
    return ok({ ignored: 'log-error' });
  }
  const messageRowId = inserted!.id as string;

  // Resolve the sender.
  const { data: identity } = await db
    .from('channel_identities')
    .select('user_id, status')
    .eq('provider', env.provider)
    .eq('external_sender_id', env.externalSenderId)
    .maybeSingle();

  const work = (async () => {
    try {
      if (!identity) return await handleUnknown(db, env);
      if (identity.status !== 'active') {
        return await reply(db, env, null, REVOKED_SENDER_REPLY, `revoked:${env.externalMessageId}`);
      }
      const userId = identity.user_id as string;
      await db.from('agent_messages').update({ user_id: userId }).eq('id', messageRowId);

      // Per-user daily quota.
      const { data: used } = await db.rpc('bump_agent_usage', { p_user_id: userId });
      if (typeof used === 'number' && used > DAILY_MESSAGE_LIMIT) {
        if (used === DAILY_MESSAGE_LIMIT + 1) {
          await reply(db, env, userId, "We've hit today's message limit — back tomorrow! 🫒", `quota:${env.externalMessageId}`);
        }
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
        const { runId, opened } = await upsertRun(db, env, userId);
        await db
          .from('agent_messages')
          .update({ run_id: runId, content: env.text || null })
          .eq('id', messageRowId);
        // Stash media URLs on the message row content? No — keep them in a
        // dedicated column-free way: we re-fetch from run messages below via
        // the media map table. Simplest durable option: append to run state.
        if (env.mediaUrls.length > 0) {
          await db.rpc('append_run_media', {
            p_run_id: runId,
            p_urls: env.mediaUrls,
          });
        }
        if (opened) await sendTyping(env.externalSenderId);

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
          for (const mediaUrl of urls) {
            const raw = await fetchMedia(mediaUrl);
            const norm = await normalizePhoto(raw);
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
            }),
            `reply:${run.id}`,
          );
          await db.from('agent_runs').update({ state: 'replied', updated_at: new Date().toISOString() }).eq('id', run.id);
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
          await reply(db, env, userId, isFormat ? PHOTO_FORMAT_REPLY : FAILURE_REPLY, `fail:${run.id}`);
        }
        return;
      }

      // Text-only → scope guard, then the chat loop.
      const guarded = scopeGuard(env.text);
      if (guarded) {
        return await reply(db, env, userId, guarded, `guard:${env.externalMessageId}`);
      }
      await sendTyping(env.externalSenderId);
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

  // Respond to Sendblue immediately; the pipeline continues in background.
  // @ts-ignore EdgeRuntime is provided by the Supabase Edge runtime.
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(work);
  else await work;
  return ok();
});

/** Fallback description when a photo-only meal has no caption. */
function validated0(analysis: { foodItems?: string[] }): string {
  return (analysis.foodItems ?? []).slice(0, 3).join(', ') || 'Texted meal';
}
