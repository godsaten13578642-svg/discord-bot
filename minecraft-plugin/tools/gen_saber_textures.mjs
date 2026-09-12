// Generates the missing lightsaber blade/core textures (red, white, blue-core)
// as flat 16x16 fills matching the pack's solid-color style, then mirrors ALL
// lightsaber assets into civbridge-pack so the merged pack is complete.
// Pure Node PNG encoder, no dependencies. Run: node tools/gen_saber_textures.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RES = path.join(PLUGIN, 'src', 'main', 'resources');
const SABERS = path.join(RES, 'lightsabers', 'assets', 'custom_swords');
const MERGED = path.join(RES, 'civbridge-pack', 'assets', 'custom_swords');
const TEX = path.join('textures', 'item');

// ── PNG decode (8-bit, RGB/RGBA, all filters) ───────────────────────────────
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

// ── PNG encode (RGBA, filter 0) ─────────────────────────────────────────────
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
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Flat-color texture writer (matches the pack's solid-fill style) ─────────
// The pack's blade/core textures are solid 16x16 color fills, so generated
// ones follow the same convention. Colors derived from the existing files:
//   blade blue (95,97,252) -> red = channels swapped (252,97,95)
//   core blue (55,0,255)   -> red = channels swapped (255,0,55)
function flatPNG(r, g, b, a = 255) {
  return encodePNG(16, 16, Buffer.alloc(16 * 16 * 4, 0).map((_, i) =>
    i % 4 === 0 ? r : i % 4 === 1 ? g : i % 4 === 2 ? b : a));
}
const FLAT = {
  'anakin_red.png':          flatPNG(252, 97, 95),   // red blade
  'anakin_red_inside.png':   flatPNG(255, 0, 55),    // red core
  'anakin_white.png':        flatPNG(240, 244, 248), // white blade
  'anakin_white_inside.png': flatPNG(245, 252, 255), // white core
  'anakin_blue_inside.png':  flatPNG(55, 0, 255),    // blue core (matches anakin_inside.png)
};

function writeIfMissing(file, buf, label) {
  if (fs.existsSync(file)) { console.log(`  = ${label} (already exists)`); return; }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  console.log(`  + ${label} (${buf.length} B)`);
}

// ── Generate the missing textures ───────────────────────────────────────────
console.log('Generating missing saber textures:');
for (const [name, png] of Object.entries(FLAT)) {
  writeIfMissing(path.join(SABERS, TEX, name), png, `lightsabers/${name}`);
}

// ── Mirror every lightsaber asset into civbridge-pack ───────────────────────
console.log('Mirroring lightsaber assets into civbridge-pack:');
function mirrorDir(from, to) {
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const f = path.join(from, entry.name), t = path.join(to, entry.name);
    if (entry.isDirectory()) mirrorDir(f, t);
    else writeIfMissing(t, fs.readFileSync(f), path.relative(RES, t));
  }
}
mirrorDir(SABERS, MERGED);
for (const rel of [
  'assets/minecraft/items/netherite_sword.json',
  'assets/minecraft/models/item/netherite_sword.json',
]) {
  const src = path.join(RES, 'lightsabers', rel);
  const dst = path.join(RES, 'civbridge-pack', rel);
  if (fs.existsSync(src)) writeIfMissing(dst, fs.readFileSync(src), `civbridge-pack/${rel}`);
}
console.log('Done.');
