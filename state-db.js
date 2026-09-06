// ── Game-State Database Handler ────────────────────────────────────
// Persists the bot's game state (servers, users, civilizations, economy,
// announcements, counters, …) that used to live only in db.json.
//
// Backing store:
//   • DATABASE_URL set  → Postgres (free Neon tier works great). Game state
//     survives Render free-tier deploys/restarts.
//   • no DATABASE_URL   → ./db.json (old behavior, unchanged).
//
// The owning server files construct their in-memory objects from db.json as
// before, then hand this store two callbacks:
//   snapshot() -> the JSON to persist (called on every save)
//   apply(saved) -> merge a loaded snapshot into the live objects (PG only)

const fs = require('fs');

const DATABASE_URL = (process.env.DATABASE_URL || '').trim();

let pgPool = null;
let usingPostgres = false;

if (DATABASE_URL) {
  try {
    const { Pool } = require('pg');
    pgPool = new Pool({
      connectionString: DATABASE_URL,
      ssl: /localhost|127\.0\.0\.1/.test(DATABASE_URL) ? undefined : { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    usingPostgres = true;
    console.log('🗄️  Game-state store: Postgres (DATABASE_URL set)');
  } catch (e) {
    console.error('⚠️  DATABASE_URL is set but the pg driver is unavailable — using db.json instead:', e.message);
  }
} else {
  console.log('🗄️  Game-state store: db.json (file mode)');
}

function createGameStateStore({ file = './db.json', snapshot, apply, debounceMs = 1500 }) {
  let saveTimer = null;
  let readyPromise = null;

  // Resolves once the persisted state has been loaded and merged into the
  // live objects (Postgres mode), or immediately (file mode).
  function whenReady() {
    if (!readyPromise) {
      if (usingPostgres) {
        readyPromise = pgInit()
          .catch(e => {
            console.error('⚠️  Postgres unavailable for game state — falling back to db.json:', e.message);
            usingPostgres = false;
            try { pgPool = null; } catch (_) { /* noop */ }
          })
          .then(() => {});
      } else {
        readyPromise = Promise.resolve();
      }
    }
    return readyPromise;
  }

  // Boot-time saves (Discord ClientReady, the 30s interval) would otherwise
  // write in-memory state — built from the repo's committed db.json — over
  // the real persisted settings before the load/apply finished. Neon free
  // tier autosuspends, so its cold start can lose that race every deploy.
  // Gating ALL writes until the load completes removes the clobber entirely.
  function persist() {
    return whenReady().then(() => {
      if (usingPostgres) {
        return pgSave().catch(e => console.error('❌ Game-state save to Postgres failed:', e.message));
      }
      saveToFile();
    });
  }
  function readLocalFile() {
    try {
      if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      console.error('Error reading', file + ':', e.message);
    }
    return null;
  }

  function saveToFile() {
    try { fs.writeFileSync(file, JSON.stringify(snapshot(), null, 2)); }
    catch (e) { console.error('Game-state save error (file):', e.message); }
  }

  // ── Postgres mode ────────────────────────────────────────────────
  function pgSave() {
    return pgPool.query(
      `INSERT INTO game_state (id, payload, updated_at)
       VALUES (1, $1::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`,
      [JSON.stringify(snapshot())]
    );
  }

  // ── Init: load persisted state, migrating from db.json if needed ──
  async function pgInit() {
    await pgPool.query(
      `CREATE TABLE IF NOT EXISTS game_state (
         id         INTEGER PRIMARY KEY,
         payload    JSONB NOT NULL,
         updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`
    );

    const { rows } = await pgPool.query('SELECT payload FROM game_state WHERE id = 1');

    if (rows.length > 0) {
      apply(rows[0].payload);
      const at = rows[0].payload?.savedAt ? new Date(rows[0].payload.savedAt).toISOString() : 'unknown time';
      console.log(`🗄️  Game state loaded from Postgres (last saved: ${at})`);
    } else {
      // Fresh database: seed it with whatever db.json holds (may be nothing).
      const local = readLocalFile();
      if (local && typeof local === 'object') {
        apply(local);
        await pgSave();
        console.log('📦 Migrated game state from db.json into Postgres');
      } else {
        await pgSave();
        console.log('🗄️  Fresh Postgres game-state store created');
      }
    }
  }

  // Debounced save — drop-in replacement for the old saveDb() body.
  // (whenReady is defined above; persist waits on it to avoid boot clobbers.)
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { persist(); }, debounceMs);
  }

  // Immediate save (used on shutdown) — resolves after the write is issued.
  async function flush() {
    clearTimeout(saveTimer);
    await persist();
  }

  // 30s safety net, same as the old file behavior.
  setInterval(() => { persist(); }, 30_000).unref();

  return {
    scheduleSave,
    flush,
    whenReady,
    isUsingPostgres: () => usingPostgres,
  };
}

module.exports = { createGameStateStore };
