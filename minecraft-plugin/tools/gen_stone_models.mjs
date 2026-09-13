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
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MC = path.join(PLUGIN, 'src', 'main', 'resources', 'civbridge-pack', 'assets', 'minecraft');
const STONE_TEX_SRC = path.join(PLUGIN, 'src', 'main', 'resources', 'civbridge-pack', 'assets', 'civbridge', 'textures', 'item', 'infinity');

const STONES = ['space', 'mind', 'reality', 'power', 'time', 'soul'];

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
    solidPNG([clamp255(r * 1.3 + 24), clamp255(g * 1.3 + 24), clamp255(b * 1.3 + 24)]));
  write(path.join('textures', 'block', `civstone_${id}_glow.png`),
    solidPNG([clamp255(r * 0.55 + 128), clamp255(g * 0.55 + 128), clamp255(b * 0.55 + 128)], 96));

  const t = `minecraft:block/civstone_${id}`;
  const gem = {
    parent: 'minecraft:item/generated',
    textures: { body: `${t}_body`, facet: `${t}_facet`, glow: `${t}_glow`, particle: `${t}_body` },
    elements: [
      // Lower gem half (wider).
      { name: 'gem_lower', from: [5, 5, 6], to: [11, 8, 10],
        faces: { north: FACE([0, 0, 6, 3], '#body'), south: FACE([0, 0, 6, 3], '#body'),
                 east: FACE([0, 0, 4, 3], '#body'), west: FACE([0, 0, 4, 3], '#body'),
                 up: FACE([0, 0, 6, 4], '#body'), down: FACE([0, 0, 6, 4], '#body') } },
      // Upper gem half (tapered).
      { name: 'gem_upper', from: [5.75, 8, 6.5], to: [10.25, 11, 9.5],
        faces: { north: FACE([0, 0, 4.5, 3], '#body'), south: FACE([0, 0, 4.5, 3], '#body'),
                 east: FACE([0, 0, 3, 3], '#body'), west: FACE([0, 0, 3, 3], '#body'),
                 up: FACE([0, 0, 4.5, 3], '#facet'), down: FACE([0, 0, 4.5, 3], '#body') } },
      // Table facet on top.
      { name: 'gem_table', from: [6.5, 11, 7], to: [9.5, 11.25, 9],
        faces: { north: FACE([0, 0, 3, 0.25], '#facet'), south: FACE([0, 0, 3, 0.25], '#facet'),
                 east: FACE([0, 0, 2, 0.25], '#facet'), west: FACE([0, 0, 2, 0.25], '#facet'),
                 up: FACE([0, 0, 3, 2], '#facet'), down: FACE([0, 0, 3, 2], '#facet') } },
      // Bright girdle line where the halves meet.
      { name: 'gem_girdle', from: [4.9, 7.85, 5.9], to: [11.1, 8.15, 10.1],
        faces: { north: FACE([0, 0, 6.2, 0.3], '#facet'), south: FACE([0, 0, 6.2, 0.3], '#facet'),
                 east: FACE([0, 0, 4.2, 0.3], '#facet'), west: FACE([0, 0, 4.2, 0.3], '#facet') } },
      // Translucent glow shell.
      { name: 'gem_aura', from: [4.4, 4.4, 5.4], to: [11.6, 11.6, 10.6],
        faces: { north: FACE([0, 0, 7.2, 7.2], '#glow'), south: FACE([0, 0, 7.2, 7.2], '#glow'),
                 east: FACE([0, 0, 5.2, 7.2], '#glow'), west: FACE([0, 0, 5.2, 7.2], '#glow'),
                 up: FACE([0, 0, 7.2, 5.2], '#glow'), down: FACE([0, 0, 7.2, 5.2], '#glow') } },
    ],
  };
  write(path.join('models', 'block', `civstone_${id}.json`), JSON.stringify(gem));
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
    // Forearm cuff.
    { name: 'cuff', from: [3.5, 1, 6.5], to: [12.5, 6, 9.5], faces: FACE4(9, 5, '#metal') },
    // Cuff rim.
    { name: 'cuff_rim', from: [3.25, 5.5, 6.25], to: [12.75, 7, 9.75], faces: FACE4(9.5, 1.5, '#gold') },
    // Fist block.
    { name: 'fist', from: [4.5, 7, 5.5], to: [11.5, 12.5, 10.5], faces: FACE4(7, 5.5, '#gold') },
    // Finger plates across the top.
    { name: 'fingers', from: [4.9, 12.5, 6], to: [11.1, 13.6, 10], faces: FACE4(6.2, 1.1, '#gold_light') },
    // Knuckle studs.
    { name: 'k1', from: [5.4, 13.1, 6.4], to: [6.4, 14.1, 7.4], faces: FACE4(1, 1, '#gold_light') },
    { name: 'k2', from: [7.5, 13.1, 6.4], to: [8.5, 14.1, 7.4], faces: FACE4(1, 1, '#gold_light') },
    { name: 'k3', from: [9.6, 13.1, 6.4], to: [10.6, 14.1, 7.4], faces: FACE4(1, 1, '#gold_light') },
    // Thumb guard.
    { name: 'thumb', from: [2.9, 7.5, 6], to: [4.9, 10.5, 8.5], faces: FACE4(2, 3, '#metal') },
  ];
  if (gemId) {
    // Socket gem bursting from the back of the hand, in the stone's color.
    elements.push({
      name: 'socket_gem', from: [6.9, 8.6, 4.9], to: [9.1, 10.8, 5.7],
      faces: FACE4(2.2, 2.2, gemTex),
    });
    elements.push({
      name: 'socket_glow', from: [6.4, 8.1, 4.5], to: [9.6, 11.3, 4.95],
      faces: FACE4(3.2, 3.2, '#gem_glow'),
    });
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
