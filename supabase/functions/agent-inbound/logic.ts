// Pure logic for the texting gateway — no Deno/npm imports so the Jest suite
// can exercise it directly (__tests__/agent/logic.test.ts). Everything with IO
// lives in index.ts / sendblue.ts / agent.ts.

import type { MealType } from '../../../src/domain/types.ts';

/** Provider-agnostic inbound message (docs/AGENT_V0_SPEC.md §3). */
export interface MessageEnvelope {
  provider: 'sendblue';
  externalMessageId: string;
  externalSenderId: string; // E.164
  /** The Oliv line the user texted — replies must go out from this number. */
  lineNumber: string | null;
  text: string;
  mediaUrls: string[];
}

/**
 * Normalize a Sendblue webhook payload. Returns null for anything that isn't
 * an inbound user message (outbound status callbacks, typing events, etc.) —
 * those must be 200-acked and ignored, never processed.
 */
export function normalizeSendblue(payload: Record<string, unknown>): MessageEnvelope | null {
  if (payload.is_outbound === true) return null;
  const from = typeof payload.from_number === 'string' ? payload.from_number.trim() : '';
  if (!from.startsWith('+')) return null;
  const type = typeof payload.message_type === 'string' ? payload.message_type : 'message';
  if (type !== 'message') return null;
  const handle =
    typeof payload.message_handle === 'string' && payload.message_handle
      ? payload.message_handle
      : null;
  if (!handle) return null;
  const media = typeof payload.media_url === 'string' && payload.media_url ? [payload.media_url] : [];
  const text = typeof payload.content === 'string' ? payload.content.trim() : '';
  if (!text && media.length === 0) return null;
  const line = typeof payload.to_number === 'string' && payload.to_number.startsWith('+')
    ? payload.to_number
    : null;
  return {
    provider: 'sendblue',
    externalMessageId: handle,
    externalSenderId: from,
    lineNumber: line,
    text,
    mediaUrls: media,
  };
}

/**
 * A "contact is typing" webhook event (best-effort match — Sendblue doesn't
 * document the exact shape). Used only as a hint to extend an open capture
 * window; a false negative costs nothing.
 */
export function isTypingEvent(payload: Record<string, unknown>): string | null {
  const type = typeof payload.message_type === 'string' ? payload.message_type : '';
  const status = typeof payload.status === 'string' ? payload.status : '';
  if (!/typing/i.test(type) && !/typing/i.test(status)) return null;
  const from = typeof payload.from_number === 'string' ? payload.from_number.trim() : '';
  return from.startsWith('+') ? from : null;
}

/** `LINK <token>` (case-insensitive, tolerant of surrounding text/whitespace). */
export function parseLinkCommand(text: string): string | null {
  const match = /(?:^|\s)link\s+([a-f0-9]{32})(?:\s|$)/i.exec(text);
  return match ? match[1].toLowerCase() : null;
}

/** Meal type from the hour-of-day in the user's timezone. */
export function mealTypeForHour(hour: number): MealType {
  if (hour >= 4 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 15) return 'lunch';
  if (hour >= 15 && hour < 17) return 'snack';
  if (hour >= 17 && hour < 22) return 'dinner';
  return 'snack';
}

/** Hour-of-day for an instant in an IANA timezone (defensive fallback: UTC). */
export function hourInTimezone(date: Date, timezone: string | null): number {
  try {
    const hour = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: timezone ?? 'UTC',
    }).format(date);
    return Number(hour) % 24;
  } catch {
    return date.getUTCHours();
  }
}

/** Deterministic exactly-once key input: provider + sorted inbound message ids. */
export function ingestionKeyInput(provider: string, messageIds: string[]): string {
  return `${provider}:${[...messageIds].sort().join(',')}`;
}

/** Magic-byte sniff for the formats we care about. */
export type ImageKind = 'jpeg' | 'png' | 'webp' | 'heic' | 'unknown';
export function sniffImage(bytes: Uint8Array): ImageKind {
  if (bytes.length < 12) return 'unknown';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  const ascii = (start: number, len: number) =>
    String.fromCharCode(...bytes.slice(start, start + len));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'webp';
  if (ascii(4, 4) === 'ftyp') {
    const brand = ascii(8, 4);
    if (brand.startsWith('hei') || brand.startsWith('mif') || brand.startsWith('msf')) return 'heic';
  }
  return 'unknown';
}

/** The single-message logged-meal reply (1 msg/sec queue: never multi-chunk). */
export function formatMealReply(args: {
  title: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  score: number;
  confidence: 'high' | 'medium' | 'low';
  isPrivate: boolean;
}): string {
  const { title, calories, proteinG, carbsG, fatG, score, confidence, isPrivate } = args;
  const line1 = `Logged ✓ ${title}`;
  const line2 = `~${Math.round(calories)} cal · ${Math.round(proteinG)}g protein · ${Math.round(carbsG)}g carbs · ${Math.round(fatG)}g fat`;
  const line3 = `Health score ${score.toFixed(1)} 🫒${isPrivate ? '' : ' · shared to your feed'}`;
  const caveat =
    confidence === 'high'
      ? 'Reply to correct anything.'
      : `Rough estimate — tell me what's off and I'll fix it.`;
  return `${line1}\n${line2}\n${line3}\n${caveat}`;
}

export const UNKNOWN_SENDER_REPLY =
  "Hey! I'm Oliv 🫒 — I log meals you text me straight into your Oliv app. " +
  'Grab the app, then Settings → Connect Oliv over text to link this number.';

export const REVOKED_SENDER_REPLY =
  'This number was disconnected from Oliv. Relink it from the app: Settings → Connect Oliv over text.';

export const LINK_SUCCESS_REPLY =
  "You're linked! 🫒 Text me a photo of your next meal and I'll log it. " +
  "You can also just tell me what you ate, or ask how your day's going.";

export const LINK_INVALID_REPLY =
  "That link code didn't work — codes expire after 15 minutes. Get a fresh one from the app: Settings → Connect Oliv over text.";

export const LINK_CONFLICT_REPLY =
  'This number is already connected to another Oliv account. Disconnect it there first (Settings → Connect Oliv over text).';

export const PHOTO_FORMAT_REPLY =
  "I couldn't read that photo format 😅 — mind sending it as a JPEG or a screenshot?";

export const FAILURE_REPLY =
  'Something went wrong on my end logging that — give it another try in a minute? 🫒';

/**
 * Deterministic scope guard (docs/AGENT_V0_SPEC.md §7.5): high-risk topics get
 * fixed, caring copy BEFORE any model call. Deliberately narrow — false
 * positives ("diet coke") are worse than letting the guarded system prompt
 * handle grey areas.
 */
const ED_PATTERNS =
  /\b(anorexi|bulimi|purge|purging|laxative|starv(e|ing) myself|hate my body|deserve to eat|punish (myself|my body))\b/i;
const MEDICAL_PATTERNS =
  /\b(insulin|medication|prescri(be|ption)|diagnos|ozempic|wegovy|metformin|chemo|dialysis|eating for (two|pregnancy)|gestational)\b/i;

export function scopeGuard(text: string): string | null {
  if (ED_PATTERNS.test(text)) {
    return (
      "I care more about you than about any number here, and this is beyond what I should coach on. " +
      'Please talk to someone qualified — the NEDA helpline (nationaleatingdisorders.org, call/text 988 in a crisis) is free and confidential. ' +
      "I'm always happy to just log meals, no numbers attached — say the word and I'll hide them."
    );
  }
  if (MEDICAL_PATTERNS.test(text)) {
    return (
      "That's medical territory, and I'm a nutrition coach, not a clinician — I don't want to guess about medication, " +
      'diagnoses, pregnancy, or condition-specific diets. Your doctor or a registered dietitian is the right call there. ' +
      'I can keep tracking your meals and totals in the meantime. 🫒'
    );
  }
  return null;
}
