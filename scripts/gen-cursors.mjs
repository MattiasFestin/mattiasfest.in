#!/usr/bin/env node
/**
 * Generates the Win98-style cursor PNGs in static/cursors/.
 *
 * Cursors can't use image-rendering: pixelated, so for crisp chunky
 * pixels on high-DPI screens each cursor is emitted twice: at 1x and
 * at 2x (nearest-neighbor pre-scaled), wired up via CSS image-set().
 *
 * The PNGs are hand-encoded below rather than via pngjs, and are then
 * repacked losslessly by scripts/optimize-png.mjs (which the build
 * runs) - at these sizes a palette is usually a net loss against the
 * PLTE/tRNS overhead, so most of them are left exactly as written.
 *
 * Run manually after editing the pixel maps:  node scripts/gen-cursors.mjs
 */

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = new URL("../static/cursors", import.meta.url).pathname;

/* Pixel maps: B = black, W = white, . = transparent */

const ARROW = [
  "B..........",
  "BB.........",
  "BWB........",
  "BWWB.......",
  "BWWWB......",
  "BWWWWB.....",
  "BWWWWWB....",
  "BWWWWWWB...",
  "BWWWWWWWB..",
  "BWWWWWWWWB.",
  "BWWWWWBBBBB",
  "BWWBWWB....",
  "BWB.BWWB...",
  "BB..BWWB...",
  "B....BWWB..",
  ".....BWWB..",
  "......BB...",
];

const HAND = [
  ".....BB.......",
  "....BWWB......",
  "....BWWB......",
  "....BWWB......",
  "....BWWBBB....",
  "....BWWBWWBBB.",
  "....BWWBWWBWWB",
  ".BB.BWWBWWBWWB",
  "BWWBWWWBWWBWWB",
  "BWWWWWWWWWWWWB",
  ".BWWWWWWWWWWWB",
  "..BWWWWWWWWWWB",
  "...BWWWWWWWWWB",
  "...BWWWWWWWWWB",
  "....BWWWWWWWWB",
  "....BBBBBBBBBB",
];

const WAIT = [
  "BBBBBBBBBBB",
  ".BWBBBBBWB.",
  ".BWWBBBWWB.",
  "..BWWBWWB..",
  "...BWWWB...",
  "....BBB....",
  "....BBB....",
  "...BWBWB...",
  "..BWWWWWB..",
  ".BWWWBWWWB.",
  ".BWWBBBWWB.",
  ".BWBBBBBWB.",
  "BBBBBBBBBBB",
];

/* --- Minimal PNG encoder (RGBA, no filtering) --- */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  // scanlines, each prefixed with filter byte 0
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function render(map, scale) {
  const w = map[0].length;
  const h = map.length;
  const rgba = Buffer.alloc(w * scale * h * scale * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = map[y][x];
      if (ch === ".") continue;
      const v = ch === "B" ? 0 : 255;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const i = ((y * scale + dy) * w * scale + x * scale + dx) * 4;
          rgba[i] = rgba[i + 1] = rgba[i + 2] = v;
          rgba[i + 3] = 255;
        }
      }
    }
  }
  return encodePng(w * scale, h * scale, rgba);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, map] of [["arrow", ARROW], ["hand", HAND], ["wait", WAIT]]) {
  writeFileSync(join(OUT_DIR, `${name}.png`), render(map, 1));
  writeFileSync(join(OUT_DIR, `${name}@2x.png`), render(map, 2));
  console.log(`✓ ${name}.png + ${name}@2x.png (${map[0].length}x${map.length})`);
}
