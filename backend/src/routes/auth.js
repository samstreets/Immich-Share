const jwt = require('jsonwebtoken');

// H1 FIX: Fail hard at startup if JWT_SECRET is missing or too short.
// The original code silently fell back to a well-known literal string
// ("change-me-in-production-..."), meaning any deployment that omitted the env
// var could have its admin tokens trivially forged by anyone who had read the
// source. We now throw at require-time so the process never starts in an
// insecure state. The minimum 32-character requirement gives ≥256 bits of
// entropy when the secret is random ASCII, which is sufficient for HS256.
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

module.exports = { requireAuth, signToken };