// ── CivBridge Orb set ────────────────────────────────────────────────────────
// Generates every "orb" custom item into civbridge-pack:
//
//   civbridge:orb_story            a leather story tome with a glowing gem
//   civbridge:orb_unknown          the orb rendered in the CORRUPTED
//                                  (magenta/black missing-texture) look
//   civbridge:orb_react_<tier>     the React Orb, 11 rarity tiers
//                                  common → uncommon → rare → epic →
//                                  legendary → heroic → mythic → demi god →
//                                  semi op → god → transcend
//
// All orbs sit on the vanilla slime_ball base item (see the selector merge at
// the bottom) and are drawn at 32×32 instead of vanilla 16×16 — item/generated
// UVs are normalised, so the client samples the whole sprite and the extra
// pixels buy real shading (ramps, limb darkening, specular, glow) for free.
//
// React Orb brand colours are sampled from the ReactSMP logo:
//   crown violet #9048F0 → #7050E0 → blue #4060B0 → cyan #48B0D0 → #20C0C8
//   letters silver #D8D0D0, rim purple #8030D8/#C050F8, cyan #00B8C0/#48D8D8,
//   spark deep cyan #0090A0, background near-black #080B16.
// Every tier wears the logo's own crown (that violet→cyan gradient) and the
// white lightning bolt; the orb body is a glossy sphere in the tier's colour,
// and each rank up adds one more ornament (aura → arcs → crown → wings →
// jewels → prismatic rim).
//
// Run: node tools/gen_orbs.mjs   (idempotent — regenerates identical bytes)
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACK = path.join(ROOT, 'src', 'main', 'resources', 'civbridge-pack');

const S = 32;                 // sprite size (see header note)
const CX = 16.0;              // orb centre — nudged down so a crown fits on top
const CY = 17.0;
const R = 10.6;               // orb radius in pixels

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

/* ── Canvas + drawing primitives ────────────────────────────────────────── */
const canvas = () => ({ w: S, h: S, px: new Uint8Array(S * S * 4) });
const inb = (x, y) => x >= 0 && y >= 0 && x < S && y < S;

function setPx(img, x, y, c, a = 255) {
  if (!inb(x, y)) return;
  const i = (y * S + x) * 4;
  img.px[i] = c[0] | 0; img.px[i + 1] = c[1] | 0; img.px[i + 2] = c[2] | 0; img.px[i + 3] = a | 0;
}
// Straight-alpha composite — lets glows and auras layer softly.
function over(img, x, y, c, a = 255) {
  if (!inb(x, y) || a <= 0) return;
  const i = (y * S + x) * 4;
  const sa = Math.min(1, a / 255);
  const da = img.px[i + 3] / 255;
  const oa = sa + da * (1 - sa);
  if (oa <= 0) { img.px[i] = img.px[i + 1] = img.px[i + 2] = img.px[i + 3] = 0; return; }
  for (let k = 0; k < 3; k++) {
    img.px[i + k] = Math.round((c[k] * sa + img.px[i + k] * da * (1 - sa)) / oa);
  }
  img.px[i + 3] = Math.round(oa * 255);
}
function rect(img, x0, y0, x1, y1, c, a = 255) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) setPx(img, x, y, c, a);
}
function hline(img, x0, x1, y, c, a = 255) { for (let x = x0; x <= x1; x++) setPx(img, x, y, c, a); }
function vline(img, x, y0, y1, c, a = 255) { for (let y = y0; y <= y1; y++) setPx(img, x, y, c, a); }
function frame(img, x0, y0, x1, y1, c) {
  hline(img, x0, x1, y0, c); hline(img, x0, x1, y1, c);
  vline(img, x0, y0, y1, c); vline(img, x1, y0, y1, c);
}

/* ── Colour helpers ─────────────────────────────────────────────────────── */
const hex = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
const byte = v => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
const mix = (a, b, t) => { t = clamp(t); return [byte(a[0] + (b[0] - a[0]) * t), byte(a[1] + (b[1] - a[1]) * t), byte(a[2] + (b[2] - a[2]) * t)]; };
const mul = (c, k) => [byte(c[0] * k), byte(c[1] * k), byte(c[2] * k)];
const WHITE = [255, 255, 255];
const INK = [6, 8, 16];                       // the logo's near-black backdrop
function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) { const v = byte(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = t => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [byte(f(h + 1 / 3) * 255), byte(f(h) * 255), byte(f(h - 1 / 3) * 255)];
}

/* ── Sphere geometry ────────────────────────────────────────────────────── */
// Normalised distance from the orb centre: <1 is inside the orb.
const depth = (x, y) => Math.hypot((x + 0.5 - CX) / R, (y + 0.5 - CY) / R);
const halfWidthAt = y => Math.sqrt(Math.max(0, 1 - Math.pow((y + 0.5 - CY) / R, 2))) * R;

/* ── The glossy orb ─────────────────────────────────────────────────────── */
// A four-stop ramp (deep shadow → accent → lit → hot spot) plus limb
// darkening, an edge rim-light on the lit side, and a soft specular blob.
// That's what makes it read as a polished sphere instead of a flat disc.
function drawGlossyOrb(img, { accent, prismatic }) {
  const deep = prismatic ? hex('#0B0620') : mix(accent, INK, 0.72);
  const lit = prismatic ? WHITE : mix(accent, WHITE, 0.45);
  const bounceCol = mix(accent, WHITE, 0.30);
  const lx = -0.45, ly = -0.55, lz = 0.70;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = depth(x, y);
      if (d > 1) continue;
      const dx = (x + 0.5 - CX) / R, dy = (y + 0.5 - CY) / R;
      const nz = Math.sqrt(Math.max(0, 1 - d * d));
      const lam = Math.max(0, dx * lx + dy * ly + nz * lz);
      let col;
      if (prismatic) {
        col = hsl(205 + dx * 115 + dy * 85, 0.86, 0.26 + lam * 0.42);
        col = mix(col, WHITE, Math.max(0, (lam - 0.78) / 0.22) * 0.5);
      } else if (lam >= 0.72) {
        col = mix(lit, mix(accent, WHITE, 0.8), (lam - 0.72) / 0.28);
      } else if (lam >= 0.48) {
        col = mix(accent, lit, (lam - 0.48) / 0.24);
      } else if (lam >= 0.20) {
        col = mix(deep, accent, (lam - 0.20) / 0.28);
      } else {
        col = mix(mul(deep, 0.62), deep, lam / 0.20);
      }
      // limb darkening — the silhouette curls away from the viewer
      col = mix(col, mul(INK, 1.15), Math.pow(1 - nz, 2.6) * 0.55);
      // rim light along the lit edge (top-left crescent)
      const fres = Math.pow(1 - nz, 3.4) * Math.max(0, lam * 2.1);
      col = mix(col, lit, Math.min(0.9, fres * 1.7));
      // bounce light off the lower-right — without it a sphere reads as an egg
      const bounce = Math.pow(1 - nz, 3.0) * Math.max(0, -(dx * lx + dy * ly));
      col = mix(col, bounceCol, Math.min(0.45, bounce * 1.0));
      setPx(img, x, y, col);
    }
  }
  // specular blob, upper-left, kept clear of the bolt
  const sx = CX - 4.1, sy = CY - 5.0;
  for (let y = Math.floor(sy) - 2; y <= Math.ceil(sy) + 2; y++) {
    for (let x = Math.floor(sx) - 2; x <= Math.ceil(sx) + 2; x++) {
      if (depth(x, y) > 0.97) continue;
      const dd = Math.hypot(x + 0.5 - sx, y + 0.5 - sy);
      if (dd > 2.3) continue;
      over(img, x, y, WHITE, Math.round(155 * Math.pow(1 - dd / 2.3, 1.5)));
    }
  }
  setPx(img, Math.round(sx), Math.round(sy), mix(WHITE, accent, 0.2));
}

/* ── Glow / aura / ornaments ────────────────────────────────────────────── */
function drawAura(img, col, from, to, alpha) {
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = depth(x, y);
      if (d <= from || d > to) continue;
      over(img, x, y, col, alpha * (1 - (d - from) / (to - from)));
    }
  }
}
// Four-point sparkle, like the one in the middle of the ReactSMP logo.
function spark4(img, x, y, col, size = 1) {
  over(img, x, y, mix(col, WHITE, 0.55));
  for (let i = 1; i <= size + 1; i++) {
    const c = i === 1 ? col : mix(col, WHITE, 0.3);
    const a = i === 1 ? 255 : 135;
    over(img, x + i, y, c, a); over(img, x - i, y, c, a);
    over(img, x, y + i, c, a); over(img, x, y - i, c, a);
  }
  for (const [ox, oy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) over(img, x + ox, y + oy, col, 70);
}
// Mirrored energy streaks beside the orb, just outside the silhouette.
function drawArcs(img, col, strength) {
  const rows = [10, 13.5, 20.5, 24].slice(0, Math.min(4, strength + 1));
  for (const ry of rows) {
    const h = halfWidthAt(ry);
    const n = 2 + strength;
    for (let i = 0; i < n; i++) {
      const a = 240 - i * 46;
      over(img, Math.round(CX + h) + 1 + i, Math.round(ry), mix(col, WHITE, i * 0.2), a);
      over(img, Math.round(CX - h) - 1 - i, Math.round(ry), mix(col, WHITE, i * 0.2), a);
    }
  }
}
// Chebyshev ring of distanced cells around a set (used for the bolt outline).
function ring(cells, k) {
  const has = new Set(cells.map(([x, y]) => `${x},${y}`));
  const out = [];
  const seen = new Set();
  for (const [x, y] of cells) {
    for (let oy = -k; oy <= k; oy++) {
      for (let ox = -k; ox <= k; ox++) {
        if (Math.max(Math.abs(ox), Math.abs(oy)) !== k) continue;
        const key = `${x + ox},${y + oy}`;
        if (has.has(key) || seen.has(key)) continue;
        seen.add(key);
        out.push([x + ox, y + oy]);
      }
    }
  }
  return out;
}
// The ReactSMP crown, traced from the logo and re-mixed per tier: a violet →
// blue → cyan gradient band with tall spikes and white jewel tips.
const CROWN_GRAD = ['#9048F0', '#7050E0', '#4B6FD0', '#3B8FD8', '#35B8D0', '#20C0C8'];
function drawCrown(img, o) {
  const { points, baseY, tipY, accent, jewels, wings } = o;
  const x0 = 10, x1 = 21;                                     // 12px band, centred
  const grad = x => mix(hex(CROWN_GRAD[clamp(Math.round((x - x0) / (x1 - x0) * (CROWN_GRAD.length - 1)), 0, CROWN_GRAD.length - 1)]), accent, 0.28);
  if (wings) {
    for (const [dx, dy, a] of [[-1, -1, 240], [-2, -2, 205], [-3, -3, 155]]) {
      over(img, x0 + dx, baseY + dy, grad(x0), a);
      over(img, x1 - dx, baseY + dy, grad(x1), a);
    }
  }
  for (let x = x0; x <= x1; x++) {
    setPx(img, x, baseY, mul(grad(x), 0.5));
    setPx(img, x, baseY - 1, grad(x));
    setPx(img, x, baseY - 2, mix(grad(x), WHITE, 0.32));
  }
  for (let i = 0; i < points; i++) {
    const tx = Math.round(x0 + 1 + ((x1 - 1) - (x0 + 1)) * (i / (points - 1)));
    const m = Math.abs(i - (points - 1) / 2) / ((points - 1) / 2);
    const top = Math.round(tipY + m * 2);
    for (let y = top + 2; y < baseY - 1; y++) { setPx(img, tx - 1, y, mul(grad(tx), 0.82)); setPx(img, tx + 1, y, mul(grad(tx), 0.82)); }
    for (let y = top; y < baseY - 1; y++) setPx(img, tx, y, grad(tx));
    setPx(img, tx, top, mix(grad(tx), WHITE, 0.85));           // jewel tip
  }
  if (jewels) for (let x = x0 + 2; x <= x1 - 2; x += 3) setPx(img, x, baseY - 1, mix(WHITE, accent, 0.25));
}
// Small shaded gem — reused for the tome's cover emblem.
function miniSphere(img, cx, cy, r, body, deep, lit) {
  for (let y = Math.floor(cy - r) - 1; y <= Math.ceil(cy + r) + 1; y++) {
    for (let x = Math.floor(cx - r) - 1; x <= Math.ceil(cx + r) + 1; x++) {
      const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / r;
      const d = Math.hypot(dx, dy);
      if (d > 1) continue;
      const nz = Math.sqrt(Math.max(0, 1 - d * d));
      const lam = clamp(dx * -0.45 + dy * -0.55 + nz * 0.7, 0, 1);
      setPx(img, x, y, mix(deep, body, Math.pow(lam, 0.55)));
      over(img, x, y, lit, clamp((d - 0.62) / 0.38) * 0.5);
    }
  }
  setPx(img, Math.round(cx) - 1, Math.round(cy) - 2, mix(lit, WHITE, 0.7));
  setPx(img, Math.round(cx) - 2, Math.round(cy) - 3, mix(lit, WHITE, 0.4));
}

/* ── React Orb ──────────────────────────────────────────────────────────── */
// The bolt is the React Orb's mark: a white lightning zigzag, traced from the
// charge iconography in the logo's "spark".
const BOLT = [
  '...XX',
  '..XX.',
  '.XX..',
  'XXX..',   // foot of the upper stroke…
  '..XXX',   // …and the lower stroke kicks back out to the right
  '...XX',
  '..XX.',
  '.XX..',
];
const BOLT_X = 14, BOLT_Y = 11;

// Rarity ladder — colour climbs, and every rank unlocks one more ornament.
const TIERS = [
  { id: 'common',    label: 'Common',    accent: '#9AA0AC', arcs: 0, crown: 0, aura: 0, sparks: 0 },
  { id: 'uncommon',  label: 'Uncommon',  accent: '#35B45F', arcs: 1, crown: 0, aura: 0, sparks: 1 },
  { id: 'rare',      label: 'Rare',      accent: '#2E7BE0', arcs: 1, crown: 3, aura: 0, sparks: 1 },
  { id: 'epic',      label: 'Epic',      accent: '#9B4DFF', arcs: 2, crown: 3, aura: 1, sparks: 1 },
  { id: 'legendary', label: 'Legendary', accent: '#FFA61E', arcs: 2, crown: 5, aura: 1, sparks: 2 },
  { id: 'heroic',    label: 'Heroic',    accent: '#E8403A', arcs: 2, crown: 5, aura: 1, sparks: 2 },
  { id: 'mythic',    label: 'Mythic',    accent: '#12CFD6', arcs: 3, crown: 5, aura: 2, sparks: 2, jewels: true },
  { id: 'demigod',   label: 'Demi God',  accent: '#F551C4', arcs: 3, crown: 5, aura: 2, sparks: 3, jewels: true },
  { id: 'semiop',    label: 'Semi OP',   accent: '#FF7A1E', arcs: 3, crown: 5, aura: 2, sparks: 3, jewels: true, wings: true },
  { id: 'god',       label: 'God',       accent: '#FFD84A', arcs: 4, crown: 5, aura: 3, sparks: 4, jewels: true, wings: true },
  { id: 'transcend', label: 'Transcend', accent: '#A855F7', arcs: 4, crown: 5, aura: 4, sparks: 5, jewels: true, wings: true, prismatic: true },
];

const SPARK_SPOTS = [[28, 9], [3, 22], [29, 23], [2, 12], [27, 3], [4, 5]];

function drawReact(t) {
  const img = canvas();
  const accent = hex(t.accent);

  // 1) aura behind everything — none at Common, a double/triple shell at the top.
  if (t.aura) {
    drawAura(img, accent, 0.97, 1.14, 58 + t.aura * 14);
    if (t.aura >= 2) drawAura(img, mix(accent, WHITE, 0.3), 1.10, 1.24, 44);
    if (t.aura >= 3) drawAura(img, accent, 1.20, 1.34, 30);
    if (t.aura >= 4) drawAura(img, hex('#FF7BE0'), 1.24, 1.44, 22);
  }

  // 2) the orb itself.
  drawGlossyOrb(img, { accent, prismatic: !!t.prismatic });

  // 3) the bolt: soft glow, dark outline so it stays legible on any body
  //    colour, then the near-white zigzag on top.
  const cells = [];
  for (let j = 0; j < BOLT.length; j++) {
    for (let i = 0; i < BOLT[j].length; i++) if (BOLT[j][i] === 'X') cells.push([BOLT_X + i, BOLT_Y + j]);
  }
  const glow = t.prismatic ? hsl(285, 0.85, 0.66) : mix(accent, WHITE, 0.45);
  const edge = mul(INK, 1.25);
  for (const [x, y] of ring(cells, 2)) over(img, x, y, glow, 95);
  for (const [x, y] of ring(cells, 1)) over(img, x, y, edge, 215);
  for (const [x, y] of cells) setPx(img, x, y, t.prismatic ? WHITE : mix(WHITE, accent, 0.18));

  // 4) ornaments.
  if (t.arcs) drawArcs(img, mix(accent, WHITE, 0.45), t.arcs);
  if (t.crown) drawCrown(img, {
    points: t.crown, baseY: 6, tipY: 1,
    accent, jewels: !!t.jewels, wings: !!t.wings,
  });
  for (let i = 0; i < t.sparks && i < SPARK_SPOTS.length; i++) {
    const [sx, sy] = SPARK_SPOTS[i];
    spark4(img, sx, sy, i === 0 ? accent : mix(accent, WHITE, 0.4), 1);
  }
  return img;
}

/* ── Story Orb — a leather tome with a glowing story gem ────────────────── */
function drawStory() {
  const img = canvas();
  const COVER_DEEP = hex('#33160A'), COVER_DARK = hex('#552a15'), COVER = hex('#7a3f22'), COVER_LIT = hex('#a05a31');
  const GOLD_DARK = hex('#8a661e'), GOLD = hex('#d9a94b'), GOLD_LIT = hex('#f7e1a0');
  const PAGE = hex('#f4e9ce'), PAGE_MID = hex('#ddcaa3'), PAGE_LINE = hex('#bda87d');
  const RIBBON = hex('#b3243e'), RIBBON_DARK = hex('#77142a');

  // 1) warm amber aura — a story should look lit from inside.
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.hypot((x + 0.5 - 16) / 16.0, (y + 0.5 - 16.5) / 16.0);
      if (d > 0.52 && d < 1.08) over(img, x, y, hex('#f0a83c'), 52 * (1 - (d - 0.52) / 0.56));
    }
  }

  // 2) page block along the fore-edge (right), inset so the cover overhangs.
  rect(img, 25, 6, 29, 26, PAGE);
  for (let x = 26; x <= 28; x += 2) vline(img, x, 7, 25, PAGE_LINE);
  hline(img, 25, 29, 6, PAGE_MID);
  hline(img, 25, 29, 26, PAGE_LINE);
  vline(img, 29, 6, 26, PAGE_LINE);
  setPx(img, 25, 6, mix(PAGE, WHITE, 0.5));

  // 3) spine (left) with raised bands and a gilt line on each.
  rect(img, 3, 5, 7, 27, COVER_DARK);
  vline(img, 3, 5, 27, COVER_LIT);
  vline(img, 7, 5, 27, mix(COVER_DARK, COVER_DEEP, 0.6));
  for (const by of [9, 16, 23]) {
    hline(img, 3, 7, by - 1, mix(COVER, WHITE, 0.14));
    hline(img, 3, 7, by, GOLD_DARK);
  }

  // 4) cover face: leather with a lit top-left edge, shadowed bottom-right.
  rect(img, 8, 4, 24, 28, COVER);
  hline(img, 8, 24, 4, COVER_LIT);
  vline(img, 8, 4, 28, mix(COVER, WHITE, 0.16));
  hline(img, 8, 24, 28, COVER_DEEP);
  vline(img, 24, 4, 28, COVER_DEEP);
  frame(img, 9, 5, 23, 27, COVER_DARK);

  // 5) gilt rule + corner bosses.
  frame(img, 11, 8, 21, 23, GOLD_DARK);
  frame(img, 12, 9, 20, 22, GOLD);
  hline(img, 12, 20, 9, GOLD_LIT);
  for (const [bx, by] of [[11, 8], [21, 8], [11, 23], [21, 23]]) {
    rect(img, bx - 1, by - 1, bx, by, GOLD_DARK);
    setPx(img, bx - 1, by - 1, GOLD_LIT);
  }

  // 6) cover emblem: the story orb set into the cover, sparkle above it.
  miniSphere(img, 16, 14.5, 3.4, hex('#ffd98a'), hex('#8a5a12'), hex('#ffeeb8'));
  for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) over(img, 16 + ox, 15 + oy, hex('#f7c34f'), 80);
  spark4(img, 16, 9, GOLD_LIT, 1);
  // script lines under the gem — "text" printed on the cover.
  for (const [y, xs] of [[18, [13, 15, 17, 19]], [20, [13, 16, 19]], [22, [14, 17]]]) {
    for (const x of xs) { setPx(img, x, y, GOLD, 215); setPx(img, x + 1, y, GOLD_DARK, 185); }
  }

  // 7) ribbon bookmark hanging off the pages, with a notched tail.
  rect(img, 26, 27, 27, 30, RIBBON);
  vline(img, 27, 27, 30, RIBBON_DARK);
  hline(img, 26, 27, 30, mix(RIBBON, WHITE, 0.25));
  over(img, 26, 31, RIBBON_DARK, 150);

  // 8) two motes of story-light, clear of the book silhouette.
  spark4(img, 4, 3, GOLD_LIT, 0);
  spark4(img, 29, 13, GOLD_LIT, 0);
  return img;
}

/* ── Orb of Unknown — the corrupted / missing-texture look ──────────────── */
function drawUnknown() {
  const img = canvas();
  const MAG = hex('#ff00ff'), MAG_LIT = hex('#ff8bff'), BLK = hex('#000000');
  const VOID = hex('#4a2f8f');

  // 1) violet corruption aura leaking out of the orb.
  drawAura(img, VOID, 0.98, 1.14, 56);
  drawAura(img, hex('#7a3fe0'), 1.10, 1.26, 32);

  // 2) body: the vanilla missing-texture 2×2 magenta/black checker, shaded so
  //    it still reads as a sphere instead of a flat error card.
  const lx = -0.45, ly = -0.50, lz = 0.74;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (x + 0.5 - CX) / R, dy = (y + 0.5 - CY) / R;
      const d = Math.hypot(dx, dy);
      if (d > 1) continue;
      const nz = Math.sqrt(Math.max(0, 1 - d * d));
      const lam = Math.max(0, dx * lx + dy * ly + nz * lz);
      const checker = ((Math.floor(x / 2) + Math.floor(y / 2)) % 2) === 0;
      let col = mul(checker ? MAG : BLK, 0.34 + lam * 1.05);
      col = mix(col, VOID, Math.pow(Math.max(0, 1 - d / 0.8), 2.2) * 0.30);   // something stirs inside
      col = mix(col, BLK, Math.pow(1 - nz, 3.0) * 0.62);                       // black limb
      setPx(img, x, y, col);
    }
  }

  // 3) glitch: horizontal tears. Shifts are ODD pixels on purpose — the checker
  //    repeats every 4px, so an even shift would be invisible.
  for (const [row, height, shift] of [[7, 1, 3], [15, 2, -3], [22, 1, 1]]) {
    for (let y = row; y < row + height; y++) {
      const src = [];
      for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4;
        src.push([img.px[i], img.px[i + 1], img.px[i + 2], img.px[i + 3]]);
      }
      for (let x = 0; x < S; x++) {
        if (depth(x, y) > 1) continue;
        const sx = x - shift;
        if (sx < 0 || sx >= S || depth(sx, y) > 1) continue;
        const i = (y * S + x) * 4;
        img.px[i] = src[sx][0]; img.px[i + 1] = src[sx][1];
        img.px[i + 2] = src[sx][2]; img.px[i + 3] = src[sx][3];
      }
      // a dark seam at the tear edge sells the "signal broke" look
      const seam = shift > 0 ? Math.round(CX - halfWidthAt(y)) : Math.round(CX + halfWidthAt(y));
      over(img, seam, y, BLK, 200);
    }
  }

  // 4) corruption: a dead black block and a few blown-out pixels.
  rect(img, 18, 19, 19, 20, BLK);
  over(img, 11, 12, MAG_LIT, 230);
  over(img, 21, 8, MAG_LIT, 200);
  over(img, 13, 22, MAG_LIT, 170);

  // 5) data bleeding outside the sprite silhouette.
  over(img, 2, 9, MAG, 200);
  over(img, 30, 21, MAG, 150);
  over(img, 29, 12, MAG_LIT, 110);
  over(img, 3, 25, MAG, 90);
  return img;
}

/* ── Write assets ───────────────────────────────────────────────────────── */
const SLIME_SELECTOR = path.join(PACK, 'assets', 'minecraft', 'items', 'slime_ball.json');

function writeItem(id, img) {
  const file = path.join(PACK, 'assets', 'minecraft', 'textures', 'block', `civorb_${id}.png`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encodePNG(S, S, img.px));
  const model = {
    parent: 'minecraft:item/generated',
    textures: { layer0: `minecraft:block/civorb_${id}` },
  };
  const mfile = path.join(PACK, 'assets', 'minecraft', 'models', 'block', `civorb_${id}.json`);
  fs.writeFileSync(mfile, JSON.stringify(model, null, 1) + '\n');
  console.log('  wrote', path.relative(ROOT, file).replaceAll('\\', '/'), '+ model');
  return { when: `civbridge:orb_${id}`, model: { type: 'minecraft:model', model: `minecraft:block/civorb_${id}` } };
}

const cases = [];
cases.push(writeItem('story', drawStory()));
cases.push(writeItem('unknown', drawUnknown()));
for (const t of TIERS) cases.push(writeItem(`react_${t.id}`, drawReact(t)));
// Back-compat: the pre-tier id still resolves to the base React Orb.
cases.push({ when: 'civbridge:orb_react', model: { type: 'minecraft:model', model: 'minecraft:block/civorb_react_common' } });

// Merge into the slime_ball selector, replacing the orb cases we own (so
// renames never leave stale entries) but leaving every other case alone.
let selector;
if (fs.existsSync(SLIME_SELECTOR)) {
  selector = JSON.parse(fs.readFileSync(SLIME_SELECTOR, 'utf8'));
} else {
  selector = {
    model: {
      type: 'minecraft:select',
      property: 'minecraft:custom_model_data',
      index: 0,
      cases: [],
      fallback: { type: 'minecraft:model', model: 'minecraft:item/slime_ball' },
    },
  };
}
const kept = (selector.model.cases || []).filter(c => !String(c.when).startsWith('civbridge:orb_'));
selector.model.cases = [...kept, ...cases];
fs.mkdirSync(path.dirname(SLIME_SELECTOR), { recursive: true });
fs.writeFileSync(SLIME_SELECTOR, JSON.stringify(selector, null, 2) + '\n');
console.log('  wrote', path.relative(ROOT, SLIME_SELECTOR).replaceAll('\\', '/'));
console.log(`Done: ${cases.length} orb ids (story, unknown, ${TIERS.length} react tiers + legacy alias).`);
