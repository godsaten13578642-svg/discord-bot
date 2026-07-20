// ── Authentication API Endpoints ──────────────────────────────────────
// Add these routes to your Express server (server.js)

const express = require('express');
const {
  createAccount,
  verifyLogin,
  getAccountById,
  getMasterAccount,
  resetMasterAccount,
  linkDiscordId,
  getAllAccounts,
  deleteAccount,
  setServerOwner
} = require('./accounts-db');
const {
  generateToken,
  authMiddleware,
  requireRole
} = require('./auth-config');

const router = express.Router();

// Public endpoints

// Sign up (first signup becomes master account)
router.post('/api/auth/signup', (req, res) => {
  const { email, password, username } = req.body;

  if (!email || !password || !username) {
    return res.status(400).json({ error: 'Email, password, and username required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const result = createAccount(email, password, username);

  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  const token = generateToken(result.userId, result.role);
  const account = getAccountById(result.userId);

  res.json({
    success: true,
    userId: result.userId,
    token,
    role: result.role,
    username: account.username,
    isMasterAccount: result.isMasterAccount,
    message: result.isMasterAccount ? 'Master account created!' : 'Account created!'
  });
});

// Login
router.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const result = verifyLogin(email, password);

  if (result.error) {
    return res.status(401).json({ error: result.error });
  }

  const token = generateToken(result.account.id, result.account.role);

  res.json({
    success: true,
    userId: result.account.id,
    token,
    role: result.account.role,
    username: result.account.username,
    email: result.account.email
  });
});

// Get current user info (requires auth)
router.get('/api/auth/me', authMiddleware, (req, res) => {
  const account = getAccountById(req.user.userId);

  if (!account) {
    return res.status(404).json({ error: 'Account not found' });
  }

  res.json({
    id: account.id,
    email: account.email,
    username: account.username,
    role: account.role,
    serverId: account.serverId,
    discordId: account.discordId,
    createdAt: account.createdAt,
    lastLogin: account.lastLogin
  });
});

// Master-only endpoints

// Get all accounts
router.get('/api/auth/accounts', authMiddleware, requireRole('master'), (req, res) => {
  const accounts = getAllAccounts().map(acc => ({
    id: acc.id,
    email: acc.email,
    username: acc.username,
    role: acc.role,
    serverId: acc.serverId,
    discordId: acc.discordId,
    createdAt: acc.createdAt,
    lastLogin: acc.lastLogin
  }));

  res.json(accounts);
});

// Get master account info
router.get('/api/auth/master', authMiddleware, requireRole('master'), (req, res) => {
  const master = getMasterAccount();

  if (!master) {
    return res.status(404).json({ error: 'No master account found' });
  }

  res.json({
    id: master.id,
    email: master.email,
    username: master.username,
    role: master.role,
    createdAt: master.createdAt,
    lastLogin: master.lastLogin
  });
});

// Reset master account
router.post('/api/auth/reset-master', authMiddleware, requireRole('master'), (req, res) => {
  const result = resetMasterAccount();

  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  res.json({
    success: true,
    message: result.message
  });
});

// Delete an account (master only)
router.delete('/api/auth/accounts/:userId', authMiddleware, requireRole('master'), (req, res) => {
  const { userId } = req.params;

  const result = deleteAccount(userId);

  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  res.json({ success: true, message: 'Account deleted' });
});

// Promote player to server owner
router.post('/api/auth/promote-owner', authMiddleware, (req, res) => {
  const { userId, serverId } = req.body;

  // Check if requester is master or owner of that server
  if (req.user.role !== 'master') {
    return res.status(403).json({ error: 'Only master can promote users' });
  }

  if (!userId || !serverId) {
    return res.status(400).json({ error: 'userId and serverId required' });
  }

  const result = setServerOwner(userId, serverId);

  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  res.json({ success: true, message: 'User promoted to server owner' });
});

// Link Discord ID to account
router.post('/api/auth/link-discord', authMiddleware, (req, res) => {
  const { discordId } = req.body;

  if (!discordId) {
    return res.status(400).json({ error: 'discordId required' });
  }

  const result = linkDiscordId(req.user.userId, discordId);

  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  res.json({ success: true, message: 'Discord account linked' });
});

module.exports = router;
