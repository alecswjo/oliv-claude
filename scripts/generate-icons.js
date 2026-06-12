#!/usr/bin/env node
/**
 * Generates the Oliv app icons procedurally (no image tooling needed):
 * a friendly olive on cream. Re-run with `node scripts/generate-icons.js`.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---- minimal PNG encoder (RGBA, no interlace) ----
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba, { opaque = false } = {}) {
  // App Store icon validation (ITMS-90717) rejects icons with an alpha
  // channel, so the iOS icon is written as opaque RGB (color type 2).
  const channels = opaque ? 3 : 4;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = opaque ? 2 : 6; // color type RGB / RGBA
  const raw = Buffer.alloc((width * channels + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * channels + 1);
    raw[rowStart] = 0; // filter: none
    if (opaque) {
      for (let x = 0; x < width; x++) {
        const src = (y * width + x) * 4;
        const dst = rowStart + 1 + x * 3;
        raw[dst] = rgba[src];
        raw[dst + 1] = rgba[src + 1];
        raw[dst + 2] = rgba[src + 2];
      }
    } else {
      rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- olive artwork ----
const hex = (value) => [
  parseInt(value.slice(1, 3), 16),
  parseInt(value.slice(3, 5), 16),
  parseInt(value.slice(5, 7), 16),
];

const CREAM = hex('#FAF7F0');
const OLIVE = hex('#708238');
const OLIVE_DEEP = hex('#3D4A1F');
const OLIVE_SOFT = hex('#E4EAD5');
const PIMENTO = hex('#C96F4A');
const LEAF = hex('#4F7942');

function inEllipse(x, y, cx, cy, rx, ry) {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

function rotate(x, y, cx, cy, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = x - cx;
  const dy = y - cy;
  return [cx + dx * cos + dy * sin, cy - dx * sin + dy * cos];
}

function drawIcon(size, { transparent = false, opaque = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const rx = size * 0.26;
  const ry = size * 0.34;
  const tilt = -0.35;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let color = transparent ? null : CREAM;

      // leaf: thin rotated ellipse touching the olive's top end
      const leafCx = cx + rx * 0.58;
      const leafCy = cy - ry * 1.02;
      const [lx, ly] = rotate(x, y, leafCx, leafCy, 0.85);
      if (inEllipse(lx, ly, leafCx, leafCy, size * 0.145, size * 0.045)) {
        color = LEAF;
      }

      const [ox, oy] = rotate(x, y, cx, cy, tilt);
      if (inEllipse(ox, oy, cx, cy, rx, ry)) {
        color = OLIVE;
        // outline band
        if (!inEllipse(ox, oy, cx, cy, rx - size * 0.018, ry - size * 0.018)) {
          color = OLIVE_DEEP;
        }
        // highlight
        if (inEllipse(ox, oy, cx - rx * 0.35, cy - ry * 0.42, rx * 0.3, ry * 0.22)) {
          color = OLIVE_SOFT;
        }
        // pimento at the top end
        if (inEllipse(ox, oy, cx, cy - ry * 0.78, rx * 0.32, ry * 0.16)) {
          color = PIMENTO;
        }
      }

      const offset = (y * size + x) * 4;
      if (color) {
        rgba[offset] = color[0];
        rgba[offset + 1] = color[1];
        rgba[offset + 2] = color[2];
        rgba[offset + 3] = 255;
      } else {
        rgba[offset + 3] = 0;
      }
    }
  }
  return encodePng(size, size, rgba, { opaque });
}

const out = (name) => path.join(__dirname, '..', 'assets', 'images', name);
fs.writeFileSync(out('icon.png'), drawIcon(1024, { opaque: true }));
fs.writeFileSync(out('splash-icon.png'), drawIcon(512, { transparent: true }));
fs.writeFileSync(out('favicon.png'), drawIcon(48));
fs.writeFileSync(out('android-icon-foreground.png'), drawIcon(432, { transparent: true }));
fs.writeFileSync(out('android-icon-background.png'), (() => {
  const size = 432;
  const rgba = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    rgba[i * 4] = CREAM[0];
    rgba[i * 4 + 1] = CREAM[1];
    rgba[i * 4 + 2] = CREAM[2];
    rgba[i * 4 + 3] = 255;
  }
  return encodePng(size, size, rgba);
})());
fs.writeFileSync(out('android-icon-monochrome.png'), drawIcon(432, { transparent: true }));
console.log('Icons written to assets/images/');
