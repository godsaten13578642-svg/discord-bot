// ── Authentication Configuration ──────────────────────────────────────
// This file handles all authentication logic, user roles, and permissions

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Generate a secure secret key for JWT (change this in production!)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const TOKEN_EXPIRY = '7d'; // Token expires in 7 days

// Hash password using SHA256 + salt
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

// Verify password
function verifyPassword(password, storedHash) {
  const [salt, hash] = storedHash.split(':');
  const hashToCheck = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hash === hashToCheck;
}

// Generate JWT token
function generateToken(userId, role, serverId = null) {
  return jwt.sign(
    { userId, role, serverId, createdAt: Date.now() },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

// Verify JWT token
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

// User Roles
const ROLES = {
  MASTER: 'master',        // System administrator (you)
  SERVER_OWNER: 'owner',   // Individual server owner
  PLAYER: 'player'         // Regular player/member
};

// Permission levels
const PERMISSIONS = {
  master: ['all'],
  owner: ['manage_server', 'manage_members', 'view_economy', 'create_groups'],
  player: ['view_profile', 'join_groups', 'participate_events']
};

// Check if user has permission
function hasPermission(role, permission) {
  const userPerms = PERMISSIONS[role] || [];
  return userPerms.includes('all') || userPerms.includes(permission);
}

// Middleware to verify authentication token
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.body?.token;
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = decoded;
  next();
}

// Middleware to check role
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = {
  JWT_SECRET,
  TOKEN_EXPIRY,
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  ROLES,
  PERMISSIONS,
  hasPermission,
  authMiddleware,
  requireRole
};
