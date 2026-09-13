// Generates 3D Blockbench-style models for the 11 Fandom items (Parkour Civ /
// Naruto / Supernatural), matching the saber/stone treatment.
//
// Per item: body/light/dark(/glow) textures cloned from the existing flat
// texture's center color, plus a hand-shaped voxel model with a real
// silhouette. Selector cases (paper + the plugin's pickaxe/shovel/hoe paths)
// are repointed at the new models by the wiring step at the bottom.
//
// Pure Node (PNG decode all filters + encode), no dependencies.
// Run: node tools/gen_fandom_models.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MC = path.join(PLUGIN, 'src', 'main', 'resources', 'civbridge-pack', 'assets', 'minecraft');
const FLAT = path.join(PLUGIN, 'src', 'main', 'resources', 'civbridge-pack', 'assets', 'civbridge', 'textures', 'item', 'fandom');

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
const clamp255 = v => Math.max(0, Math.min(255, Math.round(v)));
const shade = ([r, g, b], k, add = 0) => [clamp255(r * k + add), clamp255(g * k + add), clamp255(b * k + add)];

function flatColor(id) {
  const img = decodePNG(fs.readFileSync(path.join(FLAT, `${id}.png`)));
  // Center-of-mass of non-transparent pixels (falls back to center pixel).
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * img.bpp;
      const a = img.bpp === 4 ? img.data[i + 3] : 255;
      if (a > 64) { r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n++; }
    }
  }
  if (n === 0) { const c = (img.width >> 1) * img.bpp + (img.height >> 1) * img.width * img.bpp; return [img.data[c], img.data[c + 1], img.data[c + 2]]; }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

// ── Model helpers ─────────────────────────────────────────────────────────
let count = 0;
const TEXDIR = path.join(MC, 'textures', 'block');
const MODDIR = path.join(MC, 'models', 'block');
fs.mkdirSync(TEXDIR, { recursive: true });
fs.mkdirSync(MODDIR, { recursive: true });
const write = (rel, data) => { fs.writeFileSync(path.join(MC, rel), data); count++; };

const FACE = (uv, tex) => ({ uv, texture: tex });
/** Box with all six faces textured, sized to the face. */
function B(name, from, to, tex, rot) {
  const w = Math.abs(to[0] - from[0]), h = Math.abs(to[1] - from[1]), d = Math.abs(to[2] - from[2]);
  const e = {
    name, from, to,
    faces: {
      north: FACE([0, 0, w, h], tex), south: FACE([0, 0, w, h], tex),
      east: FACE([0, 0, d, h], tex), west: FACE([0, 0, d, h], tex),
      up: FACE([0, 0, w, d], tex), down: FACE([0, 0, w, d], tex),
    },
  };
  if (rot) e.rotation = rot;
  return e;
}
const model = elements => ({ parent: 'minecraft:item/generated', textures: {}, elements });

// ── Per-item palettes + builders ──────────────────────────────────────────
const r2 = (origin, axis, angle) => ({ origin, axis, angle });

const BUILDERS = {
  parkour_boots(c) {
    return {
      textures: { body: '#body', light: '#light', dark: '#dark', particle: '#body' },
      elements: [
        B('sole_L', [2.5, 2, 6], [7.5, 3.5, 11], '#dark'),
        B('boot_L', [3, 3.5, 6.5], [7, 9, 10.5], '#body'),
        B('cuff_L', [3, 8.5, 6.5], [7, 9.75, 10.5], '#light'),
        B('sole_R', [8.5, 2, 6], [13.5, 3.5, 11], '#dark'),
        B('boot_R', [9, 3.5, 6.5], [13, 9, 10.5], '#body'),
        B('cuff_R', [9, 8.5, 6.5], [13, 9.75, 10.5], '#light'),
        B('toe_L', [2.75, 3.25, 9.75], [7.25, 4.5, 11], '#light'),
        B('toe_R', [8.75, 3.25, 9.75], [13.25, 4.5, 11], '#light'),
      ],
    };
  },
  no_scope_eyes(c) {
    return {
      textures: { body: '#body', light: '#light', dark: '#dark', particle: '#body' },
      elements: [
        B('strap', [2, 7, 7.5], [14, 9, 8.6], '#dark'),
        B('lens_L', [3, 6, 6.4], [7, 10, 9], '#body'),
        B('lens_R', [9, 6, 6.4], [13, 10, 9], '#body'),
        B('bridge', [6.8, 7.5, 6.6], [9.2, 8.5, 8.8], '#light'),
        B('rim_L_top', [3, 9.75, 6.5], [7, 10.25, 8.9], '#light'),
        B('rim_R_top', [9, 9.75, 6.5], [13, 10.25, 8.9], '#light'),
        B('glint_L', [3.6, 8.4, 6.3], [4.6, 9.4, 6.45], '#light'),
        B('glint_R', [9.6, 8.4, 6.3], [10.6, 9.4, 6.45], '#light'),
      ],
    };
  },
  hidden_leaf_headband(c) {
    return {
      textures: { body: '#body', light: '#light', dark: '#dark', particle: '#body' },
      elements: [
        B('band', [2, 7, 7.5], [14, 9.5, 8.6], '#dark'),
        B('plate', [4.5, 6.5, 6.3], [11.5, 10, 7.8], '#light'),
        B('leaf_mark', [7, 7.3, 6.2], [9, 9.2, 6.32], '#dark'),
        B('rivet_L', [5, 9.4, 6.2], [5.6, 9.9, 6.35], '#dark'),
        B('rivet_R', [10.4, 9.4, 6.2], [11, 9.9, 6.35], '#dark'),
      ],
    };
  },
  summoning_scroll(c) {
    return {
      textures: { body: '#body', light: '#light', dark: '#dark', glow: '#glow', particle: '#body' },
      elements: [
        B('roll', [3, 6, 6.5], [13, 10, 9.5], '#body'),
        B('roller_L', [2.25, 5.5, 6], [3.75, 10.5, 10], '#dark'),
        B('roller_R', [12.25, 5.5, 6], [13.75, 10.5, 10], '#dark'),
        B('flap', [5.5, 3.9, 6.75], [10.5, 6.2, 9.25], '#light'),
        B('seal', [7.3, 4.6, 6.55], [8.7, 6, 7.95], '#glow'),
        B('script_line', [5.9, 8.6, 6.4], [10.1, 8.9, 6.55], '#dark'),
        B('script_line2', [5.9, 7.7, 6.4], [9.2, 8, 6.55], '#dark'),
      ],
    };
  },
  ninja_star(c) {
    return {
      textures: { body: '#body', light: '#light', dark: '#dark', particle: '#body' },
      elements: [
        B('hub', [6.5, 6.5, 7.4], [9.5, 9.5, 8.6], '#dark'),
        B('blade_N', [7.25, 9.5, 7.6], [8.75, 12.75, 8.4], '#body'),
        B('blade_S', [7.25, 3.25, 7.6], [8.75, 6.5, 8.4], '#body'),
        B('blade_E', [9.5, 7.25, 7.6], [12.75, 8.75, 8.4], '#body'),
        B('blade_W', [3.25, 7.25, 7.6], [6.5, 8.75, 8.4], '#body'),
        B('tip_N', [7.55, 12.75, 7.7], [8.45, 13.75, 8.3], '#light'),
        B('tip_S', [7.55, 2.25, 7.7], [8.45, 3.25, 8.3], '#light'),
        B('tip_E', [12.75, 7.55, 7.7], [13.75, 8.45, 8.3], '#light'),
        B('tip_W', [2.25, 7.55, 7.7], [3.25, 8.45, 8.3], '#light'),
        B('hole_ring', [7.4, 7.4, 7.3], [8.6, 8.6, 7.45], '#light'),
      ],
    };
  },
  rasengan(c) {
    return {
      textures: { body: '#body', light: '#light', glow: '#glow', particle: '#glow' },
      elements: [
        // Voxel-sphere: three orthogonal slabs + bright core.
        B('slabX', [4.75, 5.5, 7.25], [11.25, 10.5, 8.75], '#glow'),
        B('slabY', [7.25, 4.75, 5.5], [8.75, 11.25, 10.5], '#glow'),
        B('slabZ', [5.5, 7.25, 4.75], [10.5, 8.75, 11.25], '#glow'),
        B('shell_n', [5.25, 5.25, 7.6], [10.75, 10.75, 8.4], '#body'),
        B('shell_e', [7.6, 5.25, 5.25], [8.4, 10.75, 10.75], '#body'),
        B('core', [6.6, 6.6, 6.6], [9.4, 9.4, 9.4], '#light'),
        B('streak_1', [5.9, 8.9, 7.55], [10.1, 9.5, 7.7], '#light'),
        B('streak_2', [5.9, 6.5, 8.3], [10.1, 7.1, 8.45], '#light'),
      ],
    };
  },
  chidori_blade(c) {
    return {
      textures: { body: '#body', light: '#light', dark: '#dark', glow: '#glow', particle: '#body' },
      elements: [
        B('handle', [7, 2, 7.25], [9, 5, 8.75], '#dark'),
        B('guard', [6, 5, 6.75], [10, 6, 9.25], '#light'),
        B('blade_1', [6.75, 6, 7], [9.25, 9, 9], '#body'),
        B('blade_2', [6.25, 9, 7.15], [8.75, 11.5, 8.85], '#body'),
        B('blade_3', [7.25, 11.5, 7.35], [8.75, 13.25, 8.65], '#light'),
        B('arc_1', [9.25, 7.5, 7.7], [9.6, 10.5, 7.85], '#glow'),
        B('arc_2', [6.15, 9.5, 8.15], [6.5, 12, 8.3], '#glow'),
      ],
    };
  },
  angel_blade(c) {
    return {
      textures: { body: '#body', light: '#light', dark: '#dark', particle: '#body' },
      elements: [
        B('handle', [7.25, 2, 7.4], [8.75, 5.5, 8.6], '#dark'),
        B('pommel', [7, 1.35, 7.2], [9, 2.15, 8.8], '#light'),
        B('guard', [6, 5.5, 7.25], [10, 6.5, 8.75], '#light'),
        B('blade', [6.9, 6.5, 7.3], [9.1, 14, 8.7], '#body'),
        B('fuller', [7.8, 6.6, 7.2], [8.2, 13, 8.8], '#light'),
        B('tip', [7.4, 14, 7.55], [8.6, 15.5, 8.45], '#light'),
      ],
    };
  },
  first_blade(c) {
    return {
      textures: { body: '#body', light: '#light', dark: '#dark', glow: '#glow', particle: '#dark' },
      elements: [
        B('grip', [7, 2.5, 7.25], [9, 5.5, 8.75], '#dark'),
        B('guard', [5, 5.5, 6.75], [11, 6.75, 9.25], '#dark'),
        B('blade', [5.75, 6.75, 6.9], [10.25, 14, 9.1], '#body'),
        B('edge_L', [5.75, 7, 6.8], [6.35, 13.75, 9.2], '#light'),
        B('edge_R', [9.65, 7, 6.8], [10.25, 13.75, 9.2], '#light'),
        B('rune_line', [7.6, 7.5, 6.75], [8.4, 13, 6.95], '#glow'),
        B('tip', [6.9, 14, 7.4], [9.1, 15.25, 8.6], '#body'),
      ],
    };
  },
  deaths_scythe(c) {
    return {
      textures: { body: '#body', light: '#light', dark: '#dark', particle: '#dark' },
      elements: [
        B('shaft_low', [7.25, 1.5, 7.5], [8.75, 8, 8.5], '#dark', r2([8, 8, 8], 'z', 22.5)),
        B('shaft_high', [7.25, 8, 7.5], [8.75, 13.5, 8.5], '#dark', r2([8, 8, 8], 'z', -22.5)),
        B('blade_root', [8.5, 12.75, 7.25], [13, 14, 8.75], '#body', r2([8.75, 13.5, 8], 'z', -22.5)),
        B('blade_hook', [11.75, 10.5, 7.4], [13.25, 13.25, 8.6], '#body', r2([12.5, 13, 8], 'z', -45)),
        B('edge', [8.75, 12.7, 7.15], [12.75, 12.95, 8.85], '#light', r2([8.75, 13.5, 8], 'z', -22.5)),
        B('collar', [7, 7.6, 7.3], [9, 8.5, 8.7], '#light', r2([8, 8, 8], 'z', 22.5)),
      ],
    };
  },
  the_colt(c) {
    return {
      textures: { body: '#body', light: '#light', dark: '#dark', particle: '#dark' },
      elements: [
        B('barrel', [5.5, 8.75, 7.4], [13.5, 9.75, 8.6], '#dark'),
        B('sight', [12.75, 9.75, 7.7], [13.5, 10.25, 8.3], '#light'),
        B('cylinder', [7, 8, 7], [10, 10.5, 9], '#body'),
        B('frame', [4.75, 8, 7.5], [7.25, 10, 8.5], '#dark'),
        B('hammer', [5, 10, 7.6], [6.25, 11.25, 8.4], '#light'),
        B('grip', [8.75, 4.5, 7.3], [10.25, 8.25, 8.7], '#body', r2([9.5, 8.25, 8], 'z', -22.5)),
        B('guard', [7, 7, 7.6], [8.5, 8, 8.4], '#light'),
      ],
    };
  },
};

// ── Generate ──────────────────────────────────────────────────────────────
const IDS = Object.keys(BUILDERS);
for (const id of IDS) {
  const base = flatColor(id);
  const light = shade(base, 1.3, 24);
  const dark = shade(base, 0.72);
  const needsGlow = ['summoning_scroll', 'rasengan', 'chidori_blade', 'first_blade'].includes(id);
  const glow = id === 'rasengan' ? shade(base, 0.5, 130)
    : id === 'chidori_blade' ? [168, 236, 255]
    : id === 'first_blade' ? [255, 64, 64]
    : [200, 40, 40];

  write(path.join('textures', 'block', `civfandom_${id}_body.png`), solidPNG(base));
  write(path.join('textures', 'block', `civfandom_${id}_light.png`), solidPNG(light));
  write(path.join('textures', 'block', `civfandom_${id}_dark.png`), solidPNG(dark));
  if (needsGlow) write(path.join('textures', 'block', `civfandom_${id}_glow.png`), solidPNG(glow, 200));

  const built = BUILDERS[id](base);
  const textures = {};
  for (const [k, v] of Object.entries(built.textures)) {
    textures[k] = v.startsWith('#') ? `minecraft:block/civfandom_${id}_${v.slice(1)}` : v;
  }
  const m = { ...model(built.elements), textures };
  write(path.join('models', 'block', `civfandom_${id}.json`), JSON.stringify(m));
  console.log(`  + civfandom_${id} (${base.join(',')})`);
}
console.log(`Generated ${count} files for ${IDS.length} fandom items.`);
