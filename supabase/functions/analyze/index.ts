// Oliv meal-analysis proxy.
//
// The app POSTs { photoBase64?, photoMediaType?, description?, mealType } with
// the user's Supabase auth token. We verify the user, call the configured LLM
// provider using the SERVER-SIDE key, and return the raw MealAnalysis. The key
// never leaves the server, so it can't be extracted from the app binary.
//
// Deploy:  supabase functions deploy analyze
// Secrets: supabase secrets set OPENAI_API_KEY=sk-...  (OPENAI_MODEL optional)

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { analyze, ProviderError, type AnalyzeInput } from './providers.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
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

  // --- parse input ---
  let input: AnalyzeInput;
  try {
    const body = await req.json();
    input = {
      photoBase64: typeof body.photoBase64 === 'string' ? body.photoBase64 : undefined,
      photoMediaType: body.photoMediaType,
      description: typeof body.description === 'string' ? body.description : undefined,
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
    return json({ error: 'analysis failed', detail: String(err) }, 502);
  }
});
