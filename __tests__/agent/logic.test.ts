/**
 * Pure gateway logic (supabase/functions/agent-inbound/logic.ts): payload
 * normalization, link parsing, capture helpers, reply formatting, and the
 * deterministic scope guard. The Deno/IO layers are exercised by deploy-time
 * checks; everything here must hold without any runtime.
 */

import {
  formatMealReply,
  hourInTimezone,
  ingestionKeyInput,
  mealTypeForHour,
  normalizeSendblue,
  parseLinkCommand,
  scopeGuard,
  sniffImage,
} from '../../supabase/functions/agent-inbound/logic';

const inbound = (over: Record<string, unknown> = {}) => ({
  accountEmail: 'oliv',
  content: 'hello',
  is_outbound: false,
  message_handle: 'mh-1',
  from_number: '+14085551234',
  to_number: '+13054098546',
  media_url: '',
  message_type: 'message',
  ...over,
});

describe('normalizeSendblue', () => {
  it('normalizes an inbound text', () => {
    const env = normalizeSendblue(inbound());
    expect(env).toEqual({
      provider: 'sendblue',
      externalMessageId: 'mh-1',
      externalSenderId: '+14085551234',
      lineNumber: '+13054098546',
      text: 'hello',
      mediaUrls: [],
    });
  });

  it('captures media_url as an attachment', () => {
    const env = normalizeSendblue(inbound({ content: '', media_url: 'https://cdn/x.heic' }));
    expect(env?.mediaUrls).toEqual(['https://cdn/x.heic']);
    expect(env?.text).toBe('');
  });

  it.each([
    ['outbound status callback', { is_outbound: true }],
    ['missing sender', { from_number: undefined }],
    ['non-E.164 sender', { from_number: 'anonymous' }],
    ['non-message event', { message_type: 'typing_indicator' }],
    ['missing handle', { message_handle: '' }],
    ['empty message', { content: '', media_url: '' }],
  ])('ignores: %s', (_label, over) => {
    expect(normalizeSendblue(inbound(over))).toBeNull();
  });
});

describe('parseLinkCommand', () => {
  const token = 'a'.repeat(32);
  it('parses LINK <token> case-insensitively', () => {
    expect(parseLinkCommand(`LINK ${token}`)).toBe(token);
    expect(parseLinkCommand(`link ${token.toUpperCase()}`)).toBe(token);
    expect(parseLinkCommand(`  Link ${token}  `)).toBe(token);
  });
  it('rejects wrong lengths and plain chatter', () => {
    expect(parseLinkCommand('LINK abc123')).toBeNull();
    expect(parseLinkCommand('I clicked the link you sent')).toBeNull();
    expect(parseLinkCommand('')).toBeNull();
  });
});

describe('meal type inference', () => {
  it.each([
    [7, 'breakfast'],
    [12, 'lunch'],
    [16, 'snack'],
    [19, 'dinner'],
    [23, 'snack'],
    [2, 'snack'],
  ])('hour %i → %s', (hour, expected) => {
    expect(mealTypeForHour(hour as number)).toBe(expected);
  });

  it('resolves the hour in a timezone, with a safe fallback', () => {
    const noonUtc = new Date('2026-07-23T12:00:00Z');
    expect(hourInTimezone(noonUtc, 'UTC')).toBe(12);
    expect(hourInTimezone(noonUtc, 'America/Los_Angeles')).toBe(5);
    expect(hourInTimezone(noonUtc, 'not-a-zone')).toBe(12); // falls back to UTC
  });
});

describe('ingestionKeyInput', () => {
  it('is order-independent over message ids (exactly-once across retries)', () => {
    expect(ingestionKeyInput('sendblue', ['b', 'a'])).toBe(ingestionKeyInput('sendblue', ['a', 'b']));
    expect(ingestionKeyInput('sendblue', ['a'])).not.toBe(ingestionKeyInput('sendblue', ['b']));
  });
});

describe('sniffImage', () => {
  const bytes = (...pairs: [number, number[]][]) => {
    const arr = new Uint8Array(24);
    for (const [offset, values] of pairs) arr.set(values, offset);
    return arr;
  };
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

  it('detects jpeg / png / webp / heic', () => {
    expect(sniffImage(bytes([0, [0xff, 0xd8, 0xff]]))).toBe('jpeg');
    expect(sniffImage(bytes([0, [0x89, 0x50, 0x4e, 0x47]]))).toBe('png');
    expect(sniffImage(bytes([0, ascii('RIFF')], [8, ascii('WEBP')]))).toBe('webp');
    expect(sniffImage(bytes([4, ascii('ftyp')], [8, ascii('heic')]))).toBe('heic');
    expect(sniffImage(bytes([4, ascii('ftyp')], [8, ascii('mif1')]))).toBe('heic');
  });
  it('unknown for everything else', () => {
    expect(sniffImage(new Uint8Array(4))).toBe('unknown');
    expect(sniffImage(bytes([0, ascii('GIF8')]))).toBe('unknown');
  });
});

describe('formatMealReply', () => {
  const base = {
    title: 'Chicken rice bowl',
    calories: 689.6,
    proteinG: 48.2,
    carbsG: 76,
    fatG: 19,
    score: 4.1,
    confidence: 'high' as const,
    isPrivate: true,
  };

  it('is a single message with rounded numbers and the score', () => {
    const reply = formatMealReply(base);
    expect(reply).toContain('Logged ✓ Chicken rice bowl');
    expect(reply).toContain('~690 cal · 48g protein · 76g carbs · 19g fat');
    expect(reply).toContain('Health score 4.1 🫒');
    expect(reply.length).toBeLessThan(300);
  });

  it('marks shared meals and hedges on low confidence', () => {
    expect(formatMealReply({ ...base, isPrivate: false })).toContain('shared to your feed');
    expect(formatMealReply({ ...base, confidence: 'low' })).toContain('Rough estimate');
  });
});

describe('scopeGuard', () => {
  it('intercepts eating-disorder signals with support copy', () => {
    expect(scopeGuard('i have been starving myself all week')).toContain('nationaleatingdisorders');
  });
  it('intercepts medical territory', () => {
    expect(scopeGuard('should I change my insulin dose for this meal?')).toContain('not a clinician');
    expect(scopeGuard('is this diet ok with ozempic')).toContain('not a clinician');
  });
  it('lets normal food talk through', () => {
    expect(scopeGuard('had a diet coke and a burger')).toBeNull();
    expect(scopeGuard('how much protein today?')).toBeNull();
    expect(scopeGuard('trying to link my account')).toBeNull();
  });
});
