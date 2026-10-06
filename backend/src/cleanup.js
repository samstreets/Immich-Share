'use strict';

/**
 * Cleanup job — runs periodically to:
 *  1. Auto-disable shares that have exceeded their max_views limit.
 *  2. Delete expired shares (if the admin has enabled this setting).
 *  3. Send expiry reminders for shares expiring soon.
 *  4. Remove orphaned chunk directories in /tmp older than N hours.
 *
 * Interval: every 30 minutes by default (CLEANUP_INTERVAL_MS env var).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { getDb } = require('./db');
const { notifyEvent } = require('./notifications');

const INTERVAL_MS = parseInt(
  process.env.CLEANUP_INTERVAL_MS || String(30 * 60 * 1000),
  10
);

const CHUNKS_DIR = path.join(os.tmpdir(), 'immich-share-chunks');

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSetting(key) {
  try {
    const db = getDb();
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row?.value ?? null;
  } catch {
    return null;
  }
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

function enforceMaxViews(db) {
  // Disable shares whose view_count has reached max_views
  const reached = db.prepare(`
    SELECT * FROM shares
    WHERE is_active = 1
      AND max_views IS NOT NULL
      AND view_count >= max_views
  `).all();

  if (reached.length === 0) return;

  const disable = db.prepare(
    'UPDATE shares SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  );
  for (const share of reached) {
    disable.run(share.id);
    notifyEvent('view_limit_reached', share).catch(() => {});
  }

  console.log(`[cleanup] Disabled ${reached.length} share(s) that reached max_views`);
}

function formatTimeLeft(ms) {
  const hours = Math.max(1, Math.round(ms / 3600000));
  if (hours < 48) return `about ${hours} hour${hours === 1 ? '' : 's'}`;
  return `about ${Math.round(hours / 24)} days`;
}

// Parse a DB/ISO date string. SQLite's datetime() output has no timezone and is UTC.
function parseDbDate(v) {
  if (!v) return null;
  const str = String(v);
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(str) ? str : str.replace(' ', 'T') + 'Z');
  return isNaN(d) ? null : d;
}

function sendExpiryReminders(db) {
  const hours = parseInt(getSetting('expiry_reminder_hours') || '0', 10);
  if (!hours || hours < 1) return;
  if (getSetting('notify_on_expiry_reminder') !== '1') return;

  const now = Date.now();
  const candidates = db.prepare(`
    SELECT * FROM shares
    WHERE is_active = 1
      AND expires_at IS NOT NULL
      AND expiry_reminded_at IS NULL
  `).all();

  const mark = db.prepare('UPDATE shares SET expiry_reminded_at = CURRENT_TIMESTAMP WHERE id = ?');
  for (const share of candidates) {
    const exp = parseDbDate(share.expires_at);
    if (!exp) continue;
    const msLeft = exp.getTime() - now;
    if (msLeft <= 0 || msLeft > hours * 3600000) continue;
    mark.run(share.id);
    notifyEvent('expiry_reminder', share, {
      expiresAt: exp.toUTCString(),
      timeLeft: formatTimeLeft(msLeft),
    }).catch(() => {});
  }
}

function handleExpiredShares(db) {
  // Notify once per expiry. expired_notified_at is cleared when expires_at changes.
  const candidates = db.prepare(`
    SELECT * FROM shares
    WHERE expires_at IS NOT NULL
      AND expired_notified_at IS NULL
  `).all();
  const mark = db.prepare('UPDATE shares SET expired_notified_at = CURRENT_TIMESTAMP WHERE id = ?');
  for (const share of candidates) {
    const exp = parseDbDate(share.expires_at);
    if (!exp || exp.getTime() > Date.now()) continue;
    mark.run(share.id);
    notifyEvent('expired', share, { expiresAt: exp.toUTCString() }).catch(() => {});
  }

  const enabled = getSetting('cleanup_expired_shares');
  if (enabled !== '1') return;

  const result = db.prepare(`
    DELETE FROM shares
    WHERE expires_at IS NOT NULL
      AND expires_at < datetime('now')
  `).run();

  if (result.changes > 0) {
    console.log(`[cleanup] Deleted ${result.changes} expired share(s)`);
  }
}

function cleanOrphanedChunks() {
  const maxAgeHours = parseInt(getSetting('cleanup_chunk_max_age_hours') || '24', 10);
  const cutoffMs = Date.now() - maxAgeHours * 60 * 60 * 1000;

  if (!fs.existsSync(CHUNKS_DIR)) return;

  let removed = 0;
  let errors = 0;

  try {
    const entries = fs.readdirSync(CHUNKS_DIR);
    for (const entry of entries) {
      const dir = path.join(CHUNKS_DIR, entry);
      try {
        const stat = fs.statSync(dir);
        if (!stat.isDirectory()) continue;
        if (stat.mtimeMs < cutoffMs) {
          fs.rmSync(dir, { recursive: true, force: true });
          removed++;
        }
      } catch {
        errors++;
      }
    }
  } catch (err) {
    console.error(`[cleanup] Could not read chunks dir: ${err.message}`);
    return;
  }

  if (removed > 0) {
    console.log(`[cleanup] Removed ${removed} orphaned chunk director${removed === 1 ? 'y' : 'ies'} (>${maxAgeHours}h old)${errors > 0 ? `, ${errors} error(s)` : ''}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function runCleanup() {
  try {
    const db = getDb();
    enforceMaxViews(db);
    sendExpiryReminders(db);
    handleExpiredShares(db);
    cleanOrphanedChunks();
  } catch (err) {
    console.error(`[cleanup] Unexpected error: ${err.message}`);
  }
}

let _timer = null;

function startCleanup() {
  if (_timer) return;

  console.log(`[cleanup] Starting cleanup job (interval: ${INTERVAL_MS / 1000}s)`);

  // Run once shortly after startup
  const startupDelay = setTimeout(runCleanup, 20_000);

  _timer = setInterval(runCleanup, INTERVAL_MS);

  function stop() {
    clearTimeout(startupDelay);
    clearInterval(_timer);
    _timer = null;
  }

  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

module.exports = { startCleanup, runCleanup };
