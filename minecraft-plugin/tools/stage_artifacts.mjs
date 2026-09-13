// Stages the newest plugin jar + resource-pack zip into minecraft-plugin/artifacts/
// and writes manifest.json describing them. The server serves them at
// /downloads/plugin and /downloads/pack; the dashboard's Minecraft tab renders
// them as download buttons (GET /api/downloads).
//
// Gracefully stages whatever exists (Render has no Java/Maven, so the jar
// comes from the repo copy). Never fails a deployment.
//
// Local full refresh:  mvn -q package -DskipTests && node tools/stage_artifacts.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const PLUGIN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACTS = path.join(PLUGIN_DIR, 'artifacts');

function sha1(p) {
  return crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex');
}

function fmtSize(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  if (bytes >= 1024) return Math.round(bytes / 1024) + ' KB';
  return bytes + ' B';
}

fs.mkdirSync(ARTIFACTS, { recursive: true });

// ── Plugin jar ──────────────────────────────────────────────────────────────
// Prefer the shaded/final jar from a fresh local build; fall back to the copy
// committed in the repo (Render builds can't run Maven).
// NOTE: selection is by PARSED VERSION, not mtime — on a fresh clone (Render)
// every file has the same checkout timestamp, and an mtime tie would silently
// pick CivBridge-1.0.0.jar over 1.1.0 (alphabetical). Been there, fixed that.
const parseVer = name => (name.match(/CivBridge-([\d.]+)\.jar/) || [])[1] || '';
const verKey = v => v.split('.').map(n => parseInt(n, 10) || 0);
const targetDir = path.join(PLUGIN_DIR, 'target');
const candidates = fs.existsSync(targetDir)
  ? fs.readdirSync(targetDir)
      .filter(f => f.startsWith('CivBridge-') && f.endsWith('.jar') && !f.startsWith('original-'))
      .sort((a, b) => {
        const va = verKey(parseVer(a)), vb = verKey(parseVer(b));
        for (let i = 0; i < Math.max(va.length, vb.length); i++) {
          const d = (va[i] || 0) - (vb[i] || 0);
          if (d) return -d; // higher version first
        }
        return fs.statSync(path.join(targetDir, b)).mtimeMs - fs.statSync(path.join(targetDir, a)).mtimeMs;
      })
  : [];

let jar = null;
if (candidates.length) {
  jar = { from: path.join(targetDir, candidates[0]), name: candidates[0] };
  console.log('  (target jar picked:', candidates[0] + ')');
} else {
  const committed = path.join(ARTIFACTS, 'CivBridge.jar');
  if (fs.existsSync(committed)) jar = { from: committed, name: 'CivBridge.jar (from repo)' };
}

let plugin = null;
if (jar) {
  const dest = path.join(ARTIFACTS, 'CivBridge.jar');
  fs.copyFileSync(jar.from, dest);
  const st = fs.statSync(dest);
  plugin = {
    file: 'CivBridge.jar',
    sizeBytes: st.size,
    size: fmtSize(st.size),
    sha1: sha1(dest),
    builtAt: st.mtime.toISOString(),
    version: (jar.name.match(/CivBridge-([\d.]+)\.jar/) || [])[1] || '1.1.0',
  };
  console.log('✓ plugin jar :', plugin.file, plugin.size, 'v' + plugin.version);
} else {
  console.warn('⚠ no plugin jar found (build with Maven, or commit minecraft-plugin/artifacts/CivBridge.jar)');
}

// ── Resource pack ───────────────────────────────────────────────────────────
// civbridge-pack.zip covers sabers + infinity + fandom. lightsabers.zip is the
// legacy saber-only pack — prefer civbridge-pack, keep whichever exists.
// Validate BEFORE staging: a pack that fails client-style chain validation
// must not reach the website's download endpoint.
const { spawnSync } = await import('node:child_process');
const zipsToCheck = ['civbridge-pack.zip', 'lightsabers.zip']
  .map(n => path.join(PLUGIN_DIR, 'resource-pack', n))
  .filter(p => fs.existsSync(p));
if (zipsToCheck.length) {
  const r = spawnSync(process.execPath,
    [path.join(PLUGIN_DIR, 'tools', 'check_pack_chains.mjs'), ...zipsToCheck],
    { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error('✗ resource pack failed chain validation — NOT staging it (website keeps serving the last good pack).');
    process.exit(1);
  }
}
let pack = null;
for (const name of ['civbridge-pack.zip', 'lightsabers.zip']) {
  const src = path.join(PLUGIN_DIR, 'resource-pack', name);
  if (fs.existsSync(src)) {
    const dest = path.join(ARTIFACTS, 'civbridge-pack.zip');
    fs.copyFileSync(src, dest);
    const st = fs.statSync(dest);
    pack = {
      file: 'civbridge-pack.zip',
      sizeBytes: st.size,
      size: fmtSize(st.size),
      sha1: sha1(dest),
      updatedAt: st.mtime.toISOString(),
    };
    console.log('✓ pack       :', pack.file, pack.size);
    break;
  }
}
if (!pack) console.warn('⚠ no resource pack zip found (run tools/build_resource_pack.mjs)');

// ── Manifest ────────────────────────────────────────────────────────────────
const manifest = {
  generatedAt: new Date().toISOString(),
  plugin,
  pack,
};
fs.writeFileSync(path.join(ARTIFACTS, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('✓ manifest   : artifacts/manifest.json');
