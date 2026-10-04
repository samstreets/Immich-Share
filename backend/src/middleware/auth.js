const jwt = require('jsonwebtoken');

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

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // A pre-auth token only proves the password step; it must never grant access.
    if (payload.preAuth) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    req.admin = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

function signPreAuthToken(payload) {
  return jwt.sign({ ...payload, preAuth: true }, JWT_SECRET, { expiresIn: '5m' });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = { requireAuth, signToken, signPreAuthToken, verifyToken };
