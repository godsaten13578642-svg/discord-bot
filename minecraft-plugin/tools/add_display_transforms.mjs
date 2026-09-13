// Injects Minecraft display transforms into the generated 3D item models so
// they sit in the hand like vanilla tools do (saber blades already carry the
// proven example's full display section and are left untouched).
//
// Two things per family:
//   1. A preset: vanilla 'item/handheld'-style transforms, already compensated
//      for the fact that display rotations pivot around the model's visual
//      center (8,8,8), not the origin — so we translate models so their
//      bounding-box center lands where the vanilla grip expects it.
//   2. A per-model scale from the bounding box: trinkets (shuriken, amulet)
//      are enlarged in hand/GUI, long weapons (scythe, blades) are pulled
//      slightly back so they don't clip the camera.
//
// Idempotent: overwrites any existing display section on matched models, so
// re-running after regenerating geometry always lands fresh transforms.
//
// Run: node tools/add_display_transforms.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODELS = path.join(ROOT, 'src', 'main', 'resources', 'civbridge-pack', 'assets', 'minecraft', 'models', 'block');

// ── Presets ──────────────────────────────────────────────────────────────────
// Rotation order mirrors vanilla: [x, y, z], degrees. Translations are applied
// to the model AFTER the center-shift below, in vanilla display units.

const PRESETS = {
  // Small held-in-palm objects: gems, gauntlet, scrolls, masks.
  trinket: {
    centerTo: [8.0, 7.0, 8.0],   // bbox center target (lower = closer to grip)
    firstperson_righthand: { rotation: [0, 15, 0], translation: [0, 1.5, 0], scale: [1.0, 1.0, 1.0] },
    firstperson_lefthand:  { rotation: [0, -15, 0], translation: [0, 1.5, 0], scale: [1.0, 1.0, 1.0] },
    thirdperson_righthand: { rotation: [0, 0, 0], translation: [0, 2.0, 0], scale: [0.9, 0.9, 0.9] },
    thirdperson_lefthand:  { rotation: [0, 0, 0], translation: [0, 2.0, 0], scale: [0.9, 0.9, 0.9] },
    gui:                   { rotation: [15, -30, 0], translation: [0, 0, 0], scale: [1.0, 1.0, 1.0] },
    ground:                { translation: [0, 2, 0], scale: [0.5, 0.5, 0.5] },
    fixed:                 { rotation: [0, 0, 0], scale: [0.8, 0.8, 0.8] },
  },
  // Long-shaft weapons held like a tool: scythe, blades, the Colt.
  weapon: {
    centerTo: [8.0, 10.0, 8.0],  // raise the pivot so the grip sits at the hand
    firstperson_righthand: { rotation: [0, -15, 20], translation: [0.5, 0.5, -0.5], scale: [1.0, 1.0, 1.0] },
    firstperson_lefthand:  { rotation: [0, 15, -20], translation: [0.5, 0.5, -0.5], scale: [1.0, 1.0, 1.1] },
    thirdperson_righthand: { rotation: [0, 90, 45], translation: [0, 3, 1], scale: [0.85, 0.85, 0.85] },
    thirdperson_lefthand:  { translation: [0, 3, 1], scale: [0.85, 0.85, 0.85] },
    gui:                   { rotation: [0, -45, 25], translation: [0, 0, 0], scale: [0.95, 0.95, 0.95] },
    ground:                { translation: [0, 3, 0], scale: [0.5, 0.5, 0.5] },
    fixed:                 { rotation: [0, 0, 0], scale: [0.8, 0.8, 0.8] },
  },
  // Worn-style items: boots, headband — shown flat-ish in GUI like armor.
  worn: {
    centerTo: [8.0, 8.0, 8.0],
    firstperson_righthand: { rotation: [0, 0, 0], translation: [0, 2, 0], scale: [0.9, 0.9, 0.9] },
    firstperson_lefthand:  { rotation: [0, 0, 0], translation: [0, 2, 0], scale: [0.9, 0.9, 0.9] },
    thirdperson_righthand: { rotation: [90, 0, 0], translation: [0, 2.5, 0], scale: [0.8, 0.8, 0.8] },
    thirdperson_lefthand:  { rotation: [90, 0, 0], translation: [0, 2.5, 0], scale: [0.8, 0.8, 0.8] },
    gui:                   { rotation: [30, 225, 0], translation: [0, 0, 0], scale: [0.9, 0.9, 0.9] },
    ground:                { translation: [0, 2, 0], scale: [0.5, 0.5, 0.5] },
    fixed:                 { rotation: [0, 0, 0], scale: [0.8, 0.8, 0.8] },
  },
};

// Per-model overrides: family preset + scale factor per view + rotation tweak.
// scale: multiplies the preset's scale array. rot: appended to first-person Z.
const MODEL_CONFIG = {
  // Infinity stones — palm gems.
  civstone_space:    { preset: 'trinket' },
  civstone_mind:     { preset: 'trinket' },
  civstone_reality:  { preset: 'trinket' },
  civstone_power:    { preset: 'trinket' },
  civstone_time:     { preset: 'trinket' },
  civstone_soul:     { preset: 'trinket' },
  // Gauntlet — chunky but fist-shaped; keep close to the hand.
  civgauntlet_empty: { preset: 'trinket', scale: { firstperson: 0.85, thirdperson: 0.9, gui: 0.9, ground: 0.7 } },
  civgauntlet_space: { preset: 'trinket', scale: { firstperson: 0.85, thirdperson: 0.9, gui: 0.9, ground: 0.7 } },
  civgauntlet_mind:  { preset: 'trinket', scale: { firstperson: 0.85, thirdperson: 0.9, gui: 0.9, ground: 0.7 } },
  civgauntlet_reality:{ preset: 'trinket', scale: { firstperson: 0.85, thirdperson: 0.9, gui: 0.9, ground: 0.7 } },
  civgauntlet_power: { preset: 'trinket', scale: { firstperson: 0.85, thirdperson: 0.9, gui: 0.9, ground: 0.7 } },
  civgauntlet_time:  { preset: 'trinket' },
  civgauntlet_soul:  { preset: 'trinket' },
  // Fandom.
  civfandom_deaths_scythe:  { preset: 'weapon', scale: { firstperson: 0.8, thirdperson: 0.8, gui: 0.85, ground: 0.6 } },
  civfandom_angel_blade:    { preset: 'weapon', scale: { firstperson: 0.9, thirdperson: 0.9, gui: 0.95, ground: 0.6 } },
  civfandom_chidori_blade:  { preset: 'weapon', scale: { firstperson: 0.9, thirdperson: 0.9, gui: 0.95, ground: 0.6 } },
  civfandom_the_colt:       { preset: 'weapon', scale: { firstperson: 0.9, thirdperson: 0.9, gui: 0.95, ground: 0.6 } },
  civfandom_first_blade:    { preset: 'weapon', scale: { firstperson: 0.9, thirdperson: 0.9, gui: 0.95, ground: 0.6 } },
  civfandom_ninja_star:     { preset: 'trinket', scale: { firstperson: 1.1, thirdperson: 1.0, gui: 1.15, ground: 0.9 } },
  civfandom_rasengan:       { preset: 'trinket', scale: { firstperson: 1.0, thirdperson: 1.0, gui: 1.0, ground: 0.8 } },
  civfandom_summoning_scroll:{ preset: 'weapon', scale: { firstperson: 0.9, thirdperson: 0.9, gui: 0.9, ground: 0.6 } },
  civfandom_parkour_boots:  { preset: 'worn' },
  civfandom_hidden_leaf_headband: { preset: 'worn' },
  civfandom_no_scope_eyes:  { preset: 'worn' },
};

// ── Bounding box helpers ─────────────────────────────────────────────────────
function bboxOf(model) {
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const el of model.elements || []) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], el.from[i]);
      max[i] = Math.max(max[i], el.to[i]);
    }
  }
  if (!isFinite(min[0])) return null;
  return { min, max, size: max.map((v, i) => v - min[i]), center: max.map((v, i) => (v + min[i]) / 2) };
}

function translateElement(el, delta) {
  el.from = el.from.map((v, i) => round(v + delta[i]));
  el.to = el.to.map((v, i) => round(v + delta[i]));
}
function round(v) { return Math.round(v * 1e6) / 1e6; }

// ── Main ─────────────────────────────────────────────────────────────────────
let changed = 0;
for (const [id, cfg] of Object.entries(MODEL_CONFIG)) {
  const file = path.join(MODELS, `${id}.json`);
  if (!fs.existsSync(file)) { console.error(`✗ ${id}.json missing`); continue; }
  const model = JSON.parse(fs.readFileSync(file, 'utf8'));
  const bbox = bboxOf(model);
  if (!bbox) { console.error(`✗ ${id}.json has no elements`); continue; }

  const preset = PRESETS[cfg.preset];
  if (!preset) { console.error(`✗ ${id}: unknown preset ${cfg.preset}`); continue; }

  // 1. Shift geometry so the bbox center lands where the preset expects.
  const delta = preset.centerTo.map((target, i) => round(target - bbox.center[i]));
  if (delta.some(d => Math.abs(d) > 1e-9)) {
    for (const el of model.elements) translateElement(el, delta);
  }

  // 2. Build the display section: preset transforms, scaled per view.
  const s = cfg.scale || {};
  const disp = {};
  for (const [view, t] of Object.entries(preset)) {
    if (view === 'centerTo') continue;
    const base = Math.max(0.05, (s[view] ?? s.firstperson ?? s.thirdperson ?? s.gui ?? s.ground ?? 1));
    const entry = JSON.parse(JSON.stringify(t));
    if (entry.scale) entry.scale = entry.scale.map(v => round(v * base));
    disp[view] = entry;
  }
  model.display = disp;

  fs.writeFileSync(file, JSON.stringify(model, null, 1) + '\n');
  changed++;
}
console.log(`✓ display transforms written for ${changed}/${Object.keys(MODEL_CONFIG).length} models`);
if (changed !== Object.keys(MODEL_CONFIG).length) process.exit(1);
