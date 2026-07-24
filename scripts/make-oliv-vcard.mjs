#!/usr/bin/env node
/**
 * Generate Oliv's contact card (oliv.vcf) with the app icon as the photo, and
 * (when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set) upload it to the
 * public agent-assets bucket. Users who save it see "Oliv" + the logo in
 * Messages instead of a bare number.
 *
 * Usage:
 *   node scripts/make-oliv-vcard.mjs <E.164 number> [icon.png path]
 * The icon should be pre-resized to ~240px (vCard photos stay small):
 *   sips -Z 240 assets/images/icon.png --out /tmp/oliv-icon-240.png
 */

import { readFileSync, writeFileSync } from 'node:fs';

const number = process.argv[2];
const iconPath = process.argv[3] ?? 'assets/images/icon.png';
if (!number?.startsWith('+')) {
  console.error('Usage: node scripts/make-oliv-vcard.mjs <+E164 number> [icon.png]');
  process.exit(1);
}

const photoB64 = readFileSync(iconPath).toString('base64');

/** RFC 2426 line folding: 75 octets per line, continuation lines start with a space. */
function fold(line) {
  const out = [];
  let rest = line;
  while (rest.length > 75) {
    out.push(out.length === 0 ? rest.slice(0, 75) : ` ${rest.slice(0, 74)}`);
    rest = rest.slice(out.length === 1 ? 75 : 74);
  }
  out.push(out.length === 0 ? rest : ` ${rest}`);
  return out.join('\r\n');
}

const vcf =
  [
    'BEGIN:VCARD',
    'VERSION:3.0',
    'N:;Oliv;;;',
    'FN:Oliv',
    'ORG:Oliv',
    `TEL;TYPE=CELL:${number}`,
    fold(`PHOTO;ENCODING=b;TYPE=PNG:${photoB64}`),
    "NOTE:Text me a photo of your meal and I'll log it in Oliv \u{1F7E2}",
    'END:VCARD',
  ].join('\r\n') + '\r\n';

writeFileSync('/tmp/oliv.vcf', vcf);
console.log(`wrote /tmp/oliv.vcf (${vcf.length} bytes)`);

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (url && key) {
  const res = await fetch(`${url}/storage/v1/object/agent-assets/oliv.vcf`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'content-type': 'text/vcard', 'x-upsert': 'true' },
    body: vcf,
  });
  console.log(`upload: ${res.status} ${await res.text()}`);
  console.log(`public URL: ${url}/storage/v1/object/public/agent-assets/oliv.vcf`);
} else {
  console.log('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY unset — skipped upload');
}
