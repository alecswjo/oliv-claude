// In-app account deletion (App Store Guideline 5.1.1(v)).
//
// Verifies the caller's JWT, then with the service role:
//   1. removes every storage object under meal-photos/<uid>/ (storage rows
//      have no FK to meals and would NOT cascade),
//   2. deletes the auth user — profiles → meals/follows/olives/comments all
//      cascade from profiles(id) references auth.users(id) on delete cascade.
//
// Deploy: supabase functions deploy delete-account

import { createClient } from 'jsr:@supabase/supabase-js@2';

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

  const authHeader = req.headers.get('Authorization') ?? '';
  const asCaller = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authErr } = await asCaller.auth.getUser();
  if (authErr || !user) return json({ error: 'unauthorized' }, 401);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // 1. purge photos (paginate defensively; a user folder is small in practice)
    const bucket = admin.storage.from('meal-photos');
    for (;;) {
      const { data: objects, error: listErr } = await bucket.list(user.id, { limit: 100 });
      if (listErr) throw listErr;
      if (!objects || objects.length === 0) break;
      const { error: rmErr } = await bucket.remove(objects.map((o) => `${user.id}/${o.name}`));
      if (rmErr) throw rmErr;
      if (objects.length < 100) break;
    }

    // 2. delete the auth user (cascades all rows)
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) throw delErr;

    return json({ ok: true });
  } catch (err) {
    console.error('account deletion failed', err);
    return json({ error: 'deletion failed — contact support' }, 500);
  }
});
