// Validates a resource pack so broken selectors can't ship silently.
// Checks (for Minecraft 1.21.4+ packs):
//   1. every .json file parses
//   2. every model referenced by assets/minecraft/items/*.json select cases
//      (and their fallback) resolves to a model file in this pack
//   3. every texture used by those models exists in this pack
//   4. every model referenced by assets/minecraft/models/item/*.json
//      overrides (legacy integer-CMD path) resolves, with textures too
//   5. warns when a vanilla item has models/item overrides but NO items/
//      selector — exactly the bug that made sabers render as plain swords
// Usage: node tools/check_pack.mjs [packDir]   (default: src/main/resources/civbridge-pack)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACK = path.resolve(ROOT, process.argv[2] || 'src/main/resources/civbridge-pack');
const ASSETS = path.join(PACK, 'assets');

const errors = [];
const warnings = [];
let jsonCount = 0;

function fail(msg) { errors.push(msg); }
function warn(msg) { warnings.push(msg); }

function readJson(file) {
  try {
    jsonCount++;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    fail(`Invalid JSON: ${path.relative(PACK, file)} — ${e.message}`);
    return null;
  }
}

// "civbridge:item/fandom/the_colt" -> <pack>/assets/civbridge/models/item/fandom/the_colt.json
// Minecraft-namespace refs are skipped (vanilla provides them).
function modelFile(modelId) {
  let ns = 'minecraft', p = modelId;
  const i = modelId.indexOf(':');
  if (i >= 0) { ns = modelId.slice(0, i); p = modelId.slice(i + 1); }
  if (ns === 'minecraft') return null; // vanilla-provided
  return path.join(ASSETS, ns, 'models', `${p}.json`);
}

function textureFile(texId) {
  let ns = 'minecraft', p = texId;
  const i = texId.indexOf(':');
  if (i >= 0) { ns = texId.slice(0, i); p = texId.slice(i + 1); }
  if (ns === 'minecraft') return null;
  return path.join(ASSETS, ns, 'textures', `${p}.png`);
}

function checkModelRef(modelId, from) {
  const f = modelFile(modelId);
  if (!f) return;                       // vanilla model, fine
  if (!fs.existsSync(f)) { fail(`Missing model: ${modelId} (referenced by ${from})`); return; }
  checkModelTextures(f, path.relative(PACK, f));
}

function checkModelTextures(modelFile, from) {
  const m = readJson(modelFile);
  if (!m) return;
  const texs = Object.values(m.textures || {});
  for (const t of texs) {
    if (typeof t !== 'string' || t.startsWith('#')) continue;
    const tf = textureFile(t);
    if (tf && !fs.existsSync(tf)) fail(`Missing texture: ${t} (used by ${from})`);
  }
  // Chains: parent models contribute textures too.
  if (typeof m.parent === 'string') checkModelRef(m.parent, from);
}

// Walk a 1.21.4 items/*.json definition, collecting every referenced model id.
function collectModelRefs(def, out) {
  if (!def || typeof def !== 'object') return;
  if (typeof def.model === 'string') { out.add(def.model); return; }
  for (const key of ['model', 'fallback', 'on_false', 'then']) {
    if (def[key] && typeof def[key] === 'object') collectModelRefs(def[key], out);
  }
  if (Array.isArray(def.entries)) for (const e of def.entries) collectModelRefs(e, out);
  if (Array.isArray(def.cases)) for (const c of def.cases) {
    if (c && typeof c === 'object') collectModelRefs(c.model ?? c, out);
  }
}

// ── 1. pack.mcmeta ───────────────────────────────────────────────────────────
const mcmetaPath = path.join(PACK, 'pack.mcmeta');
if (!fs.existsSync(mcmetaPath)) {
  fail('pack.mcmeta missing at pack root');
} else {
  const mc = readJson(mcmetaPath);
  const fmt = mc?.pack?.pack_format;
  const hasSelectors = fs.existsSync(path.join(ASSETS, 'minecraft', 'items'));
  if (hasSelectors && typeof fmt === 'number' && fmt < 46) {
    fail(`pack_format ${fmt} < 46 — assets/minecraft/items/ selectors need 1.21.4+ (pack_format 46)`);
  }
}

// ── 2+3. items/*.json selectors → models → textures ─────────────────────────
const itemsDir = path.join(ASSETS, 'minecraft', 'items');
const selectorItems = new Set();
if (fs.existsSync(itemsDir)) {
  for (const file of fs.readdirSync(itemsDir)) {
    if (!file.endsWith('.json')) continue;
    const def = readJson(path.join(itemsDir, file));
    if (!def) continue;
    selectorItems.add(file.replace(/\.json$/, ''));
    const refs = new Set();
    collectModelRefs(def.model ?? def, refs);
    for (const ref of refs) checkModelRef(ref, `items/${file}`);
  }
}

// ── 4. legacy models/item/*.json overrides (integer CMD, <=1.21.3 clients) ──
const legacyDir = path.join(ASSETS, 'minecraft', 'models', 'item');
const overrideItems = new Set();
if (fs.existsSync(legacyDir)) {
  for (const file of fs.readdirSync(legacyDir)) {
    if (!file.endsWith('.json')) continue;
    const m = readJson(path.join(legacyDir, file));
    if (!m) continue;
    overrideItems.add(file.replace(/\.json$/, ''));
    for (const o of m.overrides || []) {
      if (typeof o.model === 'string') checkModelRef(o.model, `models/item/${file}`);
    }
    // Also the base model's own textures.
    for (const t of Object.values(m.textures || {})) {
      if (typeof t === 'string' && !t.startsWith('#')) {
        const tf = textureFile(t);
        if (tf && !fs.existsSync(tf)) fail(`Missing texture: ${t} (used by models/item/${file})`);
      }
    }
  }
}

// ── 5. override without selector = invisible on 1.21.4+ clients ─────────────
for (const item of overrideItems) {
  if (!selectorItems.has(item)) {
    warn(`${item} has models/item overrides but NO assets/minecraft/items/${item}.json — 1.21.4+ clients will show the vanilla item`);
  }
}

// ── All other JSON parses cleanly (sounds, language, etc.) ──────────────────
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (e.name.endsWith('.json')) readJson(full);
  }
}
if (fs.existsSync(ASSETS)) walk(ASSETS);

// ── Report ───────────────────────────────────────────────────────────────────
const rel = path.relative(ROOT, PACK);
if (warnings.length) for (const w of warnings) console.warn(`⚠ ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`✗ ${e}`);
  console.error(`\n${rel}: ${errors.length} error(s), ${warnings.length} warning(s), ${jsonCount} JSON files checked`);
  process.exit(1);
}
console.log(`✓ ${rel}: pack OK (${jsonCount} JSON files, ${selectorItems.size} item selectors, ${overrideItems.size} legacy overrides)`);
