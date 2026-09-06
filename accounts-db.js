// ── Accounts Database Handler ──────────────────────────────────────
// Manages user accounts, authentication, and account data.
//
// Backing store:
//   • DATABASE_URL set  → Postgres (free Neon tier works great). Data
//     survives Render free-tier deploys/restarts.
//   • no DATABASE_URL   → ./accounts.json (local dev / old behavior).
//
// The exported API stays synchronous either way (writes in Postgres
// mode are fire-and-forget, serialized by the DB row lock).
//
// First connect auto-migrates: if the database is empty and a local
// accounts.json exists, its accounts are imported. Once the DB has
// data, it always wins over the file.

const fs = require('fs');
const { hashPassword, verifyPassword } = require('./auth-config');

const ACCOUNTS_DB_FILE = './accounts.json';
const DATABASE_URL = (process.env.DATABASE_URL || '').trim();

const EMPTY_STORE = () => ({
  accounts: {},           // userId -> { id, email, passwordHash, role, username, serverId, createdAt, lastLogin }
  masterAccount: null,    // ID of master account
  serverOwners: {},       // serverId -> ownerId
  totalAccounts: 0
});

let accountsData = EMPTY_STORE();

// ── Postgres setup ─────────────────────────────────────────────────
let pgPool = null;
let usingPostgres = false;
let readyPromise = null;

if (DATABASE_URL) {
  try {
    const { Pool } = require('pg');
    pgPool = new Pool({
      connectionString: DATABASE_URL,
      // Neon (and most managed Postgres) require SSL; local sockets don't.
      ssl: /localhost|127\.0\.0\.1/.test(DATABASE_URL) ? undefined : { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    usingPostgres = true;
    console.log('🗄️  Accounts store: Postgres (DATABASE_URL set)');
  } catch (e) {
    console.error('⚠️  DATABASE_URL is set but the pg driver is unavailable — using accounts.json instead:', e.message);
  }
} else {
  console.log('🗄️  Accounts store: accounts.json (file mode)');
}

// ── File-mode helpers ──────────────────────────────────────────────
function readLocalFile() {
  try {
    if (fs.existsSync(ACCOUNTS_DB_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(ACCOUNTS_DB_FILE, 'utf8'));
      return {
        accounts: parsed.accounts || {},
        masterAccount: parsed.masterAccount ?? null,
        serverOwners: parsed.serverOwners || {},
        totalAccounts: Object.keys(parsed.accounts || {}).length,
      };
    }
  } catch (e) {
    console.error('Error reading accounts.json:', e.message);
  }
  return EMPTY_STORE();
}

// Load accounts from file (file mode / fallback seed)
function loadAccounts() {
  accountsData = readLocalFile();
}

// Save accounts to file
function saveAccountsToFile() {
  try {
    fs.writeFileSync(ACCOUNTS_DB_FILE, JSON.stringify(accountsData, null, 2));
  } catch (e) {
    console.error('Error saving accounts:', e.message);
  }
}

// ── Official Owner (boot-time, guaranteed) ─────────────────────────
// This account always exists and is always the master. Credentials come from
// OWNER_EMAIL/OWNER_PASSWORD when set; otherwise these built-in defaults are
// used, so the owner login works even on services created before the env vars
// were added to the blueprint. Runs on every start — idempotent, only writes
// when something actually changed.
const OWNER_EMAIL = (process.env.OWNER_EMAIL || 'owner@civbot.admin').trim();
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || '7FisKNGA!R2AZ7VRA#4730';
const OWNER_USERNAME = (process.env.OWNER_USERNAME || 'OfficialOwner').trim() || 'OfficialOwner';

function ensureOfficialOwner() {
  if (!OWNER_EMAIL || !OWNER_PASSWORD) return;
  if (OWNER_PASSWORD.length < 8) {
    console.error('⚠️  OWNER_PASSWORD must be at least 8 characters — official Owner account NOT created.');
    return;
  }

  let account = getAccountByEmail(OWNER_EMAIL);
  if (!account) {
    const userId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    account = {
      id: userId,
      email: OWNER_EMAIL,
      passwordHash: hashPassword(OWNER_PASSWORD),
      role: 'master',
      username: OWNER_USERNAME,
      serverId: null,
      createdAt: new Date().toISOString(),
      lastLogin: null,
      discordId: null,
    };
    accountsData.accounts[userId] = account;
    accountsData.totalAccounts++;
    console.log(`👑 Official Owner account created: ${OWNER_EMAIL}`);
  } else if (!verifyPassword(OWNER_PASSWORD, account.passwordHash)) {
    // Exists but password drifted (env rotated) — sync it to the env value.
    account.passwordHash = hashPassword(OWNER_PASSWORD);
    console.log(`🔑 Official Owner password rotated from OWNER_PASSWORD env`);
  }

  // The official Owner is always the master. A previous master (if any) is
  // demoted to 'owner' so it keeps its server access.
  const previousMasterId = accountsData.masterAccount;
  if (previousMasterId && previousMasterId !== account.id) {
    const prev = getAccountById(previousMasterId);
    if (prev && prev.role === 'master') prev.role = 'owner';
    console.log(`👑 Master transferred to the official Owner (previous master: ${prev?.email || previousMasterId} → role 'owner')`);
  }
  account.role = 'master';
  accountsData.masterAccount = account.id;
  saveAccounts();
}

// ── Postgres helpers ───────────────────────────────────────────────
// Upsert keeps this safe even if a request sneaks in before init finishes.
function pgSave() {
  return pgPool.query(
    `INSERT INTO accounts_state (id, payload, updated_at)
     VALUES (1, $1::jsonb, now())
     ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`,
    [JSON.stringify(accountsData)]
  );
}

function normalizeStore(stored) {
  const accounts = stored?.accounts || {};
  return {
    accounts,
    masterAccount: stored?.masterAccount ?? null,
    serverOwners: stored?.serverOwners || {},
    totalAccounts: Object.keys(accounts).length,
  };
}

async function pgInit() {
  await pgPool.query(
    `CREATE TABLE IF NOT EXISTS accounts_state (
       id         INTEGER PRIMARY KEY,
       payload    JSONB NOT NULL,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`
  );

  const { rows } = await pgPool.query('SELECT payload FROM accounts_state WHERE id = 1');

  if (rows.length > 0) {
    accountsData = normalizeStore(rows[0].payload);

    // One-time migration: DB exists but is empty while the local file
    // has accounts (e.g. you just created the Neon database) → import.
    if (Object.keys(accountsData.accounts).length === 0) {
      const local = readLocalFile();
      if (Object.keys(local.accounts).length > 0) {
        accountsData = local;
        await pgSave();
        console.log(`📦 Migrated ${local.totalAccounts} account(s) from accounts.json into Postgres`);
      }
    }
    console.log(`🗄️  Accounts loaded from Postgres (${Object.keys(accountsData.accounts).length} account(s))`);
  } else {
    // Fresh database: seed it with whatever accounts.json holds (may be none).
    accountsData = readLocalFile();
    await pgSave();
    if (accountsData.totalAccounts > 0) {
      console.log(`📦 Migrated ${accountsData.totalAccounts} account(s) from accounts.json into Postgres`);
    } else {
      console.log('🗄️  Fresh Postgres accounts store created');
    }
  }
}

// Resolve once the store is fully loaded/migrated. Await this at startup
// (before server.listen) so no request ever sees an empty store.
function whenReady() {
    if (!readyPromise) {
      if (usingPostgres) {
        readyPromise = pgInit()
          .then(() => ensureOfficialOwner())
          .catch(e => {
            console.error('⚠️  Postgres unavailable — falling back to accounts.json:', e.message);
            usingPostgres = false;
            try { pgPool = null; } catch (_) { /* noop */ }
            loadAccounts();
            ensureOfficialOwner();
          });
      } else {
        readyPromise = Promise.resolve().then(() => ensureOfficialOwner());
      }
    }
    return readyPromise;
  }

// Save accounts (synchronous API; Postgres writes are fire-and-forget)
function saveAccounts() {
  if (usingPostgres) {
    pgSave().catch(e => console.error('❌ Accounts save to Postgres failed:', e.message));
    return;
  }
  saveAccountsToFile();
}

// ── Account operations (unchanged behavior) ────────────────────────

// Check if master account exists
function hasMasterAccount() {
  return accountsData.masterAccount !== null && accountsData.accounts[accountsData.masterAccount];
}

// Create new account
function createAccount(email, password, username, role = 'player', serverId = null) {
  // Check if email already exists
  if (Object.values(accountsData.accounts).some(acc => acc.email === email)) {
    return { error: 'Email already registered' };
  }

  const userId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  // First account becomes master
  const isMasterAccount = !hasMasterAccount();
  const finalRole = isMasterAccount ? 'master' : role;

  accountsData.accounts[userId] = {
    id: userId,
    email,
    passwordHash: hashPassword(password),
    role: finalRole,
    username,
    serverId: serverId || null,
    createdAt: new Date().toISOString(),
    lastLogin: null,
    discordId: null
  };

  if (isMasterAccount) {
    accountsData.masterAccount = userId;
    console.log(`👑 MASTER ACCOUNT CREATED: ${email}`);
  }

  accountsData.totalAccounts++;
  saveAccounts();

  return { success: true, userId, isMasterAccount, role: finalRole };
}

// Get account by email
function getAccountByEmail(email) {
  return Object.values(accountsData.accounts).find(acc => acc.email === email);
}

// Get account by ID
function getAccountById(userId) {
  return accountsData.accounts[userId] || null;
}

// Verify login credentials
function verifyLogin(email, password) {
  const account = getAccountByEmail(email);
  if (!account) {
    return { error: 'Account not found' };
  }

  if (!verifyPassword(password, account.passwordHash)) {
    return { error: 'Invalid password' };
  }

  // Update last login
  account.lastLogin = new Date().toISOString();
  saveAccounts();

  return { success: true, account };
}

// Set account as server owner
function setServerOwner(userId, serverId) {
  const account = getAccountById(userId);
  if (!account) {
    return { error: 'User not found' };
  }

  if (account.role === 'player') {
    account.role = 'owner';
  }

  // Keep the legacy serverId field for compatibility, while allowing an
  // owner to be assigned more than one server.
  const ownedServerIds = Array.isArray(account.serverIds) ? account.serverIds : (account.serverId ? [account.serverId] : []);
  if (!ownedServerIds.includes(serverId)) ownedServerIds.push(serverId);
  account.serverIds = ownedServerIds;
  account.serverId = serverId;
  accountsData.serverOwners[serverId] = userId;
  saveAccounts();

  return { success: true };
}

// Get master account
function getMasterAccount() {
  if (!accountsData.masterAccount) return null;
  return getAccountById(accountsData.masterAccount);
}

function transferMasterAccount(newMasterId) {
  const newMaster = getAccountById(newMasterId);
  if (!newMaster) return { error: 'Target account not found' };
  if (newMasterId === accountsData.masterAccount) return { error: 'Account is already the master' };

  const oldMasterId = accountsData.masterAccount;
  const oldMaster = oldMasterId ? getAccountById(oldMasterId) : null;

  newMaster.role = 'master';
  accountsData.masterAccount = newMasterId;
  if (oldMaster) oldMaster.role = 'player';

  saveAccounts();
  return { success: true, oldMasterId, newMasterId };
}

// Get server owner for a server
function getServerOwner(serverId) {
  const ownerId = accountsData.serverOwners[serverId];
  if (!ownerId) return null;
  return getAccountById(ownerId);
}

function getOwnedServerIds(userId) {
  const account = getAccountById(userId);
  const owned = new Set();

  if (account?.serverId) owned.add(account.serverId);
  if (Array.isArray(account?.serverIds)) {
    account.serverIds.forEach(serverId => owned.add(serverId));
  }

  Object.entries(accountsData.serverOwners || {}).forEach(([serverId, ownerId]) => {
    if (ownerId === userId) owned.add(serverId);
  });

  return [...owned];
}

// Reset master account (console command)
function resetMasterAccount() {
  if (!accountsData.masterAccount) {
    return { error: 'No master account to reset' };
  }

  const oldMasterId = accountsData.masterAccount;
  delete accountsData.accounts[oldMasterId];
  accountsData.masterAccount = null;
  accountsData.totalAccounts = Math.max(0, accountsData.totalAccounts - 1);
  saveAccounts();

  console.log(`🔄 MASTER ACCOUNT RESET - Old ID: ${oldMasterId}`);
  return { success: true, message: 'Master account has been reset. Next signup will create new master account.' };
}

// Link Discord ID to account
function linkDiscordId(userId, discordId) {
  const account = getAccountById(userId);
  if (!account) {
    return { error: 'User not found' };
  }

  account.discordId = discordId;
  saveAccounts();
  return { success: true };
}

// Get all accounts (master only)
function getAllAccounts() {
  return Object.values(accountsData.accounts);
}

// Delete account (master only)
function deleteAccount(userId) {
  if (userId === accountsData.masterAccount) {
    return { error: 'Cannot delete master account directly. Use resetMasterAccount()' };
  }

  delete accountsData.accounts[userId];
  accountsData.totalAccounts = Math.max(0, accountsData.totalAccounts - 1);

  // Remove from server owners if applicable
  Object.keys(accountsData.serverOwners).forEach(serverId => {
    if (accountsData.serverOwners[serverId] === userId) {
      delete accountsData.serverOwners[serverId];
    }
  });

  saveAccounts();
  return { success: true };
}

// Initialize accounts (file seed; Postgres data replaces it in whenReady)
loadAccounts();

module.exports = {
  whenReady,
  isUsingPostgres: () => usingPostgres,
  loadAccounts,
  saveAccounts,
  hasMasterAccount,
  createAccount,
  getAccountByEmail,
  getAccountById,
  verifyLogin,
  setServerOwner,
  getMasterAccount,
  transferMasterAccount,
  getServerOwner,
  getOwnedServerIds,
  resetMasterAccount,
  linkDiscordId,
  getAllAccounts,
  deleteAccount,
  getAccountsData: () => accountsData
};
