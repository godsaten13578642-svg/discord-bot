// Generates 3D Blockbench-style models for the Infinity Stones and Gauntlet,
// matching how the sabers use the example pack's 3D blade.
//
// For each stone (id + color read from its existing flat texture):
//   textures/block/civstone_<id>_body.png   solid stone color
//   textures/block/civstone_<id>_facet.png  lighter cut facet
//   textures/block/civstone_<id>_glow.png   bright translucent aura
//   models/block/civstone_<id>.json         faceted gem with glow shell
// For the gauntlet:
//   textures/block/civgauntlet_{metal,gold,gold_light}.png
//   models/block/civgauntlet_empty.json     fist + cuff, no gem
//   models/block/civgauntlet_<id>.json      same + glowing socket gem in that color
//
// Then PAPER CASES ARE REPOINTED by tools wiring (see bottom): paper.json
// infinity/gauntlet cases now target these models. Legacy flat models stay in
// place for the old netherite_axe / carrot_on_a_stick selectors.
//
// Pure Node (PNG decode all filters + encode), no dependencies.
// Run: node tools/gen_stone_models.mjs
// Tuning flags (all optional):
//   --glow-alpha=0..255    aura shell opacity (default 96)
//   --glow-boost=1.2       glow color brightness multiplier (default 1)
//   --facet-boost=1.15     facet highlight brightness multiplier (default 1)
//   --gem-scale=1.1        scale the whole stone gem about its center (default 1)
//   --socket-scale=1.2     scale the gauntlet's socket gem + glow (default 1)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MC = path.join(PLUGIN, 'src', 'main', 'resources', 'civbridge-pack', 'assets', 'minecraft');
const STONE_TEX_SRC = path.join(PLUGIN, 'src', 'main', 'resources', 'civbridge-pack', 'assets', 'civbridge', 'textures', 'item', 'infinity');

const STONES = ['space', 'mind', 'reality', 'power', 'time', 'soul'];

// ── Tuning flags ──────────────────────────────────────────────────────────
const FLAGS = {};
for (let i = 2; i < process.argv.length; i++) {
  const m = process.argv[i].match(/^--([a-z-]+)(?:=(.*))?$/);
  if (m) FLAGS[m[1]] = m[2] !== undefined ? m[2] : true;
}
const num = (k, d) => { const v = parseFloat(FLAGS[k]); return Number.isFinite(v) ? v : d; };
const GLOW_ALPHA = Math.max(0, Math.min(255, num('glow-alpha', 64)));
const GLOW_BOOST = num('glow-boost', 1);
const FACET_BOOST = num('facet-boost', 1);
const GEM_SCALE = num('gem-scale', 1);
const SOCKET_SCALE = num('socket-scale', 1.2);

/** Scales element boxes about a center point (defaults to item center). */
function scaleElements(elements, s, center = [8, 8, 8]) {
  if (s === 1) return elements;
  const mk = c => v => Math.round((c + (v - c) * s) * 1000) / 1000;
  const sx = mk(center[0]), sy = mk(center[1]), sz = mk(center[2]);
  return elements.map(e => ({
    ...e,
    from: [sx(e.from[0]), sy(e.from[1]), sz(e.from[2])],
    to: [sx(e.to[0]), sy(e.to[1]), sz(e.to[2])],
  }));
}

// ── PNG decode (8-bit RGB/RGBA, all filters) ──────────────────────────────
function decodePNG(buf) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buf.subarray(0, 8).equals(sig)) throw new Error('not a PNG');
  let pos = 8, width = 0, height = 0, colorType = 0, bitDepth = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`unsupported PNG (bitDepth ${bitDepth}, colorType ${colorType})`);
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const i = y * (stride + 1) + 1 + x;
      const left = x >= bpp ? out[y * stride + x - bpp] : 0;
      const up = y > 0 ? out[(y - 1) * stride + x] : 0;
      const ul = y > 0 && x >= bpp ? out[(y - 1) * stride + x - bpp] : 0;
      let v = raw[i];
      if (filter === 1) v = (v + left) & 0xff;
      else if (filter === 2) v = (v + up) & 0xff;
      else if (filter === 3) v = (v + ((left + up) >> 1)) & 0xff;
      else if (filter === 4) v = (v + paeth(left, up, ul)) & 0xff;
      out[y * stride + x] = v;
    }
  }
  return { width, height, bpp, data: out };
}

// ── PNG encode (RGBA, filter 0) ───────────────────────────────────────────
const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[n] = c;
}
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
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
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
function solidPNG([r, g, b], a = 255) {
  const px = Buffer.alloc(16 * 16 * 4);
  for (let i = 0; i < px.length; i += 4) { px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a; }
  return encodePNG(16, 16, px);
}
function clamp255(v) { return Math.max(0, Math.min(255, Math.round(v))); }

// ── Read each stone's color from its existing flat texture ────────────────
function stoneColor(id) {
  const img = decodePNG(fs.readFileSync(path.join(STONE_TEX_SRC, `stone_${id}.png`)));
  const cx = (img.width / 2 | 0) * img.bpp + (img.height / 2 | 0) * img.width * img.bpp;
  return [img.data[cx], img.data[cx + 1], img.data[cx + 2]];
}

// ── Write textures + models ───────────────────────────────────────────────
const TEXDIR = path.join(MC, 'textures', 'block');
const MODDIR = path.join(MC, 'models', 'block');
fs.mkdirSync(TEXDIR, { recursive: true });
fs.mkdirSync(MODDIR, { recursive: true });
let count = 0;
const write = (rel, data) => { fs.writeFileSync(path.join(MC, rel), data); count++; };

const FACE = (uv, tex) => ({ uv, texture: tex });

for (const id of STONES) {
  const [r, g, b] = stoneColor(id);
  write(path.join('textures', 'block', `civstone_${id}_body.png`), solidPNG([r, g, b]));
  write(path.join('textures', 'block', `civstone_${id}_facet.png`),
    solidPNG([
      clamp255((r * 1.3 + 24) * FACET_BOOST),
      clamp255((g * 1.3 + 24) * FACET_BOOST),
      clamp255((b * 1.3 + 24) * FACET_BOOST)]));
  write(path.join('textures', 'block', `civstone_${id}_glow.png`),
    solidPNG([
      clamp255((r * 0.55 + 128) * GLOW_BOOST),
      clamp255((g * 0.55 + 128) * GLOW_BOOST),
      clamp255((b * 0.55 + 128) * GLOW_BOOST)], GLOW_ALPHA));

  const t = `minecraft:block/civstone_${id}`;
  // Layered brilliant cut: point -> pavilion steps -> bright girdle ->
  // crown steps -> table. More, thinner layers read as "gem" at item scale.
  const gem = {
    parent: 'minecraft:item/generated',
    textures: { body: `${t}_body`, facet: `${t}_facet`, glow: `${t}_glow`, particle: `${t}_body` },
    elements: [
      // Pavilion: three tapering steps down to a point (culet).
      { name: 'culet', from: [7.25, 4.5, 7.25], to: [8.75, 5.5, 8.75],
        faces: { north: FACE([0, 0, 1.5, 1], '#body'), south: FACE([0, 0, 1.5, 1], '#body'),
                 east: FACE([0, 0, 1.5, 1], '#body'), west: FACE([0, 0, 1.5, 1], '#body'),
                 down: FACE([0, 0, 1.5, 1.5], '#body') } },
      { name: 'pavilion_mid', from: [6.25, 5.5, 6.25], to: [9.75, 6.5, 9.75],
        faces: { north: FACE([0, 0, 3.5, 1], '#body'), south: FACE([0, 0, 3.5, 1], '#body'),
                 east: FACE([0, 0, 3.5, 1], '#body'), west: FACE([0, 0, 3.5, 1], '#body'),
                 up: FACE([0, 0, 3.5, 3.5], '#body'), down: FACE([0, 0, 3.5, 3.5], '#body') } },
      { name: 'pavilion_wide', from: [5.25, 6.5, 5.75], to: [10.75, 7.6, 10.25],
        faces: { north: FACE([0, 0, 5.5, 1.1], '#body'), south: FACE([0, 0, 5.5, 1.1], '#body'),
                 east: FACE([0, 0, 4.5, 1.1], '#body'), west: FACE([0, 0, 4.5, 1.1], '#body'),
                 up: FACE([0, 0, 5.5, 4.5], '#body'), down: FACE([0, 0, 5.5, 4.5], '#body') } },
      // Bright girdle band where pavilion meets crown.
      { name: 'girdle', from: [4.9, 7.6, 5.55], to: [11.1, 8.0, 10.45],
        faces: { north: FACE([0, 0, 6.2, 0.4], '#facet'), south: FACE([0, 0, 6.2, 0.4], '#facet'),
                 east: FACE([0, 0, 4.9, 0.4], '#facet'), west: FACE([0, 0, 4.9, 0.4], '#facet') } },
      // Crown: two steps up to the table.
      { name: 'crown_lower', from: [5.5, 8.0, 6.0], to: [10.5, 9.4, 10.0],
        faces: { north: FACE([0, 0, 5, 1.4], '#body'), south: FACE([0, 0, 5, 1.4], '#body'),
                 east: FACE([0, 0, 4, 1.4], '#body'), west: FACE([0, 0, 4, 1.4], '#body'),
                 up: FACE([0, 0, 5, 4], '#facet'), down: FACE([0, 0, 5, 4], '#body') } },
      { name: 'crown_upper', from: [6.25, 9.4, 6.6], to: [9.75, 10.6, 9.4],
        faces: { north: FACE([0, 0, 3.5, 1.2], '#facet'), south: FACE([0, 0, 3.5, 1.2], '#facet'),
                 east: FACE([0, 0, 2.8, 1.2], '#facet'), west: FACE([0, 0, 2.8, 1.2], '#facet'),
                 up: FACE([0, 0, 3.5, 2.8], '#facet'), down: FACE([0, 0, 3.5, 2.8], '#body') } },
      // Table facet on top.
      { name: 'table', from: [6.9, 10.6, 7.15], to: [9.1, 10.85, 8.85],
        faces: { north: FACE([0, 0, 2.2, 0.25], '#facet'), south: FACE([0, 0, 2.2, 0.25], '#facet'),
                 east: FACE([0, 0, 1.7, 0.25], '#facet'), west: FACE([0, 0, 1.7, 0.25], '#facet'),
                 up: FACE([0, 0, 2.2, 1.7], '#facet'), down: FACE([0, 0, 2.2, 1.7], '#facet') } },
      // Translucent glow shell — snugger than before so it reads as shine,
      // not fog (alpha lives in the texture, default 64).
      { name: 'gem_aura', from: [4.5, 4.0, 5.1], to: [11.5, 11.3, 10.9],
        faces: { north: FACE([0, 0, 7, 7.3], '#glow'), south: FACE([0, 0, 7, 7.3], '#glow'),
                 east: FACE([0, 0, 5.8, 7.3], '#glow'), west: FACE([0, 0, 5.8, 7.3], '#glow'),
                 up: FACE([0, 0, 7, 5.8], '#glow'), down: FACE([0, 0, 7, 5.8], '#glow') } },
    ],
  };
  write(path.join('models', 'block', `civstone_${id}.json`),
    JSON.stringify({ ...gem, elements: scaleElements(gem.elements, GEM_SCALE) }));
  console.log(`  + civstone_${id} (color ${r},${g},${b})`);
}

// ── Gauntlet: shared metal textures, one model per variant ─────────────────
const METAL = [58, 58, 70], GOLD = [232, 178, 58], GOLD_L = [247, 208, 107];
write(path.join('textures', 'block', 'civgauntlet_metal.png'), solidPNG(METAL));
write(path.join('textures', 'block', 'civgauntlet_gold.png'), solidPNG(GOLD));
write(path.join('textures', 'block', 'civgauntlet_gold_light.png'), solidPNG(GOLD_L));

const FACE4 = (w, h, tex) => ({
  north: FACE([0, 0, w, h], tex), south: FACE([0, 0, w, h], tex),
  east: FACE([0, 0, h, h], tex), west: FACE([0, 0, h, h], tex),
  up: FACE([0, 0, w, h], tex), down: FACE([0, 0, w, h], tex),
});

function gauntletModel(gemId) {
  const gemTex = gemId ? `#gem` : null;
  const textures = {
    metal: 'minecraft:block/civgauntlet_metal',
    gold: 'minecraft:block/civgauntlet_gold',
    gold_light: 'minecraft:block/civgauntlet_gold_light',
    particle: 'minecraft:block/civgauntlet_gold',
  };
  if (gemId) textures.gem = `minecraft:block/civstone_${gemId}_body`;
  const elements = [
    // Tapered forearm cuff: wider at the elbow, narrowing to the wrist.
    { name: 'cuff_lower', from: [4.25, 1, 6.75], to: [11.75, 3.5, 9.25], faces: FACE4(7.5, 2.5, '#metal') },
    { name: 'cuff_upper', from: [3.75, 3.5, 6.5], to: [12.25, 6, 9.5], faces: FACE4(8.5, 2.5, '#metal') },
    // Cuff rim.
    { name: 'cuff_rim', from: [3.5, 5.5, 6.3], to: [12.5, 7, 9.7], faces: FACE4(9, 1.5, '#gold') },
    // Wrist joint between cuff and fist.
    { name: 'wrist', from: [5.5, 6.6, 6.9], to: [10.5, 7.6, 9.1], faces: FACE4(5, 1, '#metal') },
    // Fist block.
    { name: 'fist', from: [4.5, 7.6, 5.5], to: [11.5, 12.5, 10.5], faces: FACE4(7, 4.9, '#gold') },
    // Four separated fingers with knuckle ridges.
    { name: 'finger1', from: [5.0, 12.5, 6.1], to: [6.1, 14.5, 7.2], faces: FACE4(1.1, 2, '#gold_light') },
    { name: 'finger2', from: [6.5, 12.5, 6.1], to: [7.6, 14.8, 7.2], faces: FACE4(1.1, 2.3, '#gold_light') },
    { name: 'finger3', from: [8.0, 12.5, 6.1], to: [9.1, 14.8, 7.2], faces: FACE4(1.1, 2.3, '#gold_light') },
    { name: 'finger4', from: [9.5, 12.5, 6.1], to: [10.6, 14.5, 7.2], faces: FACE4(1.1, 2, '#gold_light') },
    // Thumb guard.
    { name: 'thumb', from: [2.9, 7.8, 6], to: [4.9, 10.8, 8.5], faces: FACE4(2, 3, '#metal') },
  ];
  if (gemId) {
    // Socket gem bursting from the back of the hand, in the stone's color
    // (scaled 1.2x about the gem center by default via --socket-scale).
    const socketEls = [
      {
        name: 'socket_gem', from: [6.8, 8.4, 4.7], to: [9.2, 10.8, 5.6],
        faces: FACE4(2.4, 2.4, gemTex),
      },
      {
        name: 'socket_glow', from: [6.2, 7.8, 4.3], to: [9.8, 11.4, 4.75],
        faces: FACE4(3.6, 3.6, '#gem_glow'),
      },
    ];
    elements.push(...scaleElements(socketEls, SOCKET_SCALE));
    textures.gem_glow = `minecraft:block/civstone_${gemId}_glow`;
  }
  return { parent: 'minecraft:item/generated', textures, elements };
}

write(path.join('models', 'block', 'civgauntlet_empty.json'), JSON.stringify(gauntletModel(null)));
console.log('  + civgauntlet_empty');
for (const id of STONES) {
  write(path.join('models', 'block', `civgauntlet_${id}.json`), JSON.stringify(gauntletModel(id)));
  console.log(`  + civgauntlet_${id}`);
}
console.log(`Generated ${count} files.`);
