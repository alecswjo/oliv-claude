// RevenueCat → Oliv subscription mirror.
//
// Deploy: supabase functions deploy revenuecat-webhook --no-verify-jwt
// Secret: REVENUECAT_WEBHOOK_AUTH=<long random value>
// RevenueCat: set its webhook Authorization header to that exact value.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { secureEqual } from '../agent-inbound/logic.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

interface RevenueCatEvent {
  id?: string;
  type?: string;
  app_user_id?: string;
  aliases?: string[];
  entitlement_ids?: string[];
  product_id?: string;
  store?: string;
  environment?: string;
  period_type?: string;
  expiration_at_ms?: number | null;
  event_timestamp_ms?: number;
}

function userId(event: RevenueCatEvent): string | null {
  const ids = [event.app_user_id, ...(event.aliases ?? [])];
  return ids.find((candidate): candidate is string => !!candidate && UUID.test(candidate)) ?? null;
}

Deno.serve(async (req) => {
  const expected = Deno.env.get('REVENUECAT_WEBHOOK_AUTH') ?? '';
  const supplied = req.headers.get('authorization') ?? '';
  if (!expected || !secureEqual(supplied, expected)) return json({ error: 'forbidden' }, 403);
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let event: RevenueCatEvent;
  try {
    const body = await req.json();
    event = body.event as RevenueCatEvent;
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }
  if (!event?.id || !event.type) return json({ error: 'event id and type required' }, 400);
  if (event.type === 'TEST') return json({ ok: true, test: true });

  const entitlement = Deno.env.get('REVENUECAT_ENTITLEMENT_ID') ?? 'pro';
  if (!(event.entitlement_ids ?? []).includes(entitlement)) {
    return json({ ok: true, ignored: 'entitlement' });
  }
  const uid = userId(event);
  if (!uid) {
    // Production purchases must be made after RevenueCat is logged into the
    // Supabase UUID. Returning 200 avoids a futile retry storm; logs expose
    // configuration mistakes without accepting an anonymous entitlement.
    console.error('RevenueCat event has no UUID app user id', event.id);
    return json({ ok: true, ignored: 'anonymous-user' });
  }

  const expiration =
    typeof event.expiration_at_ms === 'number'
      ? new Date(event.expiration_at_ms).toISOString()
      : null;
  const expired = event.type === 'EXPIRATION' ||
    (expiration != null && new Date(expiration).getTime() <= Date.now());
  const status = expired
    ? 'expired'
    : event.type === 'BILLING_ISSUE'
      ? 'billing_issue'
      : event.type === 'CANCELLATION'
        ? 'cancelled'
        : 'active';
  const eventAt = new Date(event.event_timestamp_ms ?? Date.now()).toISOString();

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data, error } = await admin.rpc('apply_revenuecat_subscription_event', {
    p_event_id: event.id,
    p_user_id: uid,
    p_entitlement_id: entitlement,
    p_product_id: event.product_id ?? null,
    p_store: event.store ?? null,
    p_environment: event.environment ?? null,
    p_period_type: event.period_type ?? null,
    p_status: status,
    p_expires_at: expiration,
    p_event_type: event.type,
    p_event_at: eventAt,
  });
  if (error) {
    console.error('subscription mirror failed', error);
    return json({ error: 'write failed' }, 500);
  }
  return json({ ok: true, applied: data === true });
});

