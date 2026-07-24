#!/usr/bin/env node
/**
 * End-to-end smoke test for the texting agent (docs/AGENT_V0_SPEC.md §13),
 * run against a DEPLOYED backend. Simulates Sendblue webhooks with a synthetic
 * sender, so no real iMessage traffic is involved and no real phone number
 * gets linked. Asserts: linking, photo→meal ingestion, exactly-once across a
 * duplicate delivery, and text-only chat logging.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... AGENT_SECRET=... \
 *     node scripts/agent-smoke.mjs
 *
 * Note: outbound replies target the fake sender and will fail at Sendblue —
 * that's expected; the assertions stop at the database layer.
 */

import { createClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'node:crypto';

const URL_ = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AGENT_SECRET = process.env.AGENT_SECRET;
if (!URL_ || !SERVICE_KEY || !AGENT_SECRET) {
  console.error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AGENT_SECRET');
  process.exit(1);
}

const db = createClient(URL_, SERVICE_KEY);
// Webhook auth is header-based (sb-signing-secret). WEBHOOK_SECRET should be
// the deployed SENDBLUE_WEBHOOK_SECRET; AGENT_SECRET remains the fallback for
// older deploys still on the query-param scheme.
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? AGENT_SECRET;
const WEBHOOK = `${URL_}/functions/v1/agent-inbound`;
const SENDER = '+15005550006'; // reserved test number — never a real phone
let failures = 0;

function assert(cond, label) {
  console.log(`${cond ? '  ✓' : '  ✗ FAIL'} ${label}`);
  if (!cond) failures += 1;
}

async function webhook(over = {}) {
  const res = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'sb-signing-secret': WEBHOOK_SECRET },
    body: JSON.stringify({
      accountEmail: 'oliv',
      is_outbound: false,
      message_type: 'message',
      from_number: SENDER,
      to_number: '+13054098546',
      message_handle: randomUUID(),
      content: '',
      media_url: '',
      ...over,
    }),
  });
  if (res.status !== 200) throw new Error(`webhook ${res.status}: ${await res.text()}`);
  return res.json();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pollMeals(userId, minCount, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data } = await db.from('meals').select('*').eq('user_id', userId).eq('via', 'imessage');
    if ((data ?? []).length >= minCount) return data;
    await sleep(2_000);
  }
  const { data } = await db.from('meals').select('*').eq('user_id', userId).eq('via', 'imessage');
  return data ?? [];
}

async function main() {
  console.log('— setup: synthetic user + link token');
  const email = `agent-smoke-${Date.now()}@example.com`;
  const { data: created, error: userErr } = await db.auth.admin.createUser({
    email,
    email_confirm: true,
    password: randomUUID(),
  });
  if (userErr) throw userErr;
  const userId = created.user.id;
  await db.from('profiles').insert({
    id: userId,
    username: `smoke${Date.now() % 1e7}`,
    display_name: 'Smoke Test',
    goals: { dailyCalories: 2000, proteinG: 100, carbsG: 263, fatG: 61 },
  });
  const token = randomUUID().replaceAll('-', '');
  await db.from('channel_link_tokens').insert({
    user_id: userId,
    token_hash: createHash('sha256').update(token).digest('hex'),
    timezone: 'America/Los_Angeles',
    expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  });

  console.log('— stranger message → cooldown, no crash');
  await webhook({ content: 'hey what is this' });
  await sleep(2_000);

  console.log('— LINK consumes the token');
  await webhook({ content: `LINK ${token}` });
  await sleep(3_000);
  const { data: identity } = await db
    .from('channel_identities')
    .select('*')
    .eq('external_sender_id', SENDER)
    .maybeSingle();
  assert(identity?.user_id === userId && identity?.status === 'active', 'sender linked to the test user');
  const { data: prof } = await db.from('profiles').select('timezone').eq('id', userId).single();
  assert(prof?.timezone === 'America/Los_Angeles', 'timezone captured at link time');

  console.log('— photo webhook → analyzed meal (this calls OpenAI; ~15-30s)');
  // Any public food-photo URL works; a bucket upload keeps the test self-contained.
  const imgRes = await fetch(
    'https://upload.wikimedia.org/wikipedia/commons/6/6d/Good_Food_Display_-_NCI_Visuals_Online.jpg',
    { headers: { 'user-agent': 'oliv-agent-smoke/1.0 (agent pipeline test)' } },
  );
  if (!imgRes.ok) throw new Error(`fixture image fetch failed: ${imgRes.status}`);
  const imgBytes = new Uint8Array(await imgRes.arrayBuffer());
  if (!(imgBytes[0] === 0xff && imgBytes[1] === 0xd8)) throw new Error('fixture is not a JPEG');
  const fixturePath = `${userId}/smoke-fixture.jpg`;
  await db.storage.from('meal-photos').upload(fixturePath, imgBytes, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  const { data: pub, error: signErr } = await db.storage.from('meal-photos').createSignedUrl(fixturePath, 3600);
  if (signErr) throw signErr;
  const photoEvent = {
    message_handle: randomUUID(),
    content: 'smoke test lunch',
    media_url: pub.signedUrl,
  };
  await webhook(photoEvent);
  const meals = await pollMeals(userId, 1);
  assert(meals.length === 1, `photo produced exactly one meal (got ${meals.length})`);
  const meal = meals[0];
  if (meal) {
    assert(meal.calories > 0, `analysis produced calories (${meal.calories})`);
    assert(meal.health_score_value >= 1 && meal.health_score_value <= 5, `health score ${meal.health_score_value}`);
    assert((meal.photo_paths ?? []).length === 1, 'photo stored at the app path');
    assert(meal.is_private === true, 'meal respects the (new-user) private default');
    assert(meal.via === 'imessage', "via = 'imessage'");
  }

  console.log('— duplicate webhook delivery → still exactly one meal');
  await webhook(photoEvent); // same message_handle
  await sleep(8_000);
  const after = await pollMeals(userId, 1, 5_000);
  assert(after.length === 1, `exactly-once held across duplicate delivery (got ${after.length})`);

  console.log('— text-only chat: "log 2 eggs and toast" (agent loop + tools; ~20-40s)');
  await webhook({ message_handle: randomUUID(), content: 'log 2 scrambled eggs and buttered toast for breakfast' });
  const withChat = await pollMeals(userId, 2, 90_000);
  assert(withChat.length === 2, `chat tool logged a second meal (got ${withChat.length})`);

  console.log('— run states');
  const { data: runs } = await db
    .from('agent_runs')
    .select('state, retry_count, last_error')
    .eq('user_id', userId);
  for (const r of runs ?? []) {
    console.log(`  run: ${r.state}${r.last_error ? ` — ${r.last_error.slice(0, 300)}` : ''}`);
  }
  const { data: outbound } = await db
    .from('agent_messages')
    .select('content')
    .eq('user_id', userId)
    .eq('direction', 'out');
  console.log(`  outbound replies logged: ${(outbound ?? []).length}`);

  if (failures > 0) {
    console.log(`\nSMOKE FAIL (${failures}) — leaving test data in place for inspection (user ${userId})`);
    process.exit(1);
  }

  console.log('— cleanup');
  await db.storage.from('meal-photos').remove([
    fixturePath,
    ...meals.flatMap((m) => m.photo_paths ?? []),
    ...withChat.flatMap((m) => m.photo_paths ?? []),
  ]);
  await db.auth.admin.deleteUser(userId); // cascades profiles → meals/agent rows

  console.log(failures === 0 ? '\nSMOKE PASS' : `\nSMOKE FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('smoke crashed:', err);
  process.exit(1);
});
