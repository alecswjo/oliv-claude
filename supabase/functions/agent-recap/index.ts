// Daily recap sender (opt-in via the agent's set_daily_recap tool).
//
// An hourly pg_cron tick (migration 0016) POSTs here; we find users whose
// local recap hour has arrived and text them a deterministic, template-based
// summary of their day — no LLM call, so recaps are instant, cheap, and never
// hallucinate numbers.
//
// Deploy:  supabase functions deploy agent-recap --no-verify-jwt
// Auth:    sb-signing-secret header (same SENDBLUE_WEBHOOK_SECRET as the gateway)

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { sendMessage } from '../agent-inbound/sendblue.ts';
import { hourInTimezone, secureEqual } from '../agent-inbound/logic.ts';
import { dayKeyInTz } from '../agent-inbound/ops.ts';

const BATCH = 50;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function recapText(args: {
  mealCount: number;
  calories: number;
  proteinG: number;
  goalCalories: number;
  goalProteinG: number;
  avgScore: number | null;
}): string {
  const { mealCount, calories, proteinG, goalCalories, goalProteinG, avgScore } = args;
  if (mealCount === 0) {
    return "Quick evening check-in 🫒 If logging today would be useful, send a photo or a sentence. If not, no guilt — we can pick it up tomorrow.";
  }
  const calDelta = calories - goalCalories;
  const calLine =
    Math.abs(calDelta) <= goalCalories * 0.05
      ? 'right on your calorie target'
      : calDelta > 0
        ? `${calDelta} over your calorie target`
        : `${-calDelta} under your calorie target`;
  const proteinLine =
    proteinG >= goalProteinG
      ? `protein goal hit (${proteinG}/${goalProteinG}g) 💪`
      : `${goalProteinG - proteinG}g of protein short (${proteinG}/${goalProteinG}g)`;
  const scoreLine = avgScore != null ? ` Avg score ${avgScore.toFixed(1)} 🫒` : '';
  return `Day recap: ${mealCount} meal${mealCount === 1 ? '' : 's'}, ${calories} cal — ${calLine}, ${proteinLine}.${scoreLine}`;
}

/** Insert-first outbound dedupe (client_ref unique index), then send. */
async function sendOnce(
  db: SupabaseClient,
  sender: string,
  userId: string,
  content: string,
  clientRef: string,
): Promise<boolean> {
  const { data: claimed, error } = await db
    .from('agent_messages')
    .insert({
      provider: 'sendblue',
      external_sender_id: sender,
      user_id: userId,
      direction: 'out',
      content,
      client_ref: clientRef,
    })
    .select('id')
    .maybeSingle();
  if (error?.code === '23505') return false;
  if (error) throw new Error(error.message);
  try {
    await sendMessage(sender, content, null);
    return true;
  } catch (err) {
    await db.from('agent_messages').delete().eq('id', claimed!.id).then(undefined, () => {});
    throw err;
  }
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('SENDBLUE_WEBHOOK_SECRET') ?? '';
  if (!secret || !secureEqual(req.headers.get('sb-signing-secret') ?? '', secret)) {
    return json({ error: 'forbidden' }, 403);
  }
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: prefs } = await db
    .from('agent_prefs')
    .select('user_id, recap_hour, last_recap_date')
    .eq('daily_recap', true)
    .limit(BATCH);

  let sent = 0;
  for (const pref of prefs ?? []) {
    try {
      const userId = pref.user_id as string;
      const { data: profile } = await db
        .from('profiles')
        .select('timezone, goals')
        .eq('id', userId)
        .maybeSingle();
      const tz = (profile?.timezone as string | null) ?? null;
      const now = new Date();
      const todayKey = dayKeyInTz(now.toISOString(), tz);
      if (hourInTimezone(now, tz) !== pref.recap_hour) continue;
      if (pref.last_recap_date === todayKey) continue;

      const { data: identity } = await db
        .from('channel_identities')
        .select('external_sender_id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle();
      if (!identity) continue;

      const since = new Date(Date.now() - 36 * 3_600_000).toISOString();
      const { data: meals } = await db
        .from('meals')
        .select('logged_at, calories, protein_g, health_score_value')
        .eq('user_id', userId)
        .gte('logged_at', since);
      const todays = (meals ?? []).filter((m) => dayKeyInTz(m.logged_at, tz) === todayKey);
      const goals = (profile?.goals as { dailyCalories?: number; proteinG?: number }) ?? {};

      const text = recapText({
        mealCount: todays.length,
        calories: Math.round(todays.reduce((a, m) => a + (m.calories as number), 0)),
        proteinG: Math.round(todays.reduce((a, m) => a + (m.protein_g as number), 0)),
        goalCalories: goals.dailyCalories ?? 2000,
        goalProteinG: goals.proteinG ?? 100,
        avgScore:
          todays.length > 0
            ? todays.reduce((a, m) => a + (m.health_score_value as number), 0) / todays.length
            : null,
      });

      const delivered = await sendOnce(
        db,
        identity.external_sender_id as string,
        userId,
        text,
        `recap:${userId}:${todayKey}`,
      );
      await db
        .from('agent_prefs')
        .update({ last_recap_date: todayKey, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
      if (delivered) sent += 1;
    } catch (err) {
      console.error('recap failed for user', pref.user_id, String(err));
    }
  }

  return json({ sent });
});
