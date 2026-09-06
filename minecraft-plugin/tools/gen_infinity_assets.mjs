// Generates the Infinity Stones + Gauntlet assets into
// src/main/resources/civbridge-pack/ (textures are synthesized 16x16 pixel art
// so the feature needs no external art). Run: node tools/gen_infinity_assets.mjs
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACK = path.join(ROOT, 'src', 'main', 'resources', 'civbridge-pack');

// ── Minimal PNG encoder (RGBA, no interlace) ─────────────────────────────────
const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[n] = c;
}
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function encodePNG(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Tiny canvas helpers ──────────────────────────────────────────────────────
function canvas(w, h) { return { w, h, px: new Uint8Array(w * h * 4) }; }
function set(img, x, y, [r, g, b], a = 255) {
  if (x < 0 || y < 0 || x >= img.w || y >= img.h) return;
  const i = (y * img.w + x) * 4;
  img.px[i] = r; img.px[i + 1] = g; img.px[i + 2] = b; img.px[i + 3] = a;
}
function filled(img, x, y) {
  if (x < 0 || y < 0 || x >= img.w || y >= img.h) return false;
  return img.px[(y * img.w + x) * 4 + 3] !== 0;
}
function save(img, rel) {
  const file = path.join(PACK, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encodePNG(img.w, img.h, img.px));
  console.log('  wrote', path.relative(ROOT, file));
}

// ── Palettes ─────────────────────────────────────────────────────────────────
const STONES = {
  space:   { main: [70, 110, 235], light: [150, 180, 255], dark: [30, 50, 140] },
  mind:    { main: [245, 205, 45], light: [255, 240, 140], dark: [170, 125, 15] },
  reality: { main: [235, 50, 65],  light: [255, 125, 135], dark: [150, 18, 30] },
  power:   { main: [175, 55, 225], light: [220, 130, 255], dark: [105, 25, 145] },
  time:    { main: [60, 200, 95],  light: [150, 255, 175], dark: [25, 125, 50] },
  soul:    { main: [255, 145, 40], light: [255, 195, 115], dark: [190, 85, 12] },
};
const GOLD = { main: [212, 175, 55], light: [240, 205, 100], dark: [135, 96, 18] };
const EMPTY_SOCKET = { main: [58, 48, 28], dark: [38, 32, 20] };

// Socket position (top-left px) per stone on the gauntlet's back-of-hand.
const SOCKETS = { space: [2, 5], mind: [6, 5], reality: [10, 5], power: [3, 8], time: [6, 8], soul: [9, 8] };

// 16x16 gauntlet silhouette: '#' = gold, '.' = empty. Rows 2-3 fingers,
// 4-11 hand, 12-14 cuff/wrist.
const GAUNTLET_GRID = [
  '................',
  '................',
  '.##.##.##.##....',
  '.##.##.##.##....',
  '.##############.',
  '.##############.',
  '.##############.',
  '################',
  '################',
  '################',
  '.##############.',
  '.##############.',
  '..############..',
  '..############..',
  '...##########...',
  '................',
];

function drawStone(pal) {
  const img = canvas(16, 16);
  const cx = 7.5, cy = 7.5, r = 6.3;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      if (d > r) continue;
      let c;
      if (d > r - 1.3) c = pal.dark;                    // rim
      else {
        const f = Math.abs(dx) + Math.abs(dy);          // diamond facets
        c = f < 2.4 ? pal.light : f < 5.0 ? pal.main : pal.dark;
      }
      set(img, x, y, c);
    }
  }
  set(img, 5, 5, [255, 255, 255]);
  set(img, 6, 5, [255, 255, 255], 210);
  set(img, 5, 6, [255, 255, 255], 170);
  return img;
}

function drawGauntlet(socketed = {}) {
  const img = canvas(16, 16);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      if (GAUNTLET_GRID[y][x] !== '#') continue;
      const edge = !filled(img, x - 1, y) || !filled(img, x + 1, y)
        || !filled(img, x, y - 1) || !filled(img, x, y + 1);
      if (edge) set(img, x, y, GOLD.dark);
      else if (y === 4) set(img, x, y, GOLD.light);     // knuckle glint band
      else set(img, x, y, GOLD.main);
    }
  }
  for (const [id, [sx, sy]] of Object.entries(SOCKETS)) {
    const pal = socketed[id] ? STONES[id] : EMPTY_SOCKET;
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const corner = dx === 1 && dy === 1;
        const c = socketed[id]
          ? (dx === 0 && dy === 0 ? pal.light : corner ? pal.dark : pal.main)
          : (corner ? pal.dark : pal.main);
        set(img, sx + dx, sy + dy, c);
      }
    }
  }
  return img;
}

// ── Write textures ───────────────────────────────────────────────────────────
console.log('Generating infinity stone textures…');
for (const [id, pal] of Object.entries(STONES)) {
  save(drawStone(pal), `assets/civbridge/textures/item/infinity/stone_${id}.png`);
}
console.log('Generating gauntlet textures…');
save(drawGauntlet(), 'assets/civbridge/textures/item/infinity/gauntlet_empty.png');
for (const id of Object.keys(STONES)) {
  save(drawGauntlet({ [id]: true }), `assets/civbridge/textures/item/infinity/gauntlet_${id}.png`);
}
save(drawGauntlet(Object.fromEntries(Object.keys(STONES).map(k => [k, true]))),
  'assets/civbridge/textures/item/infinity/gauntlet_soul.png');

// ── Per-item models ──────────────────────────────────────────────────────────
const modelDir = path.join(PACK, 'assets', 'civbridge', 'models', 'item', 'infinity');
const writeJSON = (file, obj) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
};

for (const id of Object.keys(STONES)) {
  writeJSON(path.join(modelDir, `stone_${id}.json`), {
    parent: 'minecraft:item/generated',
    textures: { layer0: `civbridge:item/infinity/stone_${id}` },
  });
}
for (const variant of ['empty', ...Object.keys(STONES)]) {
  writeJSON(path.join(modelDir, `gauntlet_${variant}.json`), {
    parent: 'minecraft:item/handheld',
    display: {
      firstperson_righthand: { rotation: [0, -90, 25], translation: [1.13, 3.2, 1.13], scale: [0.68, 0.68, 0.68] },
      firstperson_lefthand:  { rotation: [0, -90, 25], translation: [1.13, 3.2, 1.13], scale: [0.68, 0.68, 0.68] },
      thirdperson_righthand: { rotation: [0, -90, 55], translation: [0, 4.0, 0.5], scale: [0.85, 0.85, 0.85] },
      thirdperson_lefthand:  { rotation: [0, 90, -55], translation: [0, 4.0, 0.5], scale: [0.85, 0.85, 0.85] },
    },
    textures: { layer0: `civbridge:item/infinity/gauntlet_${variant}` },
  });
}
console.log('Wrote civbridge models.');

// ── Vanilla hook points ──────────────────────────────────────────────────────
const select = (cases, fallback) => ({
  model: {
    type: 'minecraft:select',
    property: 'minecraft:custom_model_data',
    index: 0,
    cases,
    fallback: { type: 'minecraft:model', model: fallback },
  },
});
const overrides = preds => preds.map(([cmd, model]) => ({
  predicate: { custom_model_data: cmd }, model,
}));

// Stones ride on the netherite axe (modern string CMD + legacy ints 2001-2006).
writeJSON(path.join(PACK, 'assets/minecraft/items/netherite_axe.json'), select(
  Object.keys(STONES).map(id => ({
    when: `civbridge:infinity_stone_${id}`,
    model: { type: 'minecraft:model', model: `civbridge:item/infinity/stone_${id}` },
  })),
  'minecraft:item/netherite_axe',
));
writeJSON(path.join(PACK, 'assets/minecraft/models/item/netherite_axe.json'), {
  parent: 'minecraft:item/handheld',
  textures: { layer0: 'minecraft:item/netherite_axe' },
  overrides: overrides(Object.keys(STONES).map((id, i) => [2001 + i, `civbridge:item/infinity/stone_${id}`])),
});

// Gauntlet rides on carrot_on_a_stick (legacy ints 2101-2107; 2107 = full).
const gauntletVariants = ['empty', ...Object.keys(STONES)];
writeJSON(path.join(PACK, 'assets/minecraft/items/carrot_on_a_stick.json'), select(
  gauntletVariants.map(v => ({
    when: `civbridge:gauntlet_${v}`,
    model: { type: 'minecraft:model', model: `civbridge:item/infinity/gauntlet_${v}` },
  })),
  'minecraft:item/carrot_on_a_stick',
));
writeJSON(path.join(PACK, 'assets/minecraft/models/item/carrot_on_a_stick.json'), {
  parent: 'minecraft:item/handheld',
  textures: { layer0: 'minecraft:item/carrot_on_a_stick' },
  overrides: overrides(gauntletVariants.map((v, i) => [2101 + i, `civbridge:item/infinity/gauntlet_${v}`])),
});
console.log('Wrote vanilla item hook points (netherite_axe, carrot_on_a_stick).');

// ── pack.mcmeta ──────────────────────────────────────────────────────────────
writeJSON(path.join(PACK, 'pack.mcmeta'), {
  pack: {
    pack_format: 46,
    description: '§bCivBridge §3Custom Items §8— §f6 Lightsabers §8• §6Infinity Stones & Gauntlet §7(1.21.4+)',
  },
});
console.log('Done.');
