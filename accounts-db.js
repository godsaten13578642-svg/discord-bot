// ── Accounts Database Handler ──────────────────────────────────────
// Manages user accounts, authentication, and account data

const fs = require('fs');
const { hashPassword, verifyPassword } = require('./auth-config');

const ACCOUNTS_DB_FILE = './accounts.json';

let accountsData = {
  accounts: {},           // userId -> { id, email, passwordHash, role, username, serverId, createdAt, lastLogin }
  masterAccount: null,    // ID of master account
  serverOwners: {},       // serverId -> ownerId
  totalAccounts: 0
};

// Load accounts from file
function loadAccounts() {
  try {
    if (fs.existsSync(ACCOUNTS_DB_FILE)) {
      accountsData = JSON.parse(fs.readFileSync(ACCOUNTS_DB_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading accounts:', e.message);
  }
}

// Save accounts to file
function saveAccounts() {
  try {
    fs.writeFileSync(ACCOUNTS_DB_FILE, JSON.stringify(accountsData, null, 2));
  } catch (e) {
    console.error('Error saving accounts:', e.message);
  }
}

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

// Get server owner for a server
function getServerOwner(serverId) {
  const ownerId = accountsData.serverOwners[serverId];
  if (!ownerId) return null;
  return getAccountById(ownerId);
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

// Initialize accounts
loadAccounts();

module.exports = {
  loadAccounts,
  saveAccounts,
  hasMasterAccount,
  createAccount,
  getAccountByEmail,
  getAccountById,
  verifyLogin,
  setServerOwner,
  getMasterAccount,
  getServerOwner,
  resetMasterAccount,
  linkDiscordId,
  getAllAccounts,
  deleteAccount,
  getAccountsData: () => accountsData
};
