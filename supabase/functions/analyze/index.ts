// Oliv meal-analysis proxy.
//
// The app POSTs { photos?, description?, mealType } with the user's Supabase
// auth token. We verify the user, enforce a per-user daily quota, call the
// configured LLM provider using the SERVER-SIDE key, and return the raw
// MealAnalysis. The key never leaves the server.
//
// Deploy:  supabase functions deploy analyze
// Secrets: supabase secrets set OPENAI_API_KEY=sk-...  (OPENAI_MODEL optional)

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { analyze, MAX_PHOTOS, ProviderError, type AnalyzeInput } from './providers.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Abuse guards: account creation is free, the OpenAI bill is not.
const DAILY_LIMIT = 60; // analyses per user per UTC day
const MAX_DESCRIPTION_CHARS = 1_000;
const MAX_PHOTO_BASE64_CHARS = 2_000_000; // ≈1.5MB binary per photo
const ALLOWED_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

/** Increment today's counter; true when the user is within quota. */
async function withinQuota(userId: string): Promise<boolean> {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data, error } = await admin.rpc('bump_analyze_usage', { p_user_id: userId });
  if (error) {
    // Fail open on infrastructure errors — quota is an abuse guard, not a gate.
    console.error('quota check failed', error);
    return true;
  }
  return (data as number) <= DAILY_LIMIT;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  // --- authenticate the caller ---
  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return json({ error: 'unauthorized' }, 401);

  if (!(await withinQuota(user.id))) {
    return json({ error: 'Daily analysis limit reached — try again tomorrow.' }, 429);
  }

  // --- parse + cap input ---
  let input: AnalyzeInput;
  try {
    const body = await req.json();
    const photos = (Array.isArray(body.photos) ? body.photos : [])
      .filter((p: unknown): p is { base64: string; mediaType?: string } =>
        typeof (p as { base64?: unknown })?.base64 === 'string')
      .slice(0, MAX_PHOTOS)
      .map((p) => ({
        base64: p.base64,
        mediaType:
          typeof p.mediaType === 'string' && ALLOWED_MEDIA_TYPES.has(p.mediaType)
            ? p.mediaType
            : 'image/jpeg',
      }));
    // Back-compat: older clients send a single photoBase64.
    if (photos.length === 0 && typeof body.photoBase64 === 'string') {
      photos.push({ base64: body.photoBase64, mediaType: 'image/jpeg' });
    }
    if (photos.some((p) => p.base64.length > MAX_PHOTO_BASE64_CHARS)) {
      return json({ error: 'photo too large' }, 413);
    }
    input = {
      photos,
      description:
        typeof body.description === 'string'
          ? body.description.slice(0, MAX_DESCRIPTION_CHARS)
          : undefined,
      mealType: body.mealType,
    };
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }
  const validTypes = ['breakfast', 'lunch', 'dinner', 'snack'];
  if (!validTypes.includes(input.mealType)) {
    return json({ error: 'mealType must be one of ' + validTypes.join(', ') }, 400);
  }

  // --- analyze ---
  try {
    const analysis = await analyze(input);
    return json({ analysis });
  } catch (err) {
    if (err instanceof ProviderError) {
      return json({ error: err.message, code: 'provider_error' }, err.status);
    }
    // Never leak internal error detail to clients; logs keep the specifics.
    console.error('analysis failed', err);
    return json({ error: 'analysis failed' }, 502);
  }
});
