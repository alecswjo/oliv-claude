// Sendblue provider adapter — the only file that knows the vendor's API.
// Swapping providers later = a new adapter exposing the same three calls.

const API_BASE = 'https://api.sendblue.co/api';

function headers(): Record<string, string> {
  return {
    'content-type': 'application/json',
    'sb-api-key-id': Deno.env.get('SENDBLUE_API_KEY') ?? '',
    'sb-api-secret-key': Deno.env.get('SENDBLUE_API_SECRET') ?? '',
  };
}

/** Send a single text message. Sendblue queues at 1 msg/sec per line. */
export async function sendMessage(number: string, content: string): Promise<void> {
  const res = await fetch(`${API_BASE}/send-message`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ number, content }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`sendblue send failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

/** Best-effort typing indicator (the <2s ack). Never throws. */
export async function sendTyping(number: string): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/send-typing-indicator`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ number }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) console.warn('sendblue typing failed', res.status);
  } catch (err) {
    console.warn('sendblue typing failed', String(err));
  }
}

/** Download an inbound media attachment. */
export async function fetchMedia(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`media fetch failed ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}
