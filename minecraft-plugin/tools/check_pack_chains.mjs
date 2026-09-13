// Full client-style validation of the CivBridge resource pack.
// Simulates exactly what a 1.21.4+/26.x client does for every custom-model-
// data string: find the case in assets/<ns>/items/<item>.json, resolve the
// model file, walk the parent chain, and confirm every custom texture exists.
//
// Contract: REQUIRED_IDS must all resolve. Every case of EVERY selector must
// resolve too, so nothing can silently regress. Fails non-zero on any problem,
// which makes it usable as a CI gate and lets build_resource_pack.mjs refuse
// to bless a broken pack.
//
// Usage:
//   node tools/check_pack_chains.mjs                     // validate the built zips
//   node tools/check_pack_chains.mjs civbridge-pack.zip  // validate one zip
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN = path.resolve(TOOLS, '..');

// ── Contract: every CMD id the plugin can put on an item must resolve. ──────
// Sabers: LightsaberType.modelId -> custom_swords:<id> (the paper path uses
// these; the legacy custom_swords sword path mirrors them).
const REQUIRED_IDS = [
  // Example pack saber (kept working verbatim)
  'light_sabor_blue_item', 'light_sabor_blue_item-2',
  'light_sabor_blue_item__part0', 'light_sabor_blue_item__part1',
  // Lightsabers
  'custom_swords:anakin_blue', 'custom_swords:anakin_green', 'custom_swords:anakin_purple',
  'custom_swords:anakin_dark', 'custom_swords:anakin_red', 'custom_swords:anakin_white',
  // Infinity stones + gauntlet variants
  'civbridge:infinity_stone_space', 'civbridge:infinity_stone_mind',
  'civbridge:infinity_stone_reality', 'civbridge:infinity_stone_power',
  'civbridge:infinity_stone_time', 'civbridge:infinity_stone_soul',
  'civbridge:gauntlet_empty', 'civbridge:gauntlet_space', 'civbridge:gauntlet_mind',
  'civbridge:gauntlet_reality', 'civbridge:gauntlet_power', 'civbridge:gauntlet_time',
  'civbridge:gauntlet_soul',
  // Fandom items
  'civbridge:fandom_parkour_boots', 'civbridge:fandom_no_scope_eyes',
  'civbridge:fandom_hidden_leaf_headband', 'civbridge:fandom_summoning_scroll',
  'civbridge:fandom_ninja_star', 'civbridge:fandom_rasengan',
  'civbridge:fandom_chidori_blade', 'civbridge:fandom_angel_blade',
  'civbridge:fandom_first_blade', 'civbridge:fandom_deaths_scythe',
  'civbridge:fandom_the_colt',
  // GUI marks
  'reactsmp:crown', 'reactsmp:spark',
];

// ── Minimal zip reader (store + deflate) ────────────────────────────────────
function readZipEntries(buf) {
  // Locate End Of Central Directory.
  const sig = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 65558; i--) {
    if (buf[i] === sig[0] && buf[i + 1] === sig[1] && buf[i + 2] === sig[2] && buf[i + 3] === sig[3]) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip (no EOCD)');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory at ' + p);
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    // Local header: find data start.
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + size);
    const data = method === 0 ? raw : method === 8 ? zlib.inflateRawSync(raw) : null;
    if (data === null) throw new Error('unsupported compression for ' + name);
    entries.set(name, data);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function isPngSignature(b) {
  return b.length > 8 && b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71
    && b[4] === 13 && b[5] === 10 && b[6] === 26 && b[7] === 10;
}

// ── Vanilla models/textures the client always provides ──────────────────────
function splitRef(ref, fallbackNs = 'minecraft') {
  const idx = ref.indexOf(':');
  const ns = idx >= 0 ? ref.slice(0, idx) : fallbackNs;
  const path = idx >= 0 ? ref.slice(idx + 1) : ref;
  return { ns, path };
}
const VANILLA_PARENT_MODELS = new Set(['minecraft:block/block', 'minecraft:item/generated', 'minecraft:item/handheld']);
const VANILLA_PARENT_MODELS_NO_NS = new Set(['block/block', 'item/generated', 'item/handheld']);
// Common vanilla texture namespaces the client provides (heuristic: anything
// under minecraft: that is not shipped in THIS pack is treated as vanilla).
const VANILLA_PREFIXES_WE_SHIP = ['block/light_sabor', 'block/civblade', 'item/reactsmp'];

function isCustomTexture(ref) {
  const { ns, path: p } = splitRef(ref);
  if (ns !== 'minecraft') return true;
  return VANILLA_PREFIXES_WE_SHIP.some(pre => p.startsWith(pre));
}

// ── Chain walking ───────────────────────────────────────────────────────────
function validatePack(name, entries, errors) {
  const itemFiles = [...entries.keys()].filter(n => /^assets\/[^/]+\/items\/[^/]+\.json$/.test(n));
  const modelFile = ref => {
    const { ns, path: p } = splitRef(ref);
    const f = `assets/${ns}/models/${p}.json`;
    return entries.has(f) ? f : null;
  };
  const texFile = ref => {
    const { ns, path: p } = splitRef(ref);
    return `assets/${ns}/textures/${p}.png`;
  };

  for (const itemFile of itemFiles) {
    let sel;
    try { sel = JSON.parse(entries.get(itemFile).toString('utf8')); }
    catch (e) { errors.push(`${name}: ${itemFile}: unparseable JSON`); continue; }
    if (sel.model?.type !== 'minecraft:select' || sel.model.property !== 'minecraft:custom_model_data') continue;
    const cases = sel.model.cases || [];
    for (const c of cases) {
      const when = c.when;
      const modelRef = c.model?.model;
      if (typeof when !== 'string' || typeof modelRef !== 'string') {
        errors.push(`${name}: ${itemFile}: case missing when/model`);
        continue;
      }
      // Walk parent chain collecting texture refs.
      const chainErrors = [];
      const seen = new Set();
      let cur = modelRef;
      let steps = 0;
      while (cur) {
        if (steps++ > 16) { chainErrors.push('parent chain too deep'); break; }
        if (VANILLA_PARENT_MODELS.has(cur) || VANILLA_PARENT_MODELS_NO_NS.has(cur)) break;
        const mf = modelFile(cur);
        if (!mf) { chainErrors.push(`missing model file for ${cur}`); break; }
        if (seen.has(mf)) break;
        seen.add(mf);
        let m;
        try { m = JSON.parse(entries.get(mf).toString('utf8')); }
        catch (e) { chainErrors.push(`${mf}: unparseable`); break; }
        for (const [k, v] of Object.entries(m.textures || {})) {
          if (isCustomTexture(v)) {
            const tf = texFile(v);
            if (!entries.has(tf)) chainErrors.push(`missing texture ${tf} (via ${when})`);
          }
        }
        cur = m.parent;
      }
      if (chainErrors.length) {
        errors.push(`${name}: ${when} -> ${modelRef}: ${chainErrors.join('; ')}`);
      }
    }
  }
}

// ── Drive ───────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const targets = args.length
  ? args.map(a => path.resolve(a))
  : ['resource-pack/civbridge-pack.zip', 'artifacts/civbridge-pack.zip']
      .map(p => path.join(PLUGIN, p))
      .filter(p => fs.existsSync(p));

const errors = [];
let sawAny = false;
const idHits = new Map();
for (const t of targets) {
  if (!fs.existsSync(t)) { errors.push(`missing zip: ${t}`); continue; }
  sawAny = true;
  const entries = readZipEntries(fs.readFileSync(t));
  validatePack(path.basename(path.dirname(t)) + '/' + path.basename(t), entries, errors);
  // Contract check: REQUIRED_IDS must appear as cases somewhere and resolve.
  const whens = new Set();
  for (const itemFile of [...entries.keys()].filter(n => /^assets\/[^/]+\/items\//.test(n))) {
    try {
      const sel = JSON.parse(entries.get(itemFile).toString('utf8'));
      for (const c of sel.model?.cases || []) if (typeof c.when === 'string') whens.add(c.when);
    } catch { /* already reported */ }
  }
  for (const id of REQUIRED_IDS) {
    idHits.set(id, idHits.get(id) || whens.has(id));
  }
}
for (const [id, ok] of idHits) {
  if (!ok) errors.push(`contract: required CMD id "${id}" has no case in any selector`);
}

if (!sawAny) {
  console.error('No pack zips found to validate (build one with tools/build_resource_pack.mjs).');
  process.exit(2);
}
if (errors.length) {
  console.error(`✗ ${errors.length} pack problem(s):`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
const missingContract = REQUIRED_IDS.filter(id => !idHits.get(id));
console.log(`✓ ${targets.length} pack zip(s) validated: every selector case resolves (models + textures), and all ${REQUIRED_IDS.length - missingContract.length}/${REQUIRED_IDS.length} required CMD ids are present.`);
