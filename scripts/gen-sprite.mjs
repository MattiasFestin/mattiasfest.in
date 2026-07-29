#!/usr/bin/env node
/**
 * Builds the icon sprite sheet used across the site.
 *
 * Reads the Win98 icon PNGs from assets/icons-win98/ (source-only, not
 * deployed) and packs the handful the site actually uses into a single
 * static/icons/sprite.png, plus a generated sass/_icons.scss with one
 * class per icon. One HTTP request instead of a dozen.
 *
 * Also copies the computer icon to static/favicon.png, and generates
 * the PWA app icons (static/icons/app-*.png): nearest-neighbor
 * upscales of the 32px computer icon, so the pixels stay chunky.
 * Maskable variants sit on the teal desktop color with enough padding
 * to survive round masks.
 *
 * Run manually after changing the ICONS list:  node scripts/gen-sprite.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";

const SRC_DIR = new URL("../assets/icons-win98", import.meta.url).pathname;
const SPRITE_OUT = new URL("../static/icons/sprite.png", import.meta.url).pathname;
const SCSS_OUT = new URL("../sass/_icons.scss", import.meta.url).pathname;
const FAVICON_OUT = new URL("../static/favicon.png", import.meta.url).pathname;

/* name → source file. Small icons (≤16px) go on row y=0, 32px icons on
   row y=16. Class names are icon-<name>-<size>. */
const ICONS_SMALL = {
  computer: "computer_explorer-0.png",
  folder: "directory_closed-1.png",
  question: "help_question_mark-1.png",
  channels: "channels-1.png",
  console: "console_prompt-1.png",
  "control-panel": "directory_control_panel-1.png",
  shutdown: "shut_down_normal-1.png",
  notepad: "notepad-0.png",
  error: "msg_error-2.png",
  ie: "msie1-3.png",
  flag: "windows-3.png", // 14x14, Start button
  /* IE toolbar */
  home: "homepage-1.png",
  search: "search_web-1.png",
  favorites: "directory_favorites_small-1.png",
  history: "history-1.png",
  mail: "envelope_closed-1.png",
  print: "printer-1.png",
  world: "world-1.png",
};

/* The Win98 pack has no IE nav arrows (Back/Forward/Stop/Refresh) -
   in the real thing they live in a browser toolbar bitmap, not in
   .ico files. Drawn here as pixel maps instead. */
const PALETTE = {
  D: [0x00, 0x66, 0x00, 0xff], // dark green outline
  G: [0x00, 0xa8, 0x00, 0xff], // green body
  g: [0x58, 0xd0, 0x58, 0xff], // light green highlight
  E: [0x7b, 0x0b, 0x0b, 0xff], // dark red outline
  R: [0xc8, 0x1e, 0x1e, 0xff], // red body
  W: [0xff, 0xff, 0xff, 0xff], // white
};

const ARROW_BACK = [
  "................",
  "................",
  "................",
  "......DD........",
  ".....DgD........",
  "....DggDDDDDDD..",
  "...DgggggggggD..",
  "..DggggggggggD..",
  ".DgggggggggggD..",
  "..DGGGGGGGGGGD..",
  "...DGGGDDDDDDD..",
  "....DGGD........",
  ".....DGD........",
  "......DD........",
  "................",
  "................",
];

const ARROW_STOP = [
  "................",
  ".....EEEEE......",
  "....ERRRRRE.....",
  "...ERRRRRRRE....",
  "..ERWWRRRWWRE...",
  "..ERRWWRWWRRE...",
  "..ERRRWWWRRRE...",
  "..ERRRRWRRRRE...",
  "..ERRRWWWRRRE...",
  "..ERRWWRWWRRE...",
  "..ERWWRRRWWRE...",
  "...ERRRRRRRE....",
  "....ERRRRRE.....",
  ".....EEEEE......",
  "................",
  "................",
];

const ARROW_REFRESH = [
  "................",
  "...DDDDDDDDD....",
  "..DGGGGGGGGGD...",
  "..DGDDDDDDDGD...",
  "..DGD....DDGDD..",
  "..DGD...DGGGGGD.",
  "..DGD....DGGGD..",
  "..DGD.....DGD...",
  "..DGD......D....",
  "..DGD...........",
  "..DGD.......D...",
  "..DGDD.....DGD..",
  "..DGGGDDDDDGGD..",
  "...DGGGGGGGGD...",
  "....DDDDDDDD....",
  "................",
];

function mirrorMap(map) {
  return map.map((row) => row.split("").reverse().join(""));
}

function drawIcon(map) {
  const png = new PNG({ width: map[0].length, height: map.length });
  map.forEach((row, y) => {
    row.split("").forEach((ch, x) => {
      const c = PALETTE[ch];
      if (c) png.data.set(c, (y * png.width + x) * 4);
    });
  });
  return png;
}

const DRAWN_SMALL = {
  "nav-back": drawIcon(ARROW_BACK),
  "nav-fwd": drawIcon(mirrorMap(ARROW_BACK)),
  "nav-stop": drawIcon(ARROW_STOP),
  "nav-refresh": drawIcon(ARROW_REFRESH),
};

const ICONS_LARGE = {
  computer: "computer_explorer-2.png",
  folder: "directory_closed-0.png",
  question: "help_question_mark-0.png",
  error: "msg_error-0.png",
  warning: "msg_warning-0.png",
  ie: "msie1-0.png",
  modem: "expansion_board_modem-0.png",
};

const SMALL_ROW_H = 16;

function load(file) {
  return PNG.sync.read(readFileSync(join(SRC_DIR, file)));
}

const placements = [];
let x = 0;
for (const [name, file] of Object.entries(ICONS_SMALL)) {
  const png = load(file);
  if (png.height > SMALL_ROW_H) throw new Error(`${file} too tall for the small row`);
  placements.push({ name: `${name}-${png.width}`, png, x, y: 0 });
  x += png.width;
}
for (const [name, png] of Object.entries(DRAWN_SMALL)) {
  placements.push({ name: `${name}-${png.width}`, png, x, y: 0 });
  x += png.width;
}
const smallWidth = x;
x = 0;
for (const [name, file] of Object.entries(ICONS_LARGE)) {
  const png = load(file);
  if (png.width !== 32 || png.height !== 32) {
    throw new Error(`${file} is ${png.width}x${png.height}, expected 32x32`);
  }
  placements.push({ name: `${name}-32`, png, x, y: SMALL_ROW_H });
  x += 32;
}

const width = Math.max(smallWidth, x);
const height = SMALL_ROW_H + 32;
const sprite = new PNG({ width, height });

for (const p of placements) {
  PNG.bitblt(p.png, sprite, 0, 0, p.png.width, p.png.height, p.x, p.y);
}

writeFileSync(SPRITE_OUT, PNG.sync.write(sprite));
writeFileSync(FAVICON_OUT, readFileSync(join(SRC_DIR, ICONS_LARGE.computer)));

/* --- PWA app icons --- */

const DESKTOP_TEAL = [0x00, 0x80, 0x80, 0xff];

/** Integer nearest-neighbor upscale of `src`, centered on a canvas of
    `size`x`size`. `bg` fills the canvas (null = transparent). */
function appIcon(src, size, scale, bg) {
  const out = new PNG({ width: size, height: size });
  if (bg) {
    for (let i = 0; i < out.data.length; i += 4) out.data.set(bg, i);
  }
  const w = src.width * scale;
  const ox = (size - w) >> 1;
  const oy = (size - src.height * scale) >> 1;
  for (let y = 0; y < src.height * scale; y++) {
    for (let x2 = 0; x2 < w; x2++) {
      const si = (((y / scale) | 0) * src.width + ((x2 / scale) | 0)) * 4;
      if (src.data[si + 3] === 0) continue; /* keep bg under transparency */
      const di = ((oy + y) * size + ox + x2) * 4;
      out.data.set(src.data.subarray(si, si + 4), di);
    }
  }
  return PNG.sync.write(out);
}

const appSrc = load(ICONS_LARGE.computer);
const APP_ICONS = {
  "app-192.png": appIcon(appSrc, 192, 6, null),
  "app-512.png": appIcon(appSrc, 512, 16, null),
  /* maskable: icon occupies the central ~62%, inside the 80% safe zone */
  "app-maskable-192.png": appIcon(appSrc, 192, 4, DESKTOP_TEAL),
  "app-maskable-512.png": appIcon(appSrc, 512, 10, DESKTOP_TEAL),
};
const ICONS_DIR = new URL("../static/icons/", import.meta.url).pathname;
for (const [name, buf] of Object.entries(APP_ICONS)) {
  writeFileSync(join(ICONS_DIR, name), buf);
}

let scss = `/* AUTO-GENERATED by scripts/gen-sprite.mjs - do not edit by hand */

.icon {
  display: inline-block;
  flex-shrink: 0;
  background: url("/icons/sprite.png") no-repeat;
  image-rendering: pixelated;
}
`;
for (const p of placements) {
  scss += `
.icon-${p.name} {
  width: ${p.png.width}px;
  height: ${p.png.height}px;
  background-position: ${p.x === 0 ? "0" : `-${p.x}px`} ${p.y === 0 ? "0" : `-${p.y}px`};
}
`;
}
writeFileSync(SCSS_OUT, scss);

console.log(
  `✓ sprite.png (${width}x${height}, ${placements.length} icons) + _icons.scss + favicon.png + ${Object.keys(APP_ICONS).length} app icons`
);
