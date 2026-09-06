// Generates the Fandom Items assets (Parkour Civ / Naruto / Supernatural)
// into src/main/resources/civbridge-pack/. Textures are synthesized 16x16
// pixel art. Hook-point JSONs are MERGED into existing files so the infinity
// cases are preserved. Run: node tools/gen_fandom_assets.mjs
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACK = path.join(ROOT, 'src', 'main', 'resources', 'civbridge-pack');

// ── Minimal PNG encoder (RGBA) ───────────────────────────────────────────────
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
  ihdr[8] = 8; ihdr[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Canvas helpers ───────────────────────────────────────────────────────────
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
function outline(img, dark, light) {
  // Adds a 1px darker outline + 1px inner highlight along the top-left edges.
  const edge = [];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (!filled(img, x, y)) continue;
    if (!filled(img, x - 1, y) || !filled(img, x, y - 1)) edge.push([x, y, light]);
    else if (!filled(img, x + 1, y) || !filled(img, x, y + 1)) edge.push([x, y, dark]);
  }
  for (const [x, y, c] of edge) set(img, x, y, c);
  return img;
}
function save(img, rel) {
  const file = path.join(PACK, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encodePNG(img.w, img.h, img.px));
  console.log('  wrote', path.relative(ROOT, file));
}
const writeJSON = (rel, obj) => {
  const file = path.join(PACK, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
};

// ── Pixel-art brushes ────────────────────────────────────────────────────────
function grid(img, rows, palette) {
  // palette: { '#': [r,g,b], '.': skip, letters: colors }
  for (let y = 0; y < rows.length && y < 16; y++) {
    for (let x = 0; x < rows[y].length && x < 16; x++) {
      const c = palette[rows[y][x]];
      if (c) set(img, x, y, c);
    }
  }
  return img;
}

// ── Parkour Civ ──────────────────────────────────────────────────────────────
function parkourBoots() {
  const img = canvas(16, 16);
  grid(img, [
    '................',
    '................',
    '................',
    '..OO......OO....',
    '..OO......OO....',
    '..OOOO..OOOO....',
    '..OOOO..OOOO....',
    '..OOOOOOOOOO....',
    '..OOOOOOOOOO....',
    '.DSSSSSSSSSSD...',
    '.DSSSSSSSSSSD...',
    '.DDDDDDDDDDDD...',
    '..W........W....',
    '................',
    '................',
    '................',
  ], { O: [255, 105, 20], D: [120, 40, 5], S: [240, 240, 245], W: [70, 70, 80] });
  return outline(img, [120, 40, 5], [255, 165, 80]);
}

function eyeOfEnder(img) {
  grid(img, [
    '................',
    '....########....',
    '...##########...',
    '..############..',
    '..####GGGG####..',
    '.####GGrrGGG###.',
    '.###GGrrrrGGG##.',
    '.###GrrBBrrGG##.',
    '.###GrrBBrrGG##.',
    '.###GGrrrrGGG##.',
    '.####GGrrGGG###.',
    '..####GGGG####..',
    '..############..',
    '...##########...',
    '....########....',
    '................',
  ], { '#': [25, 30, 40], G: [90, 220, 130], r: [140, 255, 170], B: [20, 30, 25] });
  return outline(img, [10, 12, 18], [60, 70, 90]);
}

// ── Naruto ───────────────────────────────────────────────────────────────────
function headbandProt() { return null; }

function headband() {
  const img = canvas(16, 16);
  grid(img, [
    '................',
    '................',
    '................',
    '................',
    '.BBBBBBBBBBBBB..',
    'BSBBSBBSBBSBBSB.',
    '.BBBBBBBBBBBBB..',
    '.BBSBBSBBSBBSBB.',
    '.BBBBBBBBBBBBB..',
    '.RRRRRRRRRRRRR..',
    '.RrrrrrrrrrrrR..',
    '.RRRRRRRRRRRRR..',
    '..SS........SS..',
    '..SS........SS..',
    '................',
    '................',
  ], { B: [90, 100, 115], S: [200, 210, 225], R: [180, 40, 50], r: [220, 80, 85] });
  return outline(img, [40, 45, 55], [150, 160, 175]);
}

function shurikenStar() {
  const img = canvas(16, 16);
  const cx = 7.5, cy = 7.5;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    const d = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx);
    const arm = Math.abs(((ang * 4 / Math.PI) % 2 + 2) % 2 - 1); // 4-point star
    if (d < 6.4 && arm * d < 4.4) set(img, x, y, d < 1.8 ? [200, 205, 215] : [155, 160, 175]);
  }
  for (let i = 0; i < 16; i++) set(img, i, 7, [60, 65, 75]);
  return outline(img, [60, 65, 75], [220, 225, 235]);
}

function scrollMark() {
  const img = canvas(16, 16);
  grid(img, [
    '................',
    '................',
    '.PPPP...........',
    'PssssPPPPPPPPP..',
    'PsssssssssssssP.',
    'PssskkksssskksP.',
    'PsssssssksssssP.',
    'PsskssskksskssP.',
    'PsssssssssssssP.',
    'PsskssssksskssP.',
    'PsssssssssssssP.',
    'PsssskkskkssssP.',
    'PsssssssssssssP.',
    'PsssssPPPPPPPPPP',
    '.PPPPP..........',
    '................',
  ], { P: [140, 100, 60], s: [235, 220, 190], k: [90, 60, 35] });
  return outline(img, [90, 60, 35], [250, 240, 215]);
}

function chidori() {
  const img = canvas(16, 16);
  const cx = 7.5, cy = 7.5;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    const d = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx);
    const bolt = Math.sin(ang * 6) * 0.9;                 // crackling edge
    if (d + bolt < 6.2) set(img, x, y, d < 2.2 ? [240, 255, 255] : d < 4.2 ? [150, 220, 255] : [70, 140, 255]);
  }
  for (let i = 0; i < 5; i++) set(img, (i * 3 + 2) % 16, (i * 5 + 3) % 16, [255, 255, 255]);
  return img;
}

function spiralOrb() {
  const img = canvas(16, 16);
  const cx = 7.5, cy = 7.5;
  for (let y = 0; 16 > y; y++) for (let x = 0; x < 16; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    const d = Math.hypot(dx, dy);
    if (d > 6.4) continue;
    const ang = Math.atan2(dy, dx);
    const spiral = Math.sin(ang * 3 + d * 2.2);
    if (d < 2.6) set(img, x, y, [255, 255, 255]);
    else if (spiral > 0.3) set(img, x, y, d > 5 ? [130, 190, 255] : [170, 215, 255]);
    else set(img, x, y, d > 5 ? [80, 140, 230] : [120, 175, 245]);
  }
  return img;
}

// ── Supernatural ─────────────────────────────────────────────────────────────
function angelBlade() {
  const img = canvas(16, 16);
  grid(img, [
    '............B...',
    '...........BGB..',
    '..........BGB...',
    '.........BGB....',
    '........BGB.....',
    '.......BGB......',
    '......BGB.......',
    '.....BGB........',
    '....BGB.........',
    '...BGB..........',
    '..BGB...........',
    '.BGB............',
    'BGB.............',
    '.G..............',
    '.GG.............',
    '................',
  ], { B: [210, 215, 230], G: [120, 60, 20] });
  return outline(img, [90, 45, 15], [240, 244, 255]);
}

function firstBlade() {
  const img = canvas(16, 16);
  grid(img, [
    '............B...',
    '...........BB...',
    '..........BDB...',
    '.........BDB....',
    '........BDB.....',
    '.......BDB......',
    '......BDB.......',
    '.....BDB........',
    '....BDB.........',
    '...BDB..........',
    '..BDB...........',
    '.BDB............',
    'BDB.............',
    '.D..............',
    '.DD.............',
    '................',
  ], { B: [190, 195, 205], D: [105, 55, 15] });
  return outline(img, [70, 35, 10], [235, 238, 245]);
}

function deathScythe() {
  const img = canvas(16, 16);
  grid(img, [
    '.......BBB......',
    '......BBBBB.....',
    '.....BB.B.BB....',
    '....BB..C..BB...',
    '...BB...C...BB..',
    '..BB....C....BB.',
    '..BB....C.....B.',
    '.GB.....C.....B.',
    '.G......C.......',
    '.G......C.......',
    '.G......C.......',
    '.G......C.......',
    '........C.......',
    '................',
    '................',
    '................',
  ], { B: [45, 45, 55], G: [95, 95, 110], C: [150, 155, 165] });
  return outline(img, [25, 25, 32], [90, 90, 105]);
}

function theColt() {
  const img = canvas(13, 8);
  grid(img, [
    '..........GG.',
    '.GGGGGGGGGDGG',
    'GGWWWWWWWWDGG',
    'GGWWWWWWWWDGG',
    '.GGGGGGGGGDGG',
    '..MM.........',
    '..MM.M.......',
    '.....MM......',
  ], { G: [140, 95, 45], D: [85, 55, 22], W: [200, 205, 215], M: [60, 45, 25] });
  const img16 = canvas(16, 16);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 13; x++) {
    const i = (y * 13 + x) * 4;
    if (img.px[i + 3]) set(img16, x, y + 4, [img.px[i], img.px[i + 1], img.px[i + 2]]);
  }
  return outline(img16, [60, 40, 18], [230, 190, 120]);
}

// ── Write textures ───────────────────────────────────────────────────────────
console.log('Generating fandom textures…');
save(parkourBoots(), 'assets/civbridge/textures/item/fandom/parkour_boots.png');
save(eyeOfEnder(canvas(16, 16)), 'assets/civbridge/textures/item/fandom/no_scope_eyes.png');
save(headband(), 'assets/civbridge/textures/item/fandom/hidden_leaf_headband.png');
save(shurikenStar(), 'assets/civbridge/textures/item/fandom/ninja_star.png');
save(scrollMark(), 'assets/civbridge/textures/item/fandom/summoning_scroll.png');
save(chidori(), 'assets/civbridge/textures/item/fandom/chidori_blade.png');
save(spiralOrb(), 'assets/civbridge/textures/item/fandom/rasengan.png');
save(angelBlade(), 'assets/civbridge/textures/item/fandom/angel_blade.png');
save(firstBlade(), 'assets/civbridge/textures/item/fandom/first_blade.png');
save(deathScythe(), 'assets/civbridge/textures/item/fandom/deaths_scythe.png');
save(theColt(), 'assets/civbridge/textures/item/fandom/the_colt.png');

// ── Models ───────────────────────────────────────────────────────────────────
const F = (tex, parent = 'minecraft:item/generated') => ({
  parent,
  textures: { layer0: `civbridge:item/fandom/${tex}` },
});
const HAND = 'minecraft:item/handheld';
const models = {
  parkour_boots: F('parkour_boots'),
  no_scope_eyes: F('no_scope_eyes'),
  hidden_leaf_headband: F('hidden_leaf_headband'),
  ninja_star: F('ninja_star', HAND),
  summoning_scroll: F('summoning_scroll'),
  chidori_blade: F('chidori_blade', HAND),
  rasengan: F('rasengan', HAND),
  angel_blade: F('angel_blade', HAND),
  first_blade: F('first_blade', HAND),
  deaths_scythe: F('deaths_scythe', HAND),
  the_colt: F('the_colt', HAND),
};
for (const [name, model] of Object.entries(models)) {
  writeJSON(`assets/civbridge/models/item/fandom/${name}.json`, model);
}
console.log('Wrote fandom models.');

// ── Merge hook points into the existing vanilla item definitions ─────────────
const selectCases = file => JSON.parse(fs.readFileSync(path.join(PACK, file), 'utf8')).model.cases;
const selectFallback = file => JSON.parse(fs.readFileSync(path.join(PACK, file), 'utf8')).model.fallback;

// new hook items — netherite_sword and carrot_on_a_stick already taken.
const NEW_HOOKS = {
  'netherite_pickaxe': { legacyBase: 3001, items: [
    { id: 'parkour_boots', cmd: 'civbridge:fandom_parkour_boots', model: 'parkour_boots' },
    { id: 'no_scope_eyes', cmd: 'civbridge:fandom_no_scope_eyes', model: 'no_scope_eyes' },
    { id: 'hidden_leaf_headband', cmd: 'civbridge:fandom_hidden_leaf_headband', model: 'hidden_leaf_headband' },
    { id: 'summoning_scroll', cmd: 'civbridge:fandom_summoning_scroll', model: 'summoning_scroll' },
  ]},
  'netherite_shovel': { legacyBase: 3101, items: [
    { id: 'ninja_star', cmd: 'civbridge:fandom_ninja_star', model: 'ninja_star' },
    { id: 'rasengan', cmd: 'civbridge:fandom_rasengan', model: 'rasengan' },
    { id: 'chidori_blade', cmd: 'civbridge:fandom_chidori_blade', model: 'chidori_blade' },
    { id: 'angel_blade', cmd: 'civbridge:fandom_angel_blade', model: 'angel_blade' },
  ]},
  'netherite_hoe': { legacyBase: 3201, items: [
    { id: 'first_blade', cmd: 'civbridge:fandom_first_blade', model: 'first_blade' },
    { id: 'deaths_scythe', cmd: 'civbridge:fandom_deaths_scythe', model: 'deaths_scythe' },
    { id: 'the_colt', cmd: 'civbridge:fandom_the_colt', model: 'the_colt' },
  ]},
};

for (const [vanilla, cfg] of Object.entries(NEW_HOOKS)) {
  writeJSON(`assets/minecraft/items/${vanilla}.json`, {
    model: {
      type: 'minecraft:select',
      property: 'minecraft:custom_model_data',
      index: 0,
      cases: cfg.items.map(it => ({
        when: it.cmd,
        model: { type: 'minecraft:model', model: `civbridge:item/fandom/${it.model}` },
      })),
      fallback: { type: 'minecraft:model', model: `minecraft:item/${vanilla}` },
    },
  });
  writeJSON(`assets/minecraft/models/item/${vanilla}.json`, {
    parent: 'minecraft:item/handheld',
    textures: { layer0: `minecraft:item/${vanilla}` },
    overrides: cfg.items.map((it, i) => ({
      predicate: { custom_model_data: cfg.legacyBase + i },
      model: `civbridge:item/fandom/${it.model}`,
    })),
  });
}
console.log('Wrote hook points: netherite_pickaxe, netherite_shovel, netherite_hoe.');
console.log('Done.');
