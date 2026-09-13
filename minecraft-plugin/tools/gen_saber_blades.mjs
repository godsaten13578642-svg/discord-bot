// Generates real 3D blades for the five non-blue lightsabers by cloning the
// proven Blockbench example (light_sabor_blue_item) and hue-rotating its three
// energy textures per saber color:
//   anakin_green  -> green blade   (hue -120°)
//   anakin_purple -> purple blade  (hue +45°)
//   anakin_red    -> red blade     (hue +120°)
//   anakin_white  -> white blade   (desaturated)
//   anakin_dark   -> near-black blade (desaturated + darkened)
// Blue keeps the original example model/textures untouched.
//
// Outputs into src/main/resources/civbridge-pack/assets/minecraft/:
//   models/block/civblade_<color>.json       (full hilt+blade, from light_sabor_blue_item.json)
//   models/block/civblade_<color>_core.json  (blade-only,  from light_sabor_blue_item__part0.json)
//   textures/block/civblade_<color>_{deep,core,aura}.png
//
// Pure Node (PNG decode incl. all filters + encode), no dependencies.
// Run: node tools/gen_saber_blades.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MC = path.join(PLUGIN, 'src', 'main', 'resources', 'civbridge-pack', 'assets', 'minecraft');

// ── PNG decode (8-bit, RGB/RGBA, all filters) ─────────────────────────────
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

// ── Hue transforms (RGB <-> HSV) ──────────────────────────────────────────
function rgb2hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}
function hsv2rgb(h, s, v) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
function transformPNG(buf, { hueShift = 0, sat = 1, val = 1 } = {}) {
  const img = decodePNG(buf);
  const out = Buffer.alloc(img.width * img.height * 4);
  for (let p = 0; p < img.width * img.height; p++) {
    const r = img.data[p * img.bpp], g = img.data[p * img.bpp + 1], b = img.data[p * img.bpp + 2];
    const a = img.bpp === 4 ? img.data[p * img.bpp + 3] : 255;
    const { h, s, v } = rgb2hsv(r, g, b);
    const [nr, ng, nb] = hsv2rgb((h + hueShift + 360) % 360, Math.max(0, Math.min(1, s * sat)), Math.max(0, Math.min(1, v * val)));
    out[p * 4] = nr; out[p * 4 + 1] = ng; out[p * 4 + 2] = nb; out[p * 4 + 3] = a;
  }
  return encodePNG(img.width, img.height, out);
}

// ── Per-color definitions ─────────────────────────────────────────────────
const COLORS = {
  green:  { hueShift: -120, sat: 1.0, val: 1.0 },  // blue 237° -> green ~117°
  purple: { hueShift: 45,   sat: 1.0, val: 1.0 },  // blue 237° -> violet ~282°
  red:    { hueShift: 120,  sat: 1.0, val: 1.0 },  // blue 237° -> red ~357°
  white:  { hueShift: 0,    sat: 0.0, val: 1.05 }, // desaturate (val clamped <=1 inside transform)
  dark:   { hueShift: 280,  sat: 0.35, val: 0.38 },// near-black steel blade
};

const SRC_FULL = path.join(MC, 'models', 'block', 'light_sabor_blue_item.json');
const SRC_CORE = path.join(MC, 'models', 'block', 'light_sabor_blue_item__part0.json');
const TEX_MAP = {
  'minecraft:block/light_sabor_blue_item_deep_blue_energy': 'deep',
  'minecraft:block/light_sabor_blue_item_blue_energy_core': 'core',
  'minecraft:block/light_sabor_blue_item_blue_glass_aura': 'aura',
};
const TEX_FILES = {
  deep: 'light_sabor_blue_item_deep_blue_energy.png',
  core: 'light_sabor_blue_item_blue_energy_core.png',
  aura: 'light_sabor_blue_item_blue_glass_aura.png',
};

const fullModel = JSON.parse(fs.readFileSync(SRC_FULL, 'utf8'));
const coreModel = JSON.parse(fs.readFileSync(SRC_CORE, 'utf8'));

let count = 0;
for (const [color, fx] of Object.entries(COLORS)) {
  // 1) textures
  for (const [key, file] of Object.entries(TEX_FILES)) {
    const png = transformPNG(fs.readFileSync(path.join(MC, 'textures', 'block', file)), fx);
    const out = path.join(MC, 'textures', 'block', `civblade_${color}_${key}.png`);
    fs.writeFileSync(out, png);
    count++;
    console.log(`  + textures/block/civblade_${color}_${key}.png`);
  }
  // 2) models (full + core), texture refs swapped to this color
  for (const [src, suffix] of [[fullModel, ''], [coreModel, '_core']]) {
    const m = structuredClone(src);
    const textures = {};
    for (const [k, v] of Object.entries(m.textures)) {
      textures[k] = TEX_MAP[v] ? `minecraft:block/civblade_${color}_${TEX_MAP[v]}` : v;
    }
    m.textures = textures;
    const out = path.join(MC, 'models', 'block', `civblade_${color}${suffix}.json`);
    fs.writeFileSync(out, JSON.stringify(m));
    count++;
    console.log(`  + models/block/civblade_${color}${suffix}.json`);
  }
}
console.log(`Generated ${count} files for ${Object.keys(COLORS).length} saber colors.`);
