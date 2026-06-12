/**
 * RFC-4122 v4 UUIDs. Backend tables key meals/comments/profiles by `uuid`
 * columns, so client ids MUST be real UUIDs (Postgres rejects anything else
 * with 22P02). Uses the platform CSPRNG when present (Hermes/web/node all
 * provide globalThis.crypto), with a Math.random fallback that is still
 * format-valid and collision-safe at app scale.
 */

type CryptoLike = {
  randomUUID?: () => string;
  getRandomValues?: (array: Uint8Array) => Uint8Array;
};

function v4FromBytes(bytes: Uint8Array): string {
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function newId(): string {
  const crypto = (globalThis as { crypto?: CryptoLike }).crypto;
  if (crypto?.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (crypto?.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return v4FromBytes(bytes);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when the id is a server-compatible UUID (vs a legacy `meal_…` local id). */
export function isUuid(id: string): boolean {
  return UUID_RE.test(id);
}
