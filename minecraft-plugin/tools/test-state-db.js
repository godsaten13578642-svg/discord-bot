// Exercises state-db.js Postgres mode with a mocked pg.Pool.
// Scenarios:
//   fresh    — DB empty + local db.json exists -> migrate via apply() + persist
//   existing — DB already has a payload -> apply() receives it, file ignored
//   down     — DB unreachable -> graceful fallback to file mode
const Module = require('module');
const fs = require('fs');
const path = require('path');
const os = require('os');

const scenario = process.argv[2];
process.env.DATABASE_URL = 'postgres://fake@localhost:5432/fake';

// Isolated cwd so the real ./db.json is never touched
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'statedb-'));
process.chdir(tmp);

const FILE_STATE = { servers: { '111': { serverId: '111', serverName: 'FromFile' } }, counters: { civ: 7 } };
fs.writeFileSync(path.join(tmp, 'db.json'), JSON.stringify(FILE_STATE));

const fakeDb = new Map(); // id -> payload
if (scenario === 'existing') {
  fakeDb.set(1, { servers: { '222': { serverId: '222', serverName: 'FromDb' } }, counters: { civ: 42 }, savedAt: '2026-09-06T00:00:00.000Z' });
}

let appliedPayload = null; // what apply() last received

// Intercept require('pg') before state-db.js loads
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'pg') {
    return {
      Pool: class FakePool {
        constructor() {}
        async query(sql, params) {
          if (scenario === 'down') throw new Error('connect ECONNREFUSED (simulated)');
          if (/CREATE TABLE/.test(sql)) return { rows: [] };
          if (/SELECT payload/.test(sql)) {
            return fakeDb.has(1) ? { rows: [{ payload: fakeDb.get(1) }] } : { rows: [] };
          }
          if (/INSERT INTO game_state/.test(sql)) { fakeDb.set(1, JSON.parse(params[0])); return { rows: [] }; }
          throw new Error('Unexpected SQL: ' + sql.slice(0, 60));
        }
        end() {}
      },
    };
  }
  return origLoad.call(this, request, parent, isMain);
};

const { createGameStateStore } = require(path.join(__dirname, '..', '..', 'state-db.js'));

function assert(cond, label) {
  if (!cond) { console.error(`❌ FAIL [${scenario}] ${label}`); process.exitCode = 1; }
  else console.log(`✅ [${scenario}] ${label}`);
}

const store = createGameStateStore({
  file: './db.json',
  snapshot: () => ({ servers: { '999': { serverId: '999', serverName: 'LiveNow' } }, counters: { civ: 99 }, savedAt: new Date().toISOString() }),
  apply(saved) { appliedPayload = saved; },
});

async function main() {
  if (scenario !== 'norace') await store.whenReady(); // norace manages readiness itself

  if (scenario === 'fresh') {
    assert(store.isUsingPostgres(), 'Postgres mode active');
    assert(appliedPayload?.servers?.['111']?.serverName === 'FromFile', 'db.json migrated into apply()');
    await new Promise(r => setTimeout(r, 50));
    store.scheduleSave(); // debounced 1.5s
    await new Promise(r => setTimeout(r, 1700));
    const persisted = fakeDb.get(1);
    assert(persisted?.servers?.['999']?.serverName === 'LiveNow', 'snapshot persisted to Postgres after debounce');
    assert(persisted?.counters?.civ === 99, 'counters persisted');
    await store.flush();
  }

  if (scenario === 'existing') {
    assert(store.isUsingPostgres(), 'Postgres mode active');
    assert(appliedPayload?.servers?.['222']?.serverName === 'FromDb', 'DB payload loaded via apply(), file ignored');
  }

  if (scenario === 'down') {
    assert(!store.isUsingPostgres(), 'fell back to file mode when DB unreachable');
    store.scheduleSave();
    await new Promise(r => setTimeout(r, 1700));
    const written = JSON.parse(fs.readFileSync('./db.json', 'utf8'));
    assert(written.servers['999']?.serverName === 'LiveNow', 'file mode still persists snapshots');
  }

  if (scenario === 'norace') {
    // Regression: scheduleSave() fired BEFORE the (slow) DB load completes
    // must not lose the stored settings. Mirrors the real server: snapshot()
    // reads live objects that apply() mutates when the load lands.
    let applied = false;
    const live = { servers: { '000': { serverId: '000', serverName: 'RepoDefaults' } }, counters: { civ: 1 } };
    fakeDb.set(1, { servers: { '777': { serverId: '777', serverName: 'SavedSettings' } }, counters: { civ: 55 }, savedAt: '2026-09-06T00:00:00.000Z' });
    const slow = createGameStateStore({
      file: './db.json',
      snapshot: () => ({ ...live, savedAt: new Date().toISOString() }),
      apply(saved) {
        applied = true;
        live.servers = saved.servers || live.servers;   // server.js does exactly this
        Object.assign(live.counters, saved.counters || {});
      },
      debounceMs: 10,
    });
    slow.scheduleSave();          // simulates ClientReady firing early
    await new Promise(r => setTimeout(r, 150)); // debounce + DB load long past
    const after = fakeDb.get(1);
    assert(after.servers['777']?.serverName === 'SavedSettings', 'stored settings survived the early save');
    assert(after.servers['000'] === undefined, 'repo defaults were not written over the DB');
    assert(after.counters?.civ === 55, 'stored counters survived');
    assert(applied, 'stored settings were applied once the load completed');
  }

  console.log(`— scenario "${scenario}" done —`);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* Windows may hold the dir */ }
}

main().catch(e => { console.error(`❌ [${scenario}] harness crash:`, e); process.exit(1); });
