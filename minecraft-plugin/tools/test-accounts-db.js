// Exercises accounts-db.js Postgres mode with a mocked pg.Pool.
// Scenarios:
//   fresh    — DB empty + accounts.json exists -> migrate + persist writes
//   existing — DB already has a payload -> load it, local file ignored
//   down     — DB unreachable -> graceful fallback to file mode
const Module = require('module');
const fs = require('fs');
const path = require('path');
const os = require('os');

const scenario = process.argv[2];
process.env.DATABASE_URL = 'postgres://fake@localhost:5432/fake';
process.env.JWT_SECRET = 'test-secret';

// Isolated cwd so the real ./accounts.json is never touched
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'acctdb-'));
process.chdir(tmp);

const fakeDb = new Map(); // id -> payload
if (scenario === 'existing') {
  fakeDb.set(1, {
    accounts: {
      db_user_1: {
        id: 'db_user_1', email: 'db@user.dev', passwordHash: 'x:y', role: 'master',
        username: 'DbUser', serverId: null, createdAt: new Date().toISOString(),
        lastLogin: null, discordId: null,
      },
    },
    masterAccount: 'db_user_1',
    serverOwners: { '999': 'db_user_1' },
    totalAccounts: 1,
  });
}

{
  fs.writeFileSync(path.join(tmp, 'accounts.json'), JSON.stringify({
    accounts: {
      file_user_1: {
        id: 'file_user_1', email: 'file@user.dev', passwordHash: 'a:b', role: 'master',
        username: 'FileUser', serverId: null, createdAt: new Date().toISOString(),
        lastLogin: null, discordId: null,
      },
    },
    masterAccount: 'file_user_1', serverOwners: {}, totalAccounts: 1,
  }));
}

// Intercept require('pg') before accounts-db.js loads
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
          if (/INSERT INTO accounts_state/.test(sql)) { fakeDb.set(1, JSON.parse(params[0])); return { rows: [] }; }
          throw new Error('Unexpected SQL: ' + sql.slice(0, 60));
        }
        end() {}
      },
    };
  }
  return origLoad.call(this, request, parent, isMain);
};

const db = require(path.join(__dirname, '..', '..', 'accounts-db.js'));

function assert(cond, label) {
  if (!cond) { console.error(`❌ FAIL [${scenario}] ${label}`); process.exitCode = 1; }
  else console.log(`✅ [${scenario}] ${label}`);
}

async function main() {
  await db.whenReady();

  if (scenario === 'fresh') {
    assert(db.isUsingPostgres(), 'Postgres mode active');
    assert(db.getAllAccounts().length === 1, 'migrated 1 account from accounts.json');
    assert(db.getAllAccounts()[0].role === 'master', 'migrated account became master');
    const r = db.createAccount('new@user.dev', 'pw123456', 'NewUser');
    assert(r.success, 'createAccount works');
    const login = db.verifyLogin('new@user.dev', 'pw123456');
    assert(login.success, 'verifyLogin works');
    db.setServerOwner(r.userId, 'srv_1');
    assert(db.getOwnedServerIds(r.userId).includes('srv_1'), 'setServerOwner/getOwnedServerIds work');
    db.linkDiscordId(r.userId, 'discord_42');
    assert(db.getAccountById(r.userId).discordId === 'discord_42', 'linkDiscordId works');
    const second = db.createAccount('del@user.dev', 'pw654321', 'Doomed');
    assert(second.success && second.isMasterAccount === false, 'second account is not master');
    const del = db.deleteAccount(second.userId);
    assert(del.success && !db.getAccountById(second.userId), 'deleteAccount works for non-master');
    await new Promise(set => setImmediate(set));
    const persisted = fakeDb.get(1);
    assert(persisted && persisted.accounts[r.userId]?.discordId === 'discord_42' && Object.keys(persisted.accounts).length === 2,
      'mutations persisted to Postgres');
  }

  if (scenario === 'existing') {
    assert(db.isUsingPostgres(), 'Postgres mode active');
    assert(db.getAllAccounts().length === 1 && db.getAllAccounts()[0].email === 'db@user.dev',
      'DB payload loaded, local file ignored');
    assert(db.getServerOwner('999')?.id === 'db_user_1', 'serverOwners map restored');
  }

  if (scenario === 'down') {
    assert(!db.isUsingPostgres(), 'fell back to file mode when DB unreachable');
    assert(db.getAllAccounts().length === 1, 'file store loaded as fallback');
    assert(db.createAccount('x@y.dev', 'pw', 'X').success, 'file mode still fully functional');
  }

  console.log(`— scenario "${scenario}" done —`);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* Windows may hold the dir briefly */ }
}

main().catch(e => { console.error(`❌ [${scenario}] harness crash:`, e); process.exit(1); });
