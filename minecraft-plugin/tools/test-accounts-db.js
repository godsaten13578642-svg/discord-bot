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
if (scenario === 'existing' || scenario === 'owner-rotate') {
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
if (scenario === 'owner-rotate') {
  const stored = fakeDb.get(1);
  stored.accounts.owner_1 = {
    id: 'owner_1', email: 'owner@civbot.admin', passwordHash: null, role: 'master',
    username: 'OfficialOwner', serverId: null, createdAt: new Date().toISOString(),
    lastLogin: null, discordId: null,
  };
  // Hash the OLD password with the real hasher so rotation is provable.
  process.env.OWNER_EMAIL = 'owner@civbot.admin';
  process.env.OWNER_PASSWORD = 'NewSecret#2026';
  const { hashPassword } = require(path.join(__dirname, '..', '..', 'auth-config.js'));
  stored.accounts.owner_1.passwordHash = hashPassword('OldSecret#2025');
  stored.masterAccount = 'owner_1';
}
if (scenario === 'owner-fresh') {
  process.env.OWNER_EMAIL = 'owner@civbot.admin';
  process.env.OWNER_PASSWORD = 'SuperSecret#2026';
}
if (scenario === 'owner-takeover') {
  process.env.OWNER_EMAIL = 'owner@civbot.admin';
  process.env.OWNER_PASSWORD = 'SuperSecret#2026';
  fakeDb.set(1, {
    accounts: {
      first_user_1: {
        id: 'first_user_1', email: 'first@user.dev', passwordHash: 'a:b', role: 'master',
        username: 'First', serverId: null, createdAt: new Date().toISOString(),
        lastLogin: null, discordId: null,
      },
    },
    masterAccount: 'first_user_1',
    serverOwners: { '555': 'first_user_1' },
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
    // Built-in Official Owner is auto-created on boot, so the migrated file
    // user is demoted to 'owner' and the env-less owner is master.
    assert(db.getAllAccounts().length === 2, 'migrated user + auto-created Official Owner');
    assert(db.getMasterAccount()?.email === 'owner@civbot.admin', 'built-in Official Owner is master');
    assert(db.getAccountByEmail('file@user.dev')?.role === 'owner', 'migrated account demoted to owner');
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
    assert(persisted && persisted.accounts[r.userId]?.discordId === 'discord_42' && Object.keys(persisted.accounts).length === 3,
      'mutations persisted to Postgres');
  }

  if (scenario === 'existing') {
    assert(db.isUsingPostgres(), 'Postgres mode active');
    assert(db.getAccountByEmail('db@user.dev') && db.getServerOwner('999')?.id === 'db_user_1',
      'DB payload loaded, local file ignored');
    assert(db.getMasterAccount()?.email === 'owner@civbot.admin', 'built-in Official Owner is master');
  }

  if (scenario === 'down') {
    assert(!db.isUsingPostgres(), 'fell back to file mode when DB unreachable');
    assert(db.getAccountByEmail('file@user.dev'), 'file store loaded as fallback');
    assert(db.getMasterAccount()?.email === 'owner@civbot.admin', 'built-in Official Owner is master');
    assert(db.createAccount('x@y.dev', 'pw', 'X').success, 'file mode still fully functional');
  }

  if (scenario === 'owner-fresh') {
    // Fresh DB; local file user migrates, then the env owner is created on top.
    assert(db.getAllAccounts().length === 2, 'official Owner created alongside migrated user');
    const acc = db.getAccountByEmail('owner@civbot.admin');
    assert(acc && acc.role === 'master' && acc.username === 'OfficialOwner', 'official Owner is master');
    assert(db.getMasterAccount()?.email === 'owner@civbot.admin', 'masterAccount points at official Owner');
    assert(db.verifyLogin('owner@civbot.admin', 'SuperSecret#2026').success, 'env password logs in');
  }

  if (scenario === 'owner-rotate') {
    // DB already has the owner with an old password; env password differs → rotated.
    const acc = db.getAccountByEmail('owner@civbot.admin');
    assert(acc && db.verifyLogin('owner@civbot.admin', 'NewSecret#2026').success, 'password rotated to env value');
    assert(db.getMasterAccount()?.email === 'owner@civbot.admin', 'still master after rotation');
  }

  if (scenario === 'owner-takeover') {
    // DB has a different master already; official Owner takes over, old master demoted.
    assert(db.getMasterAccount()?.email === 'owner@civbot.admin', 'official Owner became master');
    const prev = db.getAccountByEmail('first@user.dev');
    assert(prev.role === 'owner', 'previous master demoted to owner');
    assert(db.verifyLogin('owner@civbot.admin', 'SuperSecret#2026').success, 'owner password works');
  }

  console.log(`— scenario "${scenario}" done —`);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* Windows may hold the dir briefly */ }
}

main().catch(e => { console.error(`❌ [${scenario}] harness crash:`, e); process.exit(1); });
