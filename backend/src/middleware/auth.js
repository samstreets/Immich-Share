const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { getDb } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET;
const PLACEHOLDER_SECRETS = [
  'change-me-to-a-long-random-string',
  'change-me-in-production-please-use-a-long-random-string',
];

if (!JWT_SECRET) {
  throw new Error(
    '[auth] JWT_SECRET environment variable is not set. ' +
    'Generate a secret with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
  );
}
if (JWT_SECRET.length < 32) {
  throw new Error(`[auth] JWT_SECRET is too short (${JWT_SECRET.length} chars). Use at least 32 random characters.`);
}
if (PLACEHOLDER_SECRETS.includes(JWT_SECRET)) {
  throw new Error('[auth] JWT_SECRET is still set to a published placeholder value. Generate a real secret.');
}

const JWT_OPTS = { algorithms: ['HS256'] };

// Fingerprint of an admin's credentials, embedded in every token. Changing the
// password or the 2FA setup changes it, which logs out all existing sessions.
function credentialVersion(user) {
  return crypto
    .createHash('sha256')
    .update(`${user.password_hash}|${user.totp_enabled ? user.totp_secret : ''}`)
    .digest('base64url')
    .slice(0, 16);
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET, JWT_OPTS);
    // A pre-auth token only proves the password step; it must never grant access.
    if (payload.preAuth) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    const user = getDb().prepare('SELECT * FROM admin_users WHERE id = ?').get(payload.id);
    if (!user || payload.cv !== credentialVersion(user)) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    req.admin = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** Full admin session token for a row from admin_users. */
function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, cv: credentialVersion(user) },
    JWT_SECRET,
    { expiresIn: '24h', algorithm: 'HS256' }
  );
}

function signPreAuthToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, cv: credentialVersion(user), preAuth: true },
    JWT_SECRET,
    { expiresIn: '5m', algorithm: 'HS256' }
  );
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET, JWT_OPTS);
}

module.exports = { requireAuth, signToken, signPreAuthToken, verifyToken, credentialVersion };
