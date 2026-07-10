/**
 * Generate the PWA icons (public/icons/icon-192.png, icon-512.png) with a
 * dependency-free PNG encoder (node:zlib). The glyph: a stack of three
 * nanosheets crossed by a gate bar — the Layer 1 hero device.
 *
 * Run once (icons are committed): node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

// --- minimal PNG encoder --------------------------------------------------

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // scanlines with filter byte 0
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0;
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- icon drawing ---------------------------------------------------------

function hex(color) {
  return [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)];
}

const BG = hex('#0b1220');
const SHEET = hex('#4cc9f0');
const GATE = hex('#f4a261');

function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const set = (x, y, [r, g, b]) => {
    const i = (y * size + x) * 4;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = 255;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) set(x, y, BG);

  // Maskable safe zone is the central 80%; keep the glyph inside 60%.
  const u = size / 100; // icon-space unit
  const rect = (x0, y0, x1, y1, color) => {
    for (let y = Math.round(y0 * u); y < Math.round(y1 * u); y++) {
      for (let x = Math.round(x0 * u); x < Math.round(x1 * u); x++) set(x, y, color);
    }
  };
  // Three stacked nanosheets.
  rect(24, 30, 76, 38, SHEET);
  rect(24, 46, 76, 54, SHEET);
  rect(24, 62, 76, 70, SHEET);
  // The gate bar wrapping the stack.
  rect(44, 22, 56, 78, GATE);
  return encodePng(size, size, px);
}

mkdirSync('public/icons', { recursive: true });
for (const size of [192, 512]) {
  writeFileSync(`public/icons/icon-${size}.png`, drawIcon(size));
  console.log(`public/icons/icon-${size}.png`);
}
