/**
 * Generates a minimal valid PSD file with three solid-color layers
 * and writes it to public/sample.psd.
 *
 * Run: node scripts/create-sample-psd.js
 */
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const W = 256;
const H = 256;

// --- helpers -----------------------------------------------------------

class BufWriter {
  constructor(size) {
    this.buf = Buffer.alloc(size, 0);
    this.pos = 0;
  }
  u8(v)   { this.buf[this.pos++] = v & 0xff; }
  i16(v)  { this.buf.writeInt16BE(v, this.pos); this.pos += 2; }
  u16(v)  { this.buf.writeUInt16BE(v, this.pos); this.pos += 2; }
  u32(v)  { this.buf.writeUInt32BE(v >>> 0, this.pos); this.pos += 4; }
  str(s)  { for (let i = 0; i < s.length; i++) this.u8(s.charCodeAt(i)); }
  bytes(b){ b.copy(this.buf, this.pos); this.pos += b.length; }
  patchU32(offset, v) { this.buf.writeUInt32BE(v >>> 0, offset); }
  slice() { return this.buf.subarray(0, this.pos); }
}

/** PackBits RLE encode a single row of `len` identical bytes `v` */
function rleRow(v, len) {
  const chunks = [];
  let remaining = len;
  while (remaining > 0) {
    const run = Math.min(128, remaining);
    // encode as -(run-1) repeat: high bit set means repeat
    chunks.push(-(run - 1) & 0xff); // signed byte, e.g. -127 = 0x81 for 128 copies
    chunks.push(v);
    remaining -= run;
  }
  return Buffer.from(chunks.map(b => b & 0xff));
}

/** Encode a full-channel (W×H, single solid colour) with PackBits */
function encodeChannel(value) {
  const rowBuf = rleRow(value, W);
  // RLE header: H × 2 bytes, each = row byte count
  const header = Buffer.alloc(H * 2);
  for (let r = 0; r < H; r++) header.writeUInt16BE(rowBuf.length, r * 2);
  return Buffer.concat([header, ...Array(H).fill(rowBuf)]);
}

// Layer definitions (bottom → top in PSD order = first in layers array)
const LAYERS = [
  { name: 'Background', r: 30,  g: 30,  b: 46,  a: 255 },
  { name: 'Shape',      r: 137, g: 180, b: 250, a: 200 },
  { name: 'Highlight',  r: 203, g: 166, b: 247, a: 180 },
];

// --- build channel data for each layer ---------------------------------
function buildLayerChannelData(layer) {
  // PSD channel order in layer record: typically -1, 0, 1, 2 (A, R, G, B)
  const alpha = encodeChannel(layer.a);
  const red   = encodeChannel(layer.r);
  const green = encodeChannel(layer.g);
  const blue  = encodeChannel(layer.b);
  return { alpha, red, green, blue };
}

// Build Pascal string (length byte + chars, padded to multiple of 4 after the length byte)
function pascalString(name) {
  const nameBytes = Buffer.from(name, 'ascii');
  const totalAfterLen = nameBytes.length;
  // pad so that (1 + totalAfterLen) is a multiple of 4
  const padTo = Math.ceil((totalAfterLen + 1) / 4) * 4;
  const buf = Buffer.alloc(padTo, 0);
  buf[0] = totalAfterLen;
  nameBytes.copy(buf, 1);
  return buf;
}

// --- assemble PSD -------------------------------------------------------
function buildPSD() {
  const channelDatas = LAYERS.map(buildLayerChannelData);

  // Calculate layer record sizes
  const layerRecords = LAYERS.map((layer, i) => {
    const nameBuf = pascalString(layer.name);
    // Extra data: 4 (mask len=0) + 4 (blending ranges len=0) + nameBuf
    const extraLen = 4 + 4 + nameBuf.length;
    // Record: 16 (bounds) + 2 (ch count) + 4*6 (ch info) + 4+4+1+1+1+1 (blend) + 4 (extra len) + extraLen
    const recordSize = 16 + 2 + 4 * 6 + 12 + 4 + extraLen;
    return { layer, nameBuf, extraLen, recordSize };
  });

  // Channel data sizes (compression=2 bytes + encoded data)
  const layerPixelDataSizes = channelDatas.map(cd => {
    return 4 * (2 + cd.alpha.length); // compression word not included in cd.*; add 2 per channel
  });

  // Wait — we need to include the 2-byte compression type in the channel data length field
  // Channel data length in layer record = 2 (compression) + encoded bytes
  // But the actual channel data section comes AFTER all layer records.
  // The length in the channel info is: 2 (compression type, part of channel image data) + encoded bytes

  const layerCount = LAYERS.length;
  const layerInfoLen =
    2 + // layer count
    layerRecords.reduce((s, r) => s + r.recordSize, 0) +
    channelDatas.reduce((s, cd) =>
      s + 4 * (2 + cd.alpha.length), 0);  // 4 channels per layer

  // Pad layer info to even number
  const layerInfoLenPadded = layerInfoLen + (layerInfoLen % 2);

  // Layer and mask section = 4 (layer info length) + layerInfoLen + padding + 4 (global mask len=0)
  const layerMaskSectionLen = 4 + layerInfoLenPadded + 4;

  // Merged image data
  const mergedChannelData = [
    encodeChannel(30),  // R (background)
    encodeChannel(30),  // G
    encodeChannel(46),  // B
  ];
  const mergedImageDataLen = 2 + mergedChannelData.reduce((s, c) => s + c.length, 0);

  // Total size estimate
  const totalSize =
    26 + // file header
    4  + // color mode length
    4  + // image resources length
    4  + layerMaskSectionLen +
    2  + mergedImageDataLen + 4096; // extra buffer

  const w = new BufWriter(totalSize);

  // === File Header ===
  w.str('8BPS');
  w.u16(1);         // version: 1 = PSD
  w.u32(0); w.u16(0); // reserved 6 bytes
  w.u16(3);         // channels: 3 (RGB, no alpha in main)
  w.u32(H);
  w.u32(W);
  w.u16(8);         // bit depth
  w.u16(3);         // color mode: RGB

  // === Color Mode Data ===
  w.u32(0);

  // === Image Resources ===
  w.u32(0);

  // === Layer and Mask Information ===
  const lmStart = w.pos;
  w.u32(0); // placeholder for section length

  // Layer info
  const liStart = w.pos;
  w.u32(0); // placeholder for layer info length

  // Layer count (negative = first alpha is transparency for merged)
  w.i16(layerCount);

  // Layer records
  for (let i = 0; i < layerCount; i++) {
    const { layer, nameBuf, extraLen } = layerRecords[i];
    const cd = channelDatas[i];
    // Channel data lengths: 2 (compression) + encoded data length
    const alphaLen = 2 + cd.alpha.length;
    const redLen   = 2 + cd.red.length;
    const greenLen = 2 + cd.green.length;
    const blueLen  = 2 + cd.blue.length;

    // Bounds: top, left, bottom, right
    w.u32(0); w.u32(0); w.u32(H); w.u32(W);

    // Channel count
    w.u16(4);

    // Channel info: [id (signed i16), data_length (u32)]
    w.i16(-1); w.u32(alphaLen); // alpha
    w.i16(0);  w.u32(redLen);   // red
    w.i16(1);  w.u32(greenLen); // green
    w.i16(2);  w.u32(blueLen);  // blue

    // Blend mode
    w.str('8BIM');
    w.str('norm'); // normal blend
    w.u8(layer.a); // opacity
    w.u8(0);       // clipping: base
    w.u8(0);       // flags
    w.u8(0);       // filler

    // Extra data
    w.u32(extraLen);
    w.u32(0); // layer mask length = 0
    w.u32(0); // layer blending ranges length = 0
    w.bytes(nameBuf);
  }

  // Layer channel pixel data (in same order as records)
  for (const cd of channelDatas) {
    // alpha channel
    w.u16(1); // compression: PackBits RLE
    w.bytes(cd.alpha);
    // red
    w.u16(1);
    w.bytes(cd.red);
    // green
    w.u16(1);
    w.bytes(cd.green);
    // blue
    w.u16(1);
    w.bytes(cd.blue);
  }

  // Patch layer info length (not including the length field itself)
  const liLen = w.pos - liStart - 4;
  w.patchU32(liStart, liLen + (liLen % 2 ? 1 : 0));

  // Pad to even
  if (liLen % 2 !== 0) w.u8(0);

  // Global layer mask info (length = 0)
  w.u32(0);

  // Patch layer+mask section length
  const lmLen = w.pos - lmStart - 4;
  w.patchU32(lmStart, lmLen);

  // === Merged Image Data ===
  // 3 channels, PackBits RLE
  w.u16(1); // compression
  // Byte counts per row for each channel (3 channels × H rows × 2 bytes)
  for (let ch = 0; ch < 3; ch++) {
    const rowBuf = rleRow([30, 30, 46][ch], W);
    for (let r = 0; r < H; r++) w.u16(rowBuf.length);
  }
  // Actual data
  for (let ch = 0; ch < 3; ch++) {
    const rowBuf = rleRow([30, 30, 46][ch], W);
    for (let r = 0; r < H; r++) w.bytes(rowBuf);
  }

  return w.slice();
}

// --- write file ---------------------------------------------------------
const outDir = join(__dirname, '..', 'public');
mkdirSync(outDir, { recursive: true });

const psdBuf = buildPSD();
const outPath = join(outDir, 'sample.psd');
writeFileSync(outPath, psdBuf);
console.log(`Wrote ${outPath} (${psdBuf.length} bytes)`);
