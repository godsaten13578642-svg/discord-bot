// ── ReactSMP lightsaber set ──────────────────────────────────────────────────
// Generates the ReactSMP item set into civbridge-pack, in the pack's own
// namespace and using both registration tracks the pack already ships:
//
//   reactsmp:saber_hilt      the unlit hilt — 3D model, dim crystal in the emitter
//   reactsmp:saber_<colour>  ignited blades: 6 colours, 3D model — a glowing
//                            blade box with a white-hot core box inside it
//   reactsmp:kyber_<colour>  kyber crystals: the same 6 colours, flat sprites
//                            (a gem is a gem — it reads fine without geometry)
//
//   colours: blue, green, violet, yellow, white (light side) and red (dark)
//
// The sabers are real 3D models, not flat sprites. Each one is built the same
// way the pack's existing sabers are: geometry in model units (16 = one block)
// with the pommel at y=-16, the emitter at y=0 and the blade reaching y=32, then
// scaled down by the display block. That frame is kept deliberately identical to
// the pack's anakin_* saber models, so the proven display transform below can be
// reused verbatim and every saber in the pack sits in the hand the same way.
//
// Textures are charts rather than pictures:
//   saber_hilt_light/_dark   a rolled-out barrel: x = around the hilt, y = along
//                            it (row 0 = the emitter). Each hilt box maps its
//                            side faces to the rows of its own band, so a stack
//                            of boxes reads as one machined barrel.
//   saber_blade_<colour>     a horizontal gradient: near-white core down the
//                            centre, the colour's lit tone either side of it and
//                            its deep tone at the edges. Each face of the blade
//                            box therefore reads as a lit tube. A separate
//                            inner "core" box would be *inside* the blade and
//                            never drawn at all — the glow has to be painted
//                            on, not modelled behind.
//   saber_ember              the dim crystal that sits in an unlit emitter.
//
// Base items (Minecraft picks a model per base item, so the set maps onto three
// vanilla items that the rest of the pack does not use):
//   stick          -> hilt        (as in Story/starwars.sk)
//   blaze_rod      -> blades      (as in Story/starwars.sk)
//   amethyst_shard -> crystals    (replaces the six different vanilla items)
//
// Registration, matching how the rest of the pack does it:
//   1.21.4+ clients  assets/minecraft/items/<base>.json      — string
//                    custom_model_data via a minecraft:select case
//   ≤1.21.3 clients  assets/minecraft/models/item/<base>.json — integer
//                    custom_model_data overrides
// Both are rewritten on every run for the ids this script owns, and every
// other case/override in those files is left exactly as it was.
//
// Run: node tools/gen_reactsmp_items.mjs            (idempotent, deterministic)
//      node tools/gen_reactsmp_items.mjs --preview  (ASCII charts + model summary)
//      node tools/gen_reactsmp_items.mjs --html out.html
//                                                   (one-file contact sheet: 3D
//                                                    models rendered with a tiny
//                                                    software rasteriser, so you
//                                                    can look at them offline)
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACK = path.join(ROOT, 'src', 'main', 'resources', 'civbridge-pack');
const ASSETS = path.join(PACK, 'assets');
const NS = 'reactsmp';                 // every model/texture/id of this set
const S = 32;                          // texture size (charts and sprites)
const PREVIEW = process.argv.includes('--preview');

/* ── PNG encoder (8-bit RGBA, no interlace) ─────────────────────────────── */
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

/* ── Canvas + primitives ────────────────────────────────────────────────── */
const canvas = () => ({ px: new Uint8Array(S * S * 4) });
const inb = (x, y) => x >= 0 && y >= 0 && x < S && y < S;

function setPx(img, x, y, c, a = 255) {
  if (!inb(x, y)) return;
  const i = (y * S + x) * 4;
  img.px[i] = c[0] | 0; img.px[i + 1] = c[1] | 0; img.px[i + 2] = c[2] | 0; img.px[i + 3] = a | 0;
}
// Straight-alpha composite — glows and soft edges need this.
function over(img, x, y, c, a = 255) {
  if (!inb(x, y) || a <= 0) return;
  const i = (y * S + x) * 4;
  const sa = Math.min(1, a / 255);
  const da = img.px[i + 3] / 255;
  const oa = sa + da * (1 - sa);
  if (oa <= 0) { img.px[i] = img.px[i + 1] = img.px[i + 2] = img.px[i + 3] = 0; return; }
  for (let k = 0; k < 3; k++) img.px[i + k] = Math.round((c[k] * sa + img.px[i + k] * da * (1 - sa)) / oa);
  img.px[i + 3] = Math.round(oa * 255);
}
function rect(img, x0, y0, x1, y1, c, a = 255) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) over(img, x, y, c, a);
}

/* ── Colour helpers ─────────────────────────────────────────────────────── */
const hex = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
const byte = v => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
const mix = (a, b, t) => { t = clamp(t); return [byte(a[0] + (b[0] - a[0]) * t), byte(a[1] + (b[1] - a[1]) * t), byte(a[2] + (b[2] - a[2]) * t)]; };
const mul = (c, k) => [byte(c[0] * k), byte(c[1] * k), byte(c[2] * k)];
const WHITE = [255, 255, 255];

/* ── Geometry: point → segment (still used by the crystal sprite) ───────── */
function seg(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const len2 = vx * vx + vy * vy || 1;
  const t = clamp(((px - ax) * vx + (py - ay) * vy) / len2);
  const dx = px - (ax + vx * t), dy = py - (ay + vy * t);
  return { t, d: Math.hypot(dx, dy), s: (vx * dy - vy * dx) / Math.sqrt(len2) };
}
function band(img, ax, ay, bx, by, radius, fn) {
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - radius));
  const x1 = Math.min(S - 1, Math.ceil(Math.max(ax, bx) + radius));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - radius));
  const y1 = Math.min(S - 1, Math.ceil(Math.max(ay, by) + radius));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const p = seg(x + 0.5, y + 0.5, ax, ay, bx, by);
      if (p.d > radius) continue;
      const c = fn(p.t, p.d, p.s);
      if (c && c[3] > 0) over(img, x, y, c, c[3]);
    }
  }
}
// Cylinder shading across a tube, lit from one side. uu is the position across
// the barrel (-1 … 1).
function tube(uu) {
  return clamp(0.46 + 0.72 * Math.max(0, 1 - Math.abs(uu + 0.45)), 0.42, 1.22);
}
// Four-point sparkle, the same mark the orbs and the logo use.
function spark4(img, x, y, col, size = 1) {
  setPx(img, x, y, mix(col, WHITE, 0.6));
  for (let i = 1; i <= size; i++) {
    over(img, x + i, y, col, 255 - (i - 1) * 90);
    over(img, x - i, y, col, 255 - (i - 1) * 90);
    over(img, x, y + i, col, 255 - (i - 1) * 90);
    over(img, x, y - i, col, 255 - (i - 1) * 90);
  }
}

/* ── Palettes ───────────────────────────────────────────────────────────── */
// The blade colours Story/starwars.sk exposes; `dark` is the red side.
const COLORS = [
  { id: 'blue', hue: '#1E3FD0', lit: '#6D8CFF', core: '#EAF1FF' },
  { id: 'green', hue: '#127A38', lit: '#57DE8A', core: '#EBFFF2' },
  { id: 'violet', hue: '#6B1FD0', lit: '#B478FF', core: '#F6EBFF' },
  { id: 'yellow', hue: '#B08408', lit: '#FFD84A', core: '#FFFBE3' },
  { id: 'white', hue: '#AEB8C4', lit: '#FFFFFF', core: '#FFFFFF' },
  { id: 'red', hue: '#8E0F14', lit: '#FF4B3A', core: '#FFE9E2', dark: true },
];
// Two hilt finishes — chrome for the light side, gunmetal for the dark side.
const HILTS = {
  light: { body: '#C9CFD8', dark: '#7A828E', deep: '#3A4048', grip: '#2E333C', stud: '#5FC8FF' },
  dark: { body: '#565660', dark: '#33333B', deep: '#17171B', grip: '#191920', stud: '#FF4B3A' },
};

/* ── The hilt: one banded barrel ────────────────────────────────────────── */
// t runs along the hilt (0 = pommel, 1 = emitter) and becomes a y coordinate in
// the model: y = -16 + 16t. The radii are the same numbers the sprite version
// used, only scaled into model units. Every band gets its own box, so the
// silhouette steps the way a machined hilt does.
const Y_OF = t => -16 + 16 * t;
const PX2U = 0.58;                     // hilt radius in texture pixels → model units
const HILT_SEGMENTS = [
  { id: 'pommel', t0: 0.00, t1: 0.10, r: 2.9 },
  { id: 'ring', t0: 0.10, t1: 0.20, r: 3.0 },
  { id: 'neck', t0: 0.20, t1: 0.30, r: 2.3 },
  { id: 'grip', t0: 0.30, t1: 0.60, r: 2.6 },
  { id: 'box', t0: 0.60, t1: 0.72, r: 3.1 },
  { id: 'shroud', t0: 0.72, t1: 0.86, r: 2.7 },
  { id: 'emit', t0: 0.86, t1: 1.00, r: 3.0 },
];
const hiltBand = t => HILT_SEGMENTS.find(s => t >= s.t0 && t < s.t1) || HILT_SEGMENTS[HILT_SEGMENTS.length - 1];

/* ── Hilt texture chart ─────────────────────────────────────────────────── */
// Rolled-out barrel: x = around the hilt, y = along it, row 0 = the emitter
// (which is how a model's v axis runs — v grows downwards). One chart therefore
// covers the whole hilt; the model points each box at its own rows.
function hiltColour(pal, t, uu) {
  const b = tube(uu);
  const id = hiltBand(t).id;
  let base;
  if (id === 'pommel') base = hex(pal.body);
  else if (id === 'ring') base = hex(pal.dark);
  else if (id === 'neck') base = hex(pal.deep);
  else if (id === 'grip') {
    base = hex(pal.grip);
    const rib = ((t - 0.30) / 0.06) % 1 < 0.30;              // bands of ribbing
    if (rib) base = mul(base, 0.60);
    else if (uu > -0.25 && uu < 0.35) base = mix(base, hex(pal.dark), 0.45);
  } else if (id === 'box') base = hex(pal.body);
  else if (id === 'shroud') {
    base = hex(pal.deep);
    const vent = ((t - 0.72) / 0.045) % 1 < 0.34;
    if (!vent) base = mix(hex(pal.dark), hex(pal.deep), 0.5);
  } else base = hex(pal.body);                                // emitter
  let c = mul(base, b);
  if (b > 1.12) c = mix(c, WHITE, clamp((b - 1.12) * 2.2));   // metal highlight
  // the activation stud, on one flank of the box
  if (t >= 0.62 && t <= 0.70 && uu > -0.75 && uu < 0.05) {
    c = t < 0.66 ? hex(pal.stud) : mix(hex(pal.stud), hex(pal.deep), 0.55);
    if (b > 1.05) c = mix(c, WHITE, 0.4);
  }
  return c;
}
function hiltChart(pal) {
  const img = canvas();
  for (let r = 0; r < S; r++) {
    const t = 1 - (r + 0.5) / S;
    for (let c = 0; c < S; c++) setPx(img, c, r, hiltColour(pal, t, ((c + 0.5) / S) * 2 - 1));
  }
  return img;
}

/* ── Blade / ember charts ───────────────────────────────────────────────── */
// Horizontal gradient across the blade: white-hot core in the middle, the
// colour's lit tone just off-centre, its deep tone at the edges. The blade box
// shows this on each of its four faces, so the blade reads as a lit tube. The
// edges stay close to the lit tone so the seams between faces do not read as
// dark stripes down the blade.
function bladeChart(hue, lit, core) {
  const img = canvas();
  for (let c = 0; c < S; c++) {
    const k = Math.abs(((c + 0.5) / S) * 2 - 1);            // 0 centre … 1 edge
    let col;
    if (k < 0.20) col = mix(core, WHITE, 0.55 - k * 2);      // the hot core
    else if (k < 0.55) col = mix(mix(core, lit, 0.5), lit, (k - 0.20) / 0.35);
    else col = mix(lit, mix(hue, lit, 0.22), Math.pow((k - 0.55) / 0.45, 0.8));
    for (let r = 0; r < S; r++) setPx(img, c, r, mul(col, 1 - 0.04 * (r / S)));
  }
  return img;
}
function emberChart() {
  const img = canvas();
  for (let r = 0; r < S; r++) {
    for (let c = 0; c < S; c++) {
      const d = Math.hypot(((c + 0.5) / S) * 2 - 1, ((r + 0.5) / S) * 2 - 1);
      setPx(img, c, r, mix(hex('#12324A'), hex('#C6E9FF'), Math.pow(clamp(1 - d / 1.15), 1.5)));
    }
  }
  return img;
}

/* ── Model elements ─────────────────────────────────────────────────────── */
// Side faces of a hilt band: the full chart width (the wrap) by the rows of the
// band. Tops and bottoms take a narrow slice at the same height, which is what
// keeps a stack of separate boxes looking like one continuous barrel.
function bandFaces(t0, t1, texture = '#hilt', u = [0, S]) {
  const v1 = (1 - t1) * S, v2 = (1 - t0) * S;
  const side = () => ({ uv: [u[0], v1, u[1], v2], texture });
  return {
    north: side(), east: side(), south: side(), west: side(),
    up: { uv: [12, v1, 20, Math.min(S - 0.01, v1 + 2)], texture },
    down: { uv: [12, Math.max(0, v2 - 2), 20, v2], texture },
  };
}
// All six faces of a box pointed at one UV rect (used for the crystal nub).
function flatFaces(uv, texture) {
  const f = () => ({ uv: [...uv], texture });
  return { north: f(), east: f(), south: f(), west: f(), up: f(), down: f() };
}
const box = (from, to, faces, shade) => (shade === undefined ? { from, to, faces } : { from, to, faces, shade });

function hiltElements() {
  const els = [];
  for (const s of HILT_SEGMENTS) {
    const r = s.r * PX2U;
    els.push(box([8 - r, Y_OF(s.t0), 8 - r], [8 + r, Y_OF(s.t1), 8 + r], bandFaces(s.t0, s.t1)));
  }
  const r = id => HILT_SEGMENTS.find(s => s.id === id).r * PX2U;
  // two raised rings on the grip, so it does not read as one smooth tube
  for (const t of [0.36, 0.46]) {
    els.push(box([8 - r('grip') - 0.08, Y_OF(t), 8 - r('grip') - 0.08],
      [8 + r('grip') + 0.08, Y_OF(t + 0.02), 8 + r('grip') + 0.08], bandFaces(t, t + 0.02)));
  }
  // activation stud on the +Z flank of the box (its own chart patch)
  els.push(box([7.1, Y_OF(0.63), 8 + r('box') - 0.02], [8.9, Y_OF(0.69), 8 + r('box') + 0.3],
    bandFaces(0.63, 0.69, '#hilt', [4, 17])));
  // a fin down each side of the shroud
  for (const sx of [-1, 1]) {
    const x0 = 8 + sx * r('shroud'), x1 = 8 + sx * (r('shroud') + 0.34);
    els.push(box([Math.min(x0, x1), Y_OF(0.75), 7.3], [Math.max(x0, x1), Y_OF(0.83), 8.7],
      bandFaces(0.75, 0.83)));
  }
  // emitter lip, textured from the dark neck rows so the aperture reads dark
  els.push(box([7.25, Y_OF(0.985), 7.25], [8.75, Y_OF(1.02), 8.75], bandFaces(0.22, 0.28)));
  return els;
}
function bladeElements() {
  // One box, glow painted by the gradient. A second, brighter box would sit
  // inside this one and never be drawn (the outer faces occlude it), so the
  // white-hot core lives in the texture instead.
  return [box([6.7, 0.1, 6.7], [9.3, 32, 9.3], bandFaces(0, 1, '#blade'), false)];
}
function nubElement() {
  // Unlit hilt: the crystal still sits in the emitter, just dim. Kept narrow and
  // short so it reads as a gem peeking out of the barrel, not a second block.
  return [box([7.45, 0.15, 7.45], [8.55, 1.5, 8.55], flatFaces([8, 8, 24, 24], '#nub'), false)];
}

// Display transforms copied from the pack's existing saber model (anakin_*), so
// every lightsaber in the pack sits in the hand identically.
const DISPLAY = {
  thirdperson_righthand: { rotation: [0, -90, 0], translation: [0, 12, 1.25], scale: [0.75, 0.75, 0.75] },
  thirdperson_lefthand: { rotation: [0, -90, 0], translation: [0, 12, 1.25], scale: [0.75, 0.75, 0.75] },
  firstperson_righthand: { rotation: [0, 45, 0], translation: [0, 7.25, 1.25], scale: [0.5, 0.5, 0.5] },
  firstperson_lefthand: { rotation: [0, 45, 0], translation: [0, 7.25, 1.25], scale: [0.5, 0.5, 0.5] },
  ground: { rotation: [45, 0, 0], translation: [0, 7, 0], scale: [0.5, 0.5, 0.5] },
  gui: { rotation: [30, -135, 68], scale: [0.5, 0.5, 0.5] },
  head: { rotation: [0, -180, 0], translation: [0, 13, 8] },
  fixed: { translation: [0, 24, -4], scale: [1.5, 1.5, 1.5] },
};

function saberModel({ hilt, colour, ignited }) {
  const hiltTex = `${NS}:item/saber_hilt_${hilt}`;
  const textures = { hilt: hiltTex, particle: hiltTex };
  if (ignited) textures.blade = `${NS}:item/saber_blade_${colour}`;
  else textures.nub = `${NS}:item/saber_ember`;
  return {
    credit: 'Generated by tools/gen_reactsmp_items.mjs — ReactSMP lightsaber set',
    texture_size: [S, S],
    textures,
    elements: [...hiltElements(), ...(ignited ? bladeElements() : nubElement())],
    gui_light: 'front',
    display: DISPLAY,
  };
}

/* ── Kyber crystal sprite ───────────────────────────────────────────────── */
// A faceted hexagonal gem: point at the top, straight prism through the middle,
// point at the bottom. Left facets catch the light, the centre column is the
// glow, the right facets fall away.
const CX = 16.0;
const CY_TOP = 3.2, CY_MID1 = 10.6, CY_MID2 = 21.4, CY_BOT = 28.6, CY_HALF = 7.3;

function crystalHalf(y) {
  if (y < CY_TOP || y > CY_BOT) return 0;
  if (y < CY_MID1) return 1.1 + (CY_HALF - 1.1) * Math.pow((y - CY_TOP) / (CY_MID1 - CY_TOP), 0.8);
  if (y <= CY_MID2) return CY_HALF * (1 - 0.07 * Math.abs((y - (CY_MID1 + CY_MID2) / 2) / ((CY_MID2 - CY_MID1) / 2)));
  return 1.1 + (CY_HALF - 1.1) * Math.pow((CY_BOT - y) / (CY_BOT - CY_MID2), 0.8);
}

function drawCrystal(col) {
  const img = canvas();
  const hue = hex(col.hue), lit = hex(col.lit), core = hex(col.core);
  const bad = !!col.dark;

  // Aura: the gem is lit from within. Distance is measured out from the gem's
  // own silhouette (horizontal overshoot past that row's half-width, plus any
  // overshoot above the top point / below the bottom point), so the halo hugs
  // the facets instead of smearing past the tips.
  const HALO = 4.0;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const py = y + 0.5, px = x + 0.5;
      const ox = Math.max(0, Math.abs(px - CX) - crystalHalf(py));
      const oy = Math.max(0, CY_TOP - py, py - CY_BOT);
      const d = Math.hypot(ox, oy);
      if (d > 0 && d < HALO) over(img, x, y, lit, Math.round(80 * (1 - d / HALO)));
    }
  }

  for (let y = Math.floor(CY_TOP); y <= Math.ceil(CY_BOT); y++) {
    const hw = crystalHalf(y + 0.5);
    if (hw <= 0) continue;
    for (let x = 0; x < S; x++) {
      const px = x + 0.5;
      if (Math.abs(px - CX) > hw) continue;
      const u = (px - CX) / hw;                        // -1 left … +1 right
      let c;
      if (u < -0.38) c = mix(hue, lit, bad ? 0.30 : 0.44);                          // lit facet
      else if (u <= 0.38) c = mix(lit, core, clamp(1 - Math.abs(u) / 0.38) * 0.75);  // glowing centre
      else c = bad ? mul(hue, 0.62) : mix(hue, WHITE, 0.06);                        // shadowed facet
      if (Math.abs(Math.abs(u) - 0.40) < 0.06) c = mul(c, 0.78);                     // facet seam
      c = mul(c, 0.86 + 0.30 * clamp((CY_MID1 - y) / 9));                            // brighter near the top
      if (y > CY_MID2) c = mul(c, 0.94);
      c = mul(c, Math.abs(u) > 0.90 ? 0.72 : 1);
      setPx(img, x, y, c);
    }
  }
  // Facet highlight streak, bright tip, and a sparkle on the lit side.
  band(img, CX - 4.2, CY_MID2 - 1.5, CX - 1.6, CY_TOP + 3.0, 1.2, (t, d) => {
    if (d > 1.2) return null;
    return [...mix(core, WHITE, 0.5), Math.round(210 * (1 - d / 1.2) * (0.35 + 0.65 * t))];
  });
  setPx(img, Math.round(CX), Math.round(CY_TOP) + 2, mix(core, WHITE, 0.75));
  setPx(img, Math.round(CX), Math.round(CY_TOP) + 1, mix(lit, WHITE, 0.65), 220);
  spark4(img, 21, 12, mix(lit, WHITE, 0.25), 1);
  return img;
}

/* ── ASCII preview (--preview) ──────────────────────────────────────────── */
function asciiPreview(img, label) {
  const ramp = ' .:-=+*#%@';
  console.log(label);
  for (let y = 0; y < S; y++) {
    let row = '';
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const a = img.px[i + 3];
      if (!a) { row += ' '; continue; }
      const lum = (img.px[i] * 0.299 + img.px[i + 1] * 0.587 + img.px[i + 2] * 0.114) / 255;
      row += ramp[clamp(Math.round(lum * (a / 255) * 9), 1, 9)];
    }
    console.log('  |' + row + '|');
  }
}
// Text summary of a model: element count, bounds and the texture keys it uses.
// Enough to catch "the blade is inside the hilt" without opening the game.
function describeModel(id, model) {
  const mins = [Infinity, Infinity, Infinity], maxs = [-Infinity, -Infinity, -Infinity];
  for (const el of model.elements) {
    for (let i = 0; i < 3; i++) {
      mins[i] = Math.min(mins[i], el.from[i]);
      maxs[i] = Math.max(maxs[i], el.to[i]);
    }
  }
  const size = maxs.map((v, i) => +(v - mins[i]).toFixed(2));
  console.log(`  ${id}: ${model.elements.length} elements, size ${size.join(' × ')}, ` +
    `y ${mins[1].toFixed(1)} … ${maxs[1].toFixed(1)}, textures [${Object.keys(model.textures).join(', ')}]`);
}

/* ── Write assets ───────────────────────────────────────────────────────── */
const BASE = {
  hilt: { item: 'stick', parent: 'minecraft:item/handheld', fallback: 'minecraft:item/stick', int: 4101 },
  blade: { item: 'blaze_rod', parent: 'minecraft:item/handheld', fallback: 'minecraft:item/blaze_rod', int: 4201 },
  crystal: { item: 'amethyst_shard', parent: 'minecraft:item/generated', fallback: 'minecraft:item/amethyst_shard', int: 4301 },
};

const written = { hilt: [], blade: [], crystal: [] };
const textures = new Map();            // name -> canvas (for the contact sheet)
const gallery = [];                    // { id, family, kind, ... } for --html

function writeTexture(name, img) {
  const file = path.join(ASSETS, NS, 'textures', 'item', `${name}.png`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encodePNG(S, S, img.px));
  textures.set(name, img);
  if (PREVIEW) asciiPreview(img, `${name}.png  (chart)`);
  return `${NS}:item/${name}`;
}
function writeModelFile(id, model) {
  const file = path.join(ASSETS, NS, 'models', 'item', `${id}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(model, null, 2) + '\n');
  return model;
}
function register(family, id) {
  const n = written[family].length;
  written[family].push({
    when: `${NS}:${id}`,
    model: { type: 'minecraft:model', model: `${NS}:item/${id}` },
    integer: BASE[family].int + n,
    legacyModel: `${NS}:item/${id}`,
  });
}

// 3D saber: model file + registration. Ids are unchanged from the sprite
// version, so nothing on the Skript side has to move.
function writeSaber(id, family, opts) {
  const model = writeModelFile(id, saberModel(opts));
  register(family, id);
  gallery.push({ id, family, kind: 'model', model });
  console.log(`  ${id}: ${opts.ignited ? 'ignited blade' : 'unlit hilt'} — ${model.elements.length} boxes`);
  if (PREVIEW) asciiModel(id, model);
}

// 2D sprite (crystals): texture + a two-line generated-item model.
function writeSprite(family, id, img) {
  writeTexture(id, img);
  const file = path.join(ASSETS, NS, 'models', 'item', `${id}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ parent: BASE[family].parent, textures: { layer0: `${NS}:item/${id}` } }, null, 2) + '\n');
  register(family, id);
  gallery.push({ id, family, kind: 'sprite' });
  console.log(`  ${id}: sprite`);
}

/* ── Isometric renderer (used by --html) ────────────────────────────────── */
// Renders a model the way a player sees it, so the geometry can be checked
// without launching Minecraft. Runs here in Node rather than in the browser:
// the sheet then needs no JavaScript at all, and the images are deterministic.
const ISO_COS = Math.cos(Math.PI / 6), ISO_SIN = Math.sin(Math.PI / 6);
const project = ([x, y, z]) => [(x - z) * ISO_COS, (x + z) * ISO_SIN - y];
const FACE_LIGHT = { north: 0.86, south: 0.98, east: 1.02, west: 0.80, up: 1.10, down: 0.66 };

// [top-left, top-right, bottom-right, bottom-left] with v running downwards,
// which is the order the UV rectangle is sampled in below.
function faceCorners(el, face) {
  const [x0, y0, z0] = el.from, [x1, y1, z1] = el.to;
  switch (face) {
    case 'north': return [[x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [x0, y0, z0]];
    case 'south': return [[x1, y1, z1], [x0, y1, z1], [x0, y0, z1], [x1, y0, z1]];
    case 'east': return [[x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [x1, y0, z0]];
    case 'west': return [[x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [x0, y0, z1]];
    case 'up': return [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]];
    default: return [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]];
  }
}
const texKeyOf = (model, ref) => String(ref).replace('#', '');

// Average colour of a UV rectangle of a chart (clamped, transparent px ignored).
function sampleChart(name, u1, v1, u2, v2) {
  const img = textures.get(name);
  if (!img) return [255, 0, 255];
  const x0 = clamp(Math.floor(u1), 0, S - 1), x1 = clamp(Math.ceil(u2) - 1, 0, S - 1);
  const y0 = clamp(Math.floor(v1), 0, S - 1), y1 = clamp(Math.ceil(v2) - 1, 0, S - 1);
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * S + x) * 4;
      if (img.px[i + 3] < 16) continue;
      r += img.px[i]; g += img.px[i + 1]; b += img.px[i + 2]; n++;
    }
  }
  return n ? [r / n, g / n, b / n] : [0, 0, 0];
}

// Every face of every box, subdivided so a gradient across a face is visible,
// then sorted far-to-near for the painter's algorithm.
function modelQuads(model, N = 4) {
  const quads = [];
  for (const el of model.elements) {
    for (const [face, light] of Object.entries(FACE_LIGHT)) {
      const f = el.faces && el.faces[face];
      if (!f) continue;
      const name = texKeyOf(model, f.texture);
      const [u1, v1, u2, v2] = f.uv;
      const [tl, tr, br, bl] = faceCorners(el, face);
      const lit = el.shade === false ? 1 : light;
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          const s0 = i / N, s1 = (i + 1) / N, t0 = j / N, t1 = (j + 1) / N;
          const at = (s, t) => {
            const top = tl.map((v, k) => v + (tr[k] - v) * s);
            const bot = bl.map((v, k) => v + (br[k] - v) * s);
            return top.map((v, k) => v + (bot[k] - v) * t);
          };
          const p = [at(s0, t0), at(s1, t0), at(s1, t1), at(s0, t1)];
          const col = sampleChart(name, u1 + (u2 - u1) * s0, v1 + (v2 - v1) * t0,
            u1 + (u2 - u1) * s1, v1 + (v2 - v1) * t1).map(c => clamp(c * lit, 0, 255));
          quads.push({ p, col, depth: p.reduce((a, q) => a + q[0] + q[1] + q[2], 0) / 4 });
        }
      }
    }
  }
  return quads.sort((a, b) => a.depth - b.depth);
}

function fillQuad(buf, W, H, pts, col) {
  // Grow the quad a hair so neighbouring sub-quads do not leave hairline seams.
  const cx = pts.reduce((a, p) => a + p[0], 0) / 4, cy = pts.reduce((a, p) => a + p[1], 0) / 4;
  const grown = pts.map(([x, y]) => [cx + (x - cx) * 1.02, cy + (y - cy) * 1.02]);
  const ys = grown.map(p => p[1]);
  const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(H - 1, Math.ceil(Math.max(...ys)));
  for (let y = y0; y <= y1; y++) {
    const xs = [];
    for (let i = 0; i < 4; i++) {
      const a = grown[i], b = grown[(i + 1) % 4];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k])), xb = Math.min(W - 1, Math.floor(xs[k + 1]));
      for (let x = xa; x <= xb; x++) {
        const i = (y * W + x) * 4;
        buf[i] = col[0] | 0; buf[i + 1] = col[1] | 0; buf[i + 2] = col[2] | 0; buf[i + 3] = 255;
      }
    }
  }
}

function renderModelIso(model, W = 300, H = 380, bg = [21, 23, 29]) {
  const quads = modelQuads(model);
  const pts = quads.flatMap(q => q.p.map(project));
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad = 16;
  const scale = Math.min((W - pad * 2) / (maxX - minX || 1), (H - pad * 2) / (maxY - minY || 1));
  const toScreen = p => {
    const s = project(p);
    return [pad + (s[0] - minX) * scale, pad + (s[1] - minY) * scale];
  };
  const px = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    px[i * 4] = bg[0]; px[i * 4 + 1] = bg[1]; px[i * 4 + 2] = bg[2]; px[i * 4 + 3] = 255;
  }
  for (const q of quads) fillQuad(px, W, H, q.p.map(toScreen), q.col);
  return { px, w: W, h: H };
}
function encodeCanvas(img) {
  // The PNG encoder takes a flat RGBA array; the renderer's canvas is w×h.
  const out = Buffer.alloc(img.w * img.h * 4);
  Buffer.from(img.px.buffer, img.px.byteOffset, img.px.length).copy(out);
  return encodePNG(img.w, img.h, out);
}

// Terminal view of the same isometric render, drawn as text — so the geometry can
// be eyeballed from a plain `--preview` run, with no browser involved.
const ISO_BG = [20, 22, 28];
function asciiModel(id, model) {
  const W = 44, H = 54;
  const img = renderModelIso(model, W, H, ISO_BG);
  const ramp = ' .:-=+*#%@';
  console.log(`  ${id} — isometric view`);
  for (let y = 0; y < H; y++) {
    let row = '';
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (img.px[i] === ISO_BG[0] && img.px[i + 1] === ISO_BG[1] && img.px[i + 2] === ISO_BG[2]) {
        row += ' ';
        continue;
      }
      const lum = (img.px[i] * 0.299 + img.px[i + 1] * 0.587 + img.px[i + 2] * 0.114) / 255;
      row += ramp[clamp(Math.round(lum * 9), 0, 9)];
    }
    console.log('  |' + row + '|');
  }
}

/* ── Contact sheet (--html <file>) ──────────────────────────────────────── */
// One self-contained HTML file — no JavaScript: each saber model is rasterised
// here, inlined as a PNG, and shown on a dark and a light panel next to its
// texture charts; the crystal sprites are shown at 8×. Everything is a data URI,
// so the file opens on its own anywhere.
function writePreviewHtml(file) {
  const dataUri = img => `data:image/png;base64,${encodePNG(S, S, img.px).toString('base64')}`;
  const texMap = {};
  for (const [name, img] of textures) texMap[name] = dataUri(img);
  const renders = {};
  for (const g of gallery) {
    if (g.kind !== 'model') continue;
    renders[g.id] = [
      `data:image/png;base64,${encodeCanvas(renderModelIso(g.model, 300, 400, [21, 23, 29])).toString('base64')}`,
      `data:image/png;base64,${encodeCanvas(renderModelIso(g.model, 300, 400, [201, 205, 214])).toString('base64')}`,
    ];
  }
  const sprites = gallery.filter(g => g.kind === 'sprite').map(g => [g.id, texMap[g.id]])
    .sort((a, b) => a[0].localeCompare(b[0]));
  const modelIds = gallery.filter(g => g.kind === 'model').map(g => g.id).sort();
  const chartIds = [...textures.keys()].sort();

  // Everything below is plain markup — the renders are already PNGs, so the page
  // needs no JavaScript and opens on its own anywhere.
  const modelCards = modelIds.map(id => `    <div class="card">
      <div class="views">
        <img class="v" src="${renders[id][0]}" alt="${id} (dark)">
        <img class="v" src="${renders[id][1]}" alt="${id} (light)">
      </div>
      <div class="meta"><span class="id">reactsmp:${id}</span><span class="kind">3D model</span></div>
    </div>`).join('\n');
  const spriteCards = sprites.map(([id, uri]) => `    <div class="card">
      <div class="views">
        <div class="pad dark"><img class="sp" src="${uri}" alt="${id}"></div>
        <div class="pad light"><img class="sp" src="${uri}" alt="${id}"></div>
      </div>
      <div class="meta"><span class="id">reactsmp:${id}</span><span class="kind">sprite</span></div>
    </div>`).join('\n');
  const chartCards = chartIds.map(name => `    <div class="card">
      <div class="charts"><img src="${texMap[name]}" alt="${name}"></div>
      <div class="meta"><span class="id">${name}</span><span class="kind">chart</span></div>
    </div>`).join('\n');

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>ReactSMP item set — model check</title>
<style>
  body { margin:0; padding:24px; background:#14161c; color:#e8e8ee;
         font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace; }
  h1 { font-size:16px; margin:0 0 4px; } h2 { font-size:13px; margin:28px 0 10px; color:#9fd0ff; }
  p.note { color:#9aa2b1; margin:0 0 18px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(608px,1fr)); gap:18px; }
  .grid.chartgrid { grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); }
  .card { border:1px solid #2b2f3a; border-radius:10px; overflow:hidden; background:#12141a; }
  .views { display:flex; }
  .views img.v { display:block; width:300px; height:400px; }
  .dark { background:#15171d; } .light { background:#c9cdd6; }
  .charts { display:flex; flex-wrap:wrap; gap:6px; padding:10px; background:#101218; border-top:1px solid #2b2f3a; }
  .charts img { image-rendering:pixelated; width:${S * 3}px; height:${S * 3}px; border:1px solid #242833; }
  .meta { padding:8px 12px; border-top:1px solid #2b2f3a; display:flex; justify-content:space-between; gap:8px; }
  .id { color:#8fd6ff; } .kind { color:#7d8595; }
  .pad { flex:1; display:flex; align-items:center; justify-content:center; padding:12px; }
  .pad img.sp { image-rendering:pixelated; width:180px; height:180px; }
</style></head><body>
  <h1>ReactSMP item set — 3D models + charts</h1>
  <p class="note">Models are rendered by a small isometric rasteriser (per-face texture sampling, painter's algorithm) and
  inlined here as PNGs — left on a dark panel, right on a light one. Charts are the raw ${S}×${S} textures at 3×.
  No JavaScript, so this file opens on its own anywhere.</p>
  <h2>3D sabers (${modelIds.length})</h2>
  <div class="grid">
${modelCards}
  </div>
  <h2>Crystal sprites (${sprites.length})</h2>
  <div class="grid">
${spriteCards}
  </div>
  <h2>Texture charts (${chartIds.length})</h2>
  <div class="grid chartgrid">
${chartCards}
  </div>
</body></html>
`;
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(path.resolve(file), html);
  console.log(`  wrote contact sheet: ${file}`);
}

/* ── Self-check ─────────────────────────────────────────────────────────── */
// The pack's validators confirm that a model's *textures* exist, but not that
// the faces inside it point at a key the model itself defines — and that is
// exactly how a hilt ends up rendering as the missing-texture pattern: the
// pack's own anakin_* sabers reference a "#3" their textures block never
// defines, on every hilt box. Models written here are checked before the run
// finishes, so the same mistake cannot come out of this generator.
function validateModels() {
  let boxes = 0, faces = 0;
  for (const g of gallery) {
    if (g.kind !== 'model') continue;
    const { model } = g;
    const keys = new Set(Object.keys(model.textures));
    const uvMax = model.texture_size[0];
    for (const el of model.elements) {
      boxes++;
      const seen = new Set();
      for (const [name, f] of Object.entries(el.faces || {})) {
        faces++; seen.add(name);
        const key = String(f.texture).replace('#', '');
        if (!keys.has(key)) throw new Error(`${g.id}: face ${name} uses '${f.texture}', which the model never defines`);
        const [u1, v1, u2, v2] = f.uv;
        if (u2 <= u1 || v2 <= v1) throw new Error(`${g.id}: face ${name} has a degenerate uv [${f.uv}]`);
        if ([u1, v1, u2, v2].some(v => v < 0 || v > uvMax)) throw new Error(`${g.id}: face ${name} uv [${f.uv}] outside the ${uvMax}px chart`);
      }
      if (seen.size !== 6) throw new Error(`${g.id}: an element only defines ${[...seen].join(', ')}`);
      for (const corner of ['from', 'to']) {
        if (el[corner].some(v => typeof v !== 'number' || !isFinite(v))) throw new Error(`${g.id}: bad ${corner} coordinates`);
      }
    }
  }
  console.log(`  ✓ self-check: ${boxes} boxes / ${faces} faces — every face points at a defined texture, inside the chart`);
}

/* ── Registration ───────────────────────────────────────────────────────── */
const itemDef = (cases, fallback) => ({
  model: {
    type: 'minecraft:select',
    property: 'minecraft:custom_model_data',
    index: 0,
    cases,
    fallback: { type: 'minecraft:model', model: fallback },
  },
});

// 1.21.4+: one selector per base item, keeping every case we do not own.
function mergeSelector(base, cases) {
  const file = path.join(ASSETS, 'minecraft', 'items', `${base.item}.json`);
  let def;
  if (fs.existsSync(file)) def = JSON.parse(fs.readFileSync(file, 'utf8'));
  else def = itemDef([], base.fallback);
  const kept = (def.model.cases || []).filter(c => !String(c.when).startsWith(`${NS}:`));
  def.model.cases = [...kept, ...cases.map(({ when, model }) => ({ when, model }))];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(def, null, 2) + '\n');
  console.log(`  wrote assets/minecraft/items/${base.item}.json  (${kept.length} kept + ${cases.length} mine)`);
}

// ≤1.21.3: the same ids again as integer overrides, so older clients match.
function mergeLegacy(base, cases) {
  const file = path.join(ASSETS, 'minecraft', 'models', 'item', `${base.item}.json`);
  let def;
  if (fs.existsSync(file)) def = JSON.parse(fs.readFileSync(file, 'utf8'));
  else def = { parent: base.parent, textures: { layer0: base.fallback }, overrides: [] };
  const kept = (def.overrides || []).filter(o => !String(o.model).startsWith(`${NS}:`));
  def.overrides = [...kept, ...cases.map(c => ({ predicate: { custom_model_data: c.integer }, model: c.legacyModel }))];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(def, null, 1) + '\n');
  console.log(`  wrote assets/minecraft/models/item/${base.item}.json  (${kept.length} kept + ${cases.length} mine)`);
}

/* ── Generate ───────────────────────────────────────────────────────────── */
console.log('Generating the ReactSMP item set:');
console.log(' shared textures:');
writeTexture('saber_hilt_light', hiltChart(HILTS.light));
writeTexture('saber_hilt_dark', hiltChart(HILTS.dark));
writeTexture('saber_ember', emberChart());
for (const c of COLORS) writeTexture(`saber_blade_${c.id}`, bladeChart(hex(c.hue), hex(c.lit), hex(c.core)));

console.log(' sabers (3D):');
writeSaber('saber_hilt', 'hilt', { hilt: 'light' });
for (const c of COLORS) writeSaber(`saber_${c.id}`, 'blade', { hilt: c.dark ? 'dark' : 'light', colour: c.id, ignited: true });

console.log(' crystals (sprites):');
for (const c of COLORS) writeSprite('crystal', `kyber_${c.id}`, drawCrystal(c));

// The first build of this set drew the sabers as flat sprites. Those files are
// unreferenced now that the models have geometry, so they are removed rather
// than left behind for someone to wire an id to by mistake. Only the exact
// names this generator used to own.
for (const name of ['saber_hilt', 'saber_core', ...COLORS.map(c => `saber_${c.id}`)]) {
  const stale = path.join(ASSETS, NS, 'textures', 'item', `${name}.png`);
  if (fs.existsSync(stale)) { fs.rmSync(stale); console.log(`  removed stale sprite ${name}.png (superseded by the 3D models)`); }
}

if (PREVIEW) {
  console.log(' model summary:');
  for (const g of gallery) if (g.kind === 'model') describeModel(g.id, g.model);
}
for (const [family, list] of Object.entries(written)) console.log(`  ${list.length}× ${family}`);
validateModels();

console.log('Registering:');
mergeSelector(BASE.hilt, written.hilt);
mergeSelector(BASE.blade, written.blade);
mergeSelector(BASE.crystal, written.crystal);
mergeLegacy(BASE.hilt, written.hilt);
mergeLegacy(BASE.blade, written.blade);
mergeLegacy(BASE.crystal, written.crystal);

const htmlArg = process.argv.indexOf('--html');
if (htmlArg >= 0 && process.argv[htmlArg + 1]) writePreviewHtml(process.argv[htmlArg + 1]);

const ids = [...written.hilt, ...written.blade, ...written.crystal];
console.log(`Done: ${ids.length} CMD ids — ${ids.map(i => i.when).join(', ')}`);
