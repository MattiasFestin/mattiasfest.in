#!/usr/bin/env node
/**
 * Lossless PNG repacker for the deployed images in static/.
 *
 * Every PNG this site ships is pixel art: flat Win98 icons, two-tone
 * cursors, and the Clippy sprite sheet. None of them has more than 256
 * distinct RGBA values, but most are stored as 32-bit RGBA anyway -
 * pngjs writes color type 6 whatever you hand it, and map.png is
 * copied verbatim out of the clippyjs bundle, with whatever encoder
 * settings that package happened to use.
 *
 * So for each file we:
 *
 *   1. Collect the distinct RGBA values. If there are <= 256, rebuild
 *      as a palette image (color type 3) at the smallest bit depth
 *      that fits (1/2/4/8 bpp). Palette entries are sorted so the
 *      non-opaque ones come first, which lets tRNS stop early instead
 *      of spanning the whole palette.
 *   2. Re-filter every scanline, trying each filter type and keeping
 *      the one with the smallest sum of absolute differences, then
 *      compare that against filtering everything as None - for flat
 *      palette art None usually wins outright.
 *   3. Deflate each candidate at level 9 under three strategies
 *      (default, filtered, RLE) and keep the smallest result.
 *   4. Emit only IHDR / PLTE / tRNS / IDAT / IEND. Ancillary chunks
 *      (gAMA, cHRM, bKGD, tIME, tEXt) carry no meaning for these
 *      images and are dropped.
 *
 * The pixels are untouched: decoding the output gives back exactly the
 * RGBA buffer we read in, and the script verifies that before writing.
 *
 * Images with more than 256 colors are left alone rather than
 * quantized - this step is lossless by construction, and nothing here
 * needs quantizing today.
 *
 * Run after regenerating any image:  node scripts/optimize-png.mjs
 *
 * The build runs this before `zola build` (Zola copies static/ into
 * public/, so it has to happen first). It is idempotent and verified
 * lossless, so on a clean tree it reports everything as already
 * optimal and writes nothing. Pass --check to report and exit non-zero
 * instead of writing, which is useful in a pre-commit hook if you'd
 * rather be told than silently fixed.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { deflateSync, constants } from "node:zlib";
import { PNG } from "pngjs";

const ROOT = new URL("..", import.meta.url).pathname;
const STATIC_DIR = join(ROOT, "static");
const CHECK_ONLY = process.argv.includes("--check");

/* ---------------------------------------------------------------- CRC */

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
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.allocUnsafe(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/* ------------------------------------------------------------ filtering */

/** Paeth predictor, per the PNG spec. */
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Apply one filter type to a scanline, writing into `out`. */
function applyFilter(type, line, prev, out, bpp) {
  const n = line.length;
  for (let i = 0; i < n; i++) {
    const a = i >= bpp ? line[i - bpp] : 0;
    const b = prev ? prev[i] : 0;
    const c = prev && i >= bpp ? prev[i - bpp] : 0;
    let v;
    switch (type) {
      case 0: v = line[i]; break;
      case 1: v = line[i] - a; break;
      case 2: v = line[i] - b; break;
      case 3: v = line[i] - ((a + b) >> 1); break;
      default: v = line[i] - paeth(a, b, c); break;
    }
    out[i] = v & 0xff;
  }
}

/** Sum of absolute signed deviations - the standard filter heuristic. */
function score(buf) {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i];
    sum += v < 128 ? v : 256 - v;
  }
  return sum;
}

/**
 * Prefix each scanline with a filter byte.
 * `adaptive` picks the best-scoring filter per line; otherwise all
 * lines use filter 0 (None).
 */
function filterRaw(raw, height, stride, bpp, adaptive) {
  const out = Buffer.allocUnsafe(height * (stride + 1));
  const candidate = Buffer.allocUnsafe(stride);
  const best = Buffer.allocUnsafe(stride);
  let prev = null;

  for (let y = 0; y < height; y++) {
    const line = raw.subarray(y * stride, (y + 1) * stride);
    const base = y * (stride + 1);

    if (!adaptive) {
      out[base] = 0;
      line.copy(out, base + 1);
    } else {
      let bestType = 0;
      let bestScore = Infinity;
      for (let type = 0; type < 5; type++) {
        applyFilter(type, line, prev, candidate, bpp);
        const s = score(candidate);
        if (s < bestScore) {
          bestScore = s;
          bestType = type;
          candidate.copy(best);
        }
      }
      out[base] = bestType;
      best.copy(out, base + 1);
    }
    prev = line;
  }
  return out;
}

/**
 * Deflate every candidate under every strategy, keep the smallest.
 * Which combination wins is not predictable for this kind of art -
 * RLE tends to take the flat icons, default takes the sprite sheets -
 * so we just try them all; the images are few and small.
 */
function bestDeflate(candidates) {
  let best = null;
  for (const buf of candidates) {
    for (const strategy of [
      constants.Z_DEFAULT_STRATEGY,
      constants.Z_FILTERED,
      constants.Z_RLE,
    ]) {
      const out = deflateSync(buf, { level: 9, memLevel: 9, strategy });
      if (!best || out.length < best.length) best = out;
    }
  }
  return best;
}

/* ------------------------------------------------------------- encoding */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Build a palette PNG from an RGBA buffer, or return null when the
 * image has more than 256 distinct colors.
 */
function encodePalette(rgba, width, height) {
  const index = new Map();
  const palette = [];
  for (let i = 0; i < rgba.length; i += 4) {
    const key = (rgba[i] << 24 | rgba[i + 1] << 16 | rgba[i + 2] << 8 | rgba[i + 3]) >>> 0;
    if (!index.has(key)) {
      if (palette.length === 256) return null;
      index.set(key, palette.length);
      palette.push(key);
    }
  }

  /* Non-opaque entries first, so tRNS covers a short prefix. */
  palette.sort((a, b) => (a & 0xff) - (b & 0xff));
  index.clear();
  palette.forEach((key, i) => index.set(key, i));

  const bitDepth = palette.length <= 2 ? 1 : palette.length <= 4 ? 2 : palette.length <= 16 ? 4 : 8;
  const perByte = 8 / bitDepth;
  const stride = Math.ceil((width * bitDepth) / 8);
  const raw = Buffer.alloc(height * stride);

  for (let y = 0; y < height; y++) {
    const row = y * stride;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const key = (rgba[i] << 24 | rgba[i + 1] << 16 | rgba[i + 2] << 8 | rgba[i + 3]) >>> 0;
      const value = index.get(key);
      if (bitDepth === 8) {
        raw[row + x] = value;
      } else {
        const shift = 8 - bitDepth * ((x % perByte) + 1);
        raw[row + ((x / perByte) | 0)] |= value << shift;
      }
    }
  }

  const plte = Buffer.allocUnsafe(palette.length * 3);
  palette.forEach((key, i) => {
    plte[i * 3] = (key >>> 24) & 0xff;
    plte[i * 3 + 1] = (key >>> 16) & 0xff;
    plte[i * 3 + 2] = (key >>> 8) & 0xff;
  });

  /* tRNS only needs to run up to the last non-opaque entry. */
  let trnsLength = 0;
  palette.forEach((key, i) => {
    if ((key & 0xff) !== 255) trnsLength = i + 1;
  });
  const trns = Buffer.allocUnsafe(trnsLength);
  for (let i = 0; i < trnsLength; i++) trns[i] = palette[i] & 0xff;

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = bitDepth;
  ihdr[9] = 3; /* color type: palette */

  /* bpp for filtering is 1 byte for any palette image. */
  const idat = bestDeflate([
    filterRaw(raw, height, stride, 1, false),
    filterRaw(raw, height, stride, 1, true),
  ]);

  return {
    buffer: Buffer.concat([
      PNG_SIGNATURE,
      chunk("IHDR", ihdr),
      chunk("PLTE", plte),
      ...(trnsLength ? [chunk("tRNS", trns)] : []),
      chunk("IDAT", idat),
      chunk("IEND", Buffer.alloc(0)),
    ]),
    colors: palette.length,
    bitDepth,
  };
}

/* ----------------------------------------------------------------- main */

function pngFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...pngFiles(path));
    else if (entry.toLowerCase().endsWith(".png")) out.push(path);
  }
  return out.sort();
}

let before = 0;
let after = 0;
const stale = [];

for (const path of pngFiles(STATIC_DIR)) {
  const original = readFileSync(path);
  const src = PNG.sync.read(original);
  const name = relative(ROOT, path);

  const encoded = encodePalette(src.data, src.width, src.height);
  if (!encoded) {
    console.log(`- ${name}: >256 colors, left as-is (${kb(original.length)})`);
    before += original.length;
    after += original.length;
    continue;
  }

  /* Lossless or bust: the round-trip must reproduce every pixel. */
  const check = PNG.sync.read(encoded.buffer);
  if (!Buffer.from(check.data).equals(Buffer.from(src.data))) {
    throw new Error(`${name}: repack changed pixel data, refusing to write`);
  }

  const winner = encoded.buffer.length < original.length ? encoded.buffer : original;
  before += original.length;
  after += winner.length;

  if (winner === original) {
    const delta = encoded.buffer.length - original.length;
    console.log(
      `= ${name}: already optimal (${kb(original.length)}, repack would be ` +
        `${delta > 0 ? "+" : ""}${kb(delta)})`
    );
    continue;
  }

  const saved = original.length - winner.length;
  const pct = ((saved / original.length) * 100).toFixed(1);
  const detail = `${encoded.colors} colors, ${encoded.bitDepth}-bit palette`;
  console.log(
    `${CHECK_ONLY ? "!" : "✓"} ${name}: ${kb(original.length)} → ${kb(winner.length)} (−${pct}%, ${detail})`
  );

  if (CHECK_ONLY) stale.push(name);
  else writeFileSync(path, winner);
}

function kb(n) {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} kB`;
}

const saved = before - after;
console.log(
  `\n${CHECK_ONLY ? "would save" : "saved"} ${kb(saved)} of ${kb(before)} ` +
    `(${((saved / before) * 100).toFixed(1)}%)`
);

if (CHECK_ONLY && stale.length) {
  console.error(`\n${stale.length} PNG(s) are not optimized. Run: node scripts/optimize-png.mjs`);
  process.exit(1);
}
