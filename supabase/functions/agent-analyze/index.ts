// Oliv agent meal-analysis entry point (docs/AGENT_V0_SPEC.md §9).
//
// The texting gateway (agent-inbound) cannot present a user JWT — the sender
// is authenticated by their channel identity, not a Supabase session — so this
// function is deployed WITHOUT platform JWT verification and authenticates the
// caller with a shared secret instead (same trust model as `notify`). It
// shares providers.ts verbatim with the user-facing `analyze` function: one
// prompt, one schema, one server-side OpenAI key, one quota counter.
//
// Deploy:  supabase functions deploy agent-analyze --no-verify-jwt
// Secret:  supabase secrets set AGENT_SECRET=<random>

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { analyze, MAX_PHOTOS, ProviderError, type AnalyzeInput } from '../analyze/providers.ts';
import { secureEqual } from '../agent-inbound/logic.ts';

// Mirrors `analyze`'s abuse guards, except the per-photo cap: this caller is
// our own trusted gateway sending real iPhone photos, which routinely exceed
// the app's client-resized 1.5MB — OpenAI itself accepts far larger.
const DAILY_LIMIT = 60;
const MAX_DESCRIPTION_CHARS = 4_000; // corrections carry prior-analysis context
const MAX_PHOTO_BASE64_CHARS = 11_000_000; // ≈8MB binary per photo
const ALLOWED_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const VALID_MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function withinQuota(userId: string): Promise<boolean> {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data, error } = await admin.rpc('bump_analyze_usage', { p_user_id: userId });
  if (error) {
    console.error('quota check failed', error);
    return true; // fail open — quota is an abuse guard, not a gate
  }
  return (data as number) <= DAILY_LIMIT;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  const secret = Deno.env.get('AGENT_SECRET') ?? '';
  if (!secret || !secureEqual(req.headers.get('x-agent-secret') ?? '', secret)) {
    return json({ error: 'forbidden' }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }

  const userId = typeof body.userId === 'string' ? body.userId : '';
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return json({ error: 'userId required' }, 400);
  if (!(await withinQuota(userId))) {
    return json({ error: 'Daily analysis limit reached — try again tomorrow.', code: 'quota' }, 429);
  }

  const photos = (Array.isArray(body.photos) ? body.photos : [])
    .filter((p: unknown): p is { base64: string; mediaType?: string } =>
      typeof (p as { base64?: unknown })?.base64 === 'string')
    .slice(0, MAX_PHOTOS)
    .map((p: { base64: string; mediaType?: string }) => ({
      base64: p.base64,
      mediaType:
        typeof p.mediaType === 'string' && ALLOWED_MEDIA_TYPES.has(p.mediaType)
          ? p.mediaType
          : 'image/jpeg',
    }));
  if (photos.some((p: { base64: string }) => p.base64.length > MAX_PHOTO_BASE64_CHARS)) {
    return json({ error: 'photo too large' }, 413);
  }

  const mealType = typeof body.mealType === 'string' ? body.mealType : '';
  if (!VALID_MEAL_TYPES.includes(mealType)) {
    return json({ error: 'mealType must be one of ' + VALID_MEAL_TYPES.join(', ') }, 400);
  }

  // Corrections re-analyze with structured prior context: the estimator sees
  // its previous numbers and the user's fix, instead of a blind re-run.
  let description = typeof body.description === 'string' ? body.description : '';
  const correction = body.correction as
    | { previousAnalysis?: unknown; previousDescription?: string; instruction?: string }
    | undefined;
  if (correction?.instruction) {
    description =
      `${correction.previousDescription ?? description}\n` +
      `Previous estimate (JSON): ${JSON.stringify(correction.previousAnalysis ?? {}).slice(0, 1500)}\n` +
      `The user corrected this estimate: "${String(correction.instruction).slice(0, 500)}". ` +
      `Re-estimate the whole meal applying the correction; keep unaffected values consistent with the previous estimate.`;
  }

  const input: AnalyzeInput = {
    photos,
    description: description.slice(0, MAX_DESCRIPTION_CHARS) || undefined,
    mealType: mealType as AnalyzeInput['mealType'],
  };

  try {
    const analysis = await analyze(input);
    return json({ analysis });
  } catch (err) {
    if (err instanceof ProviderError) {
      return json({ error: err.message, code: 'provider_error' }, err.status);
    }
    console.error('agent analysis failed', err);
    return json({ error: 'analysis failed' }, 502);
  }
});
