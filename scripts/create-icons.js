/**
 * Generates minimal solid-colour PNG icons for the PWA manifest.
 * Pure Node.js — no external dependencies required.
 *
 * Run: node scripts/create-icons.js
 */
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { deflateSync } from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

// CRC-32 table
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf, start = 0, end = buf.length) {
  let crc = 0xffffffff;
  for (let i = start; i < end; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function u32BE(v) {
  const b = Buffer.allocUnsafe(4);
  b.writeUInt32BE(v >>> 0);
  return b;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = u32BE(data.length);
  const combined = Buffer.concat([typeBuf, data]);
  const crc = u32BE(crc32(combined));
  return Buffer.concat([len, combined, crc]);
}

/**
 * Build a minimal RGBA PNG with per-pixel colour callback.
 * @param {number} w
 * @param {number} h
 * @param {(x:number,y:number) => [r,g,b,a]} pixelFn
 */
function buildPNG(w, h, pixelFn) {
  // PNG signature
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdrData = Buffer.allocUnsafe(13);
  ihdrData.writeUInt32BE(w, 0);
  ihdrData.writeUInt32BE(h, 4);
  ihdrData[8]  = 8; // bit depth
  ihdrData[9]  = 2; // color type: RGB (no alpha for simplicity)
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = pngChunk('IHDR', ihdrData);

  // Raw pixel rows (filter byte 0 per row + RGB bytes)
  const rowSize = 1 + w * 3;
  const rawData = Buffer.allocUnsafe(h * rowSize);
  for (let y = 0; y < h; y++) {
    rawData[y * rowSize] = 0; // filter type None
    for (let x = 0; x < w; x++) {
      const [r, g, b] = pixelFn(x, y);
      const off = y * rowSize + 1 + x * 3;
      rawData[off]     = r;
      rawData[off + 1] = g;
      rawData[off + 2] = b;
    }
  }

  const compressed = deflateSync(rawData, { level: 6 });
  const idat = pngChunk('IDAT', compressed);
  const iend = pngChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdr, idat, iend]);
}

/**
 * Draw a simple layers icon with a dark background.
 */
function iconPixel(x, y, size) {
  const BG   = [0x1e, 0x1e, 0x2e];
  const L1   = [0x31, 0x32, 0x44]; // dark square
  const L2   = [0x58, 0x5b, 0x70]; // mid square
  const L3   = [0x89, 0xb4, 0xfa]; // accent square

  const p  = Math.round(size * 0.20); // padding
  const s  = size - p * 2;            // total square area
  const o  = Math.round(size * 0.07); // offset between layers

  // Three squares offset diagonally (top-left to bottom-right)
  // Layer order: bottom (L1) → L2 → L3 (top/front)
  const squares = [
    { x0: p + o * 2, y0: p,       x1: p + s - o * 0, y1: p + s - o * 2, col: L1 },
    { x0: p + o,     y0: p + o,   x1: p + s - o,     y1: p + s - o,     col: L2 },
    { x0: p,         y0: p + o * 2, x1: p + s - o * 2, y1: p + s,         col: L3 },
  ];

  for (let i = squares.length - 1; i >= 0; i--) {
    const sq = squares[i];
    if (x >= sq.x0 && x < sq.x1 && y >= sq.y0 && y < sq.y1) return sq.col;
  }
  return BG;
}

const sizes = [192, 512];
for (const size of sizes) {
  const png = buildPNG(size, size, (x, y) => iconPixel(x, y, size));
  const outPath = join(outDir, `icon-${size}.png`);
  writeFileSync(outPath, png);
  console.log(`Wrote ${outPath} (${png.length} bytes)`);
}
