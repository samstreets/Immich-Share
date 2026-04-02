require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error(
    '[auth] JWT_SECRET environment variable is not set. ' +
    'Generate a secret with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
  );
}

if (JWT_SECRET.length < 32) {
  throw new Error(
    `[auth] JWT_SECRET is too short (${JWT_SECRET.length} chars). ` +
    'Use at least 32 random characters.'
  );
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.admin = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

// POST /api/auth/login
// If TOTP is enabled the response includes { totpRequired: true } and a
// short-lived pre-auth token instead of a full admin token.  The client
// must then call POST /api/auth/totp-verify with that pre-auth token + code.
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (user.totp_enabled && user.totp_secret) {
    // Issue a short-lived pre-auth token so the TOTP step can be authenticated
    const preToken = jwt.sign(
      { id: user.id, username: user.username, preAuth: true },
      JWT_SECRET,
      { expiresIn: '5m' }
    );
    return res.json({ totpRequired: true, preToken });
  }

  const token = signToken({ id: user.id, username: user.username });
  res.json({ token, username: user.username });
});

// POST /api/auth/totp-verify  — second factor after password
router.post('/totp-verify', (req, res) => {
  const { preToken, code } = req.body;
  if (!preToken || !code) {
    return res.status(400).json({ error: 'preToken and code are required' });
  }

  let payload;
  try {
    payload = jwt.verify(preToken, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Pre-auth token invalid or expired' });
  }

  if (!payload.preAuth) {
    return res.status(401).json({ error: 'Invalid pre-auth token' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(payload.id);
  if (!user || !user.totp_secret) {
    return res.status(401).json({ error: 'TOTP not configured' });
  }

  let totp;
  try { totp = require('otplib').totp; } catch {
    return res.status(500).json({ error: 'otplib not installed' });
  }

  if (!totp.check(code.replace(/\s/g, ''), user.totp_secret)) {
    return res.status(401).json({ error: 'Invalid TOTP code' });
  }

  const token = signToken({ id: user.id, username: user.username });
  res.json({ token, username: user.username });
});

// POST /api/auth/totp-enroll  — generate a new secret and return QR code URI
router.post('/totp-enroll', requireAuth, async (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.admin.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (user.totp_enabled) {
    return res.status(409).json({ error: 'TOTP is already enabled. Disable it first.' });
  }

  let authenticator, QRCode;
  try {
    authenticator = require('otplib').authenticator;
    QRCode = require('qrcode');
  } catch {
    return res.status(500).json({ error: 'otplib/qrcode not installed — run npm install' });
  }

  const secret = authenticator.generateSecret();
  const appName = (() => {
    try {
      const row = db.prepare("SELECT value FROM settings WHERE key = 'app_name'").get();
      return row?.value || 'ImmichShare';
    } catch { return 'ImmichShare'; }
  })();

  const otpauth = authenticator.keyuri(user.username, appName, secret);
  const qrDataUrl = await QRCode.toDataURL(otpauth);

  // Store the secret but don't enable yet — user must confirm with a valid code
  db.prepare('UPDATE admin_users SET totp_secret = ? WHERE id = ?').run(secret, user.id);

  res.json({ secret, otpauth, qrDataUrl });
});

// POST /api/auth/totp-confirm  — confirm enrollment with a valid code
router.post('/totp-confirm', requireAuth, (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'code is required' });

  const db = getDb();
  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.admin.id);
  if (!user || !user.totp_secret) {
    return res.status(400).json({ error: 'Run /totp-enroll first' });
  }
  if (user.totp_enabled) {
    return res.status(409).json({ error: 'TOTP already enabled' });
  }

  let totp;
  try { totp = require('otplib').totp; } catch {
    return res.status(500).json({ error: 'otplib not installed' });
  }

  if (!totp.check(code.replace(/\s/g, ''), user.totp_secret)) {
    return res.status(401).json({ error: 'Invalid TOTP code — try again' });
  }

  db.prepare('UPDATE admin_users SET totp_enabled = 1 WHERE id = ?').run(user.id);
  res.json({ message: 'TOTP enabled successfully' });
});

// POST /api/auth/totp-disable
router.post('/totp-disable', requireAuth, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Current password is required to disable TOTP' });

  const db = getDb();
  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.admin.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Incorrect password' });

  db.prepare('UPDATE admin_users SET totp_secret = NULL, totp_enabled = 0 WHERE id = ?').run(user.id);
  res.json({ message: 'TOTP disabled' });
});

// GET /api/auth/totp-status
router.get('/totp-status', requireAuth, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT totp_enabled FROM admin_users WHERE id = ?').get(req.admin.id);
  res.json({ enabled: user?.totp_enabled === 1 });
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Both current and new passwords are required' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.admin.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const hash = await bcrypt.hash(newPassword, 12);
  db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(hash, user.id);
  res.json({ message: 'Password updated successfully' });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ username: req.admin.username });
});

module.exports = router;
module.exports.requireAuth = requireAuth;
module.exports.signToken = signToken;