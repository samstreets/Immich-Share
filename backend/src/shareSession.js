/**
 * In-memory cache for verified share sessions.
 * After a user correctly enters a password, we issue a short-lived signed
 * session token so that subsequent media proxy requests don't need to
 * bcrypt-compare on every single thumbnail load.
 *
 * Token format: <shareId>.<expiry>.<hmac>
 * Stored as query param ?t=<token> on media URLs instead of the raw password.
 */

const crypto = require('crypto');

// H1 FIX: Reuse the same JWT_SECRET used by the admin JWT layer.
// The original code had its own fallback literal ("change-me-in-production"),
// which meant share session tokens were also forgeable on any deployment that
// omitted JWT_SECRET. We now share the same secret and rely on the startup
// guard in middleware/auth.js to ensure it is set before any request is served.
// If this module is somehow loaded before auth.js the guard below catches it.
const SESSION_SECRET = process.env.JWT_SECRET;

if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
  throw new Error(
    '[shareSession] JWT_SECRET is missing or too short. ' +
    'See middleware/auth.js for setup instructions.'
  );
}

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

function makeToken(shareId) {
  const expiry = Date.now() + SESSION_TTL_MS;
  const payload = `${shareId}.${expiry}`;
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

function verifyToken(shareId, token) {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [sid, expiry, sig] = parts;
  if (sid !== shareId) return false;
  if (Date.now() > Number(expiry)) return false;
  const payload = `${sid}.${expiry}`;
  const expected = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  // Constant-time comparison
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

module.exports = { makeToken, verifyToken };