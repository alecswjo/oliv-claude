// Oliv push-notification fan-out.
//
// Called by Postgres triggers (via pg_net) on insert into olives / comments /
// follows / meals. Verifies a shared secret (NOT a user JWT — there's no user
// in a trigger), resolves the recipient(s), honors their notification prefs,
// and sends Expo push messages with the server-side key.
//
// Deploy:  supabase functions deploy notify --no-verify-jwt
// Secret:  supabase secrets set NOTIFY_SECRET=<random>   (must match private.app_settings)

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BACKFILL_GUARD_MS = 60 * 60 * 1000; // skip meals older than 1h (re-sync spam guard)

type Payload = { type: 'olive' | 'comment' | 'follow' | 'meal'; record: Record<string, unknown> };
type Target = { recipient: string; prefColumn: 'olives' | 'comments' | 'follows' | 'new_posts' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function displayName(admin: SupabaseClient, userId: string): Promise<string> {
  const { data } = await admin.from('profiles').select('display_name').eq('id', userId).maybeSingle();
  return (data?.display_name as string) || 'Someone';
}

/** Resolve who to notify + which preference gates it, plus the actor + message. */
async function resolve(
  admin: SupabaseClient,
  { type, record }: Payload,
): Promise<{ targets: Target[]; actor: string; title: string; body: string; data: Record<string, unknown> } | null> {
  if (type === 'olive') {
    const actor = record.user_id as string;
    const { data: meal } = await admin.from('meals').select('user_id').eq('id', record.meal_id).maybeSingle();
    const owner = meal?.user_id as string | undefined;
    if (!owner || owner === actor) return null;
    return {
      targets: [{ recipient: owner, prefColumn: 'olives' }],
      actor,
      title: await displayName(admin, actor),
      body: 'gave your meal an olive 🫒',
      data: { type: 'olive', mealId: record.meal_id },
    };
  }

  if (type === 'comment') {
    const actor = record.user_id as string;
    const { data: meal } = await admin.from('meals').select('user_id').eq('id', record.meal_id).maybeSingle();
    const owner = meal?.user_id as string | undefined;
    if (!owner || owner === actor) return null;
    const text = String(record.text ?? '').slice(0, 100);
    return {
      targets: [{ recipient: owner, prefColumn: 'comments' }],
      actor,
      title: await displayName(admin, actor),
      body: `commented: “${text}”`,
      data: { type: 'comment', mealId: record.meal_id },
    };
  }

  if (type === 'follow') {
    const actor = record.follower_id as string;
    const recipient = record.following_id as string;
    if (!recipient || recipient === actor) return null;
    return {
      targets: [{ recipient, prefColumn: 'follows' }],
      actor,
      title: await displayName(admin, actor),
      body: 'started following you',
      data: { type: 'follow', userId: actor },
    };
  }

  // new post → fan out to the poster's followers
  const actor = record.user_id as string;
  if (record.is_private === true) return null;
  const loggedAt = record.logged_at ? Date.parse(String(record.logged_at)) : Date.now();
  if (Number.isFinite(loggedAt) && Date.now() - loggedAt > BACKFILL_GUARD_MS) return null; // backfill guard
  const { data: followers } = await admin.from('follows').select('follower_id').eq('following_id', actor).limit(1000);
  const targets: Target[] = (followers ?? []).map((f) => ({ recipient: f.follower_id as string, prefColumn: 'new_posts' }));
  if (targets.length === 0) return null;
  const foods = Array.isArray(record.food_items) ? (record.food_items as string[]) : [];
  const label = (record.caption as string) || foods[0] || 'a meal';
  return {
    targets,
    actor,
    title: await displayName(admin, actor),
    body: `just posted ${label}`,
    data: { type: 'newPost', mealId: record.id },
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (req.headers.get('x-notify-secret') !== Deno.env.get('NOTIFY_SECRET')) {
    return json({ error: 'forbidden' }, 403);
  }

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }
  if (!['olive', 'comment', 'follow', 'meal'].includes(payload.type)) {
    return json({ error: 'unknown type' }, 400);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const resolved = await resolve(admin, payload);
  if (!resolved) return json({ sent: 0, reason: 'no recipients' });

  // Filter recipients by their prefs (default true when no row), gather tokens.
  const messages: Record<string, unknown>[] = [];
  for (const { recipient, prefColumn } of resolved.targets) {
    const { data: pref } = await admin
      .from('notification_prefs')
      .select(prefColumn)
      .eq('user_id', recipient)
      .maybeSingle();
    if (pref && (pref as Record<string, boolean>)[prefColumn] === false) continue;

    const { data: tokens } = await admin.from('device_tokens').select('token').eq('user_id', recipient);
    for (const row of tokens ?? []) {
      messages.push({
        to: row.token,
        title: resolved.title,
        body: resolved.body,
        sound: 'default',
        data: resolved.data,
      });
    }
  }

  if (messages.length === 0) return json({ sent: 0, reason: 'no tokens' });

  // Expo accepts up to 100 messages per request.
  let sent = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(batch),
      });
      if (res.ok) sent += batch.length;
      else console.error('expo push error', res.status, (await res.text()).slice(0, 300));
    } catch (err) {
      console.error('expo push failed', String(err));
    }
  }

  return json({ sent });
});
