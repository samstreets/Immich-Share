const express = require('express');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { getAlbums, getAlbum, getTags, testConnection } = require('../immich');

const router = express.Router();
router.use(requireAuth);

// Get all settings (sensitive keys masked)
router.get('/settings', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const row of rows) {
    if (row.key === 'immich_api_key' && row.value) {
      settings[row.key] = row.value.slice(0, 8) + '••••••••';
    } else {
      settings[row.key] = row.value;
    }
  }
  res.json(settings);
});

// Update settings
router.put('/settings', (req, res) => {
  const db = getDb();
  const allowed = ['immich_url', 'immich_api_key', 'external_url', 'app_name', 'allowed_origins'];

  const update = db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)');

  const updateMany = db.transaction((updates) => {
    for (const [key, value] of updates) {
      update.run(key, value);
    }
  });

  const updates = Object.entries(req.body).filter(([k]) => allowed.includes(k));
  updateMany(updates);

  res.json({ message: 'Settings saved' });
});

// Get raw API key (separate endpoint for security)
router.get('/settings/api-key', (req, res) => {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = 'immich_api_key'").get();
  res.json({ value: row?.value || '' });
});

// Test Immich connection
router.get('/immich/test', async (req, res) => {
  const result = await testConnection();
  res.json(result);
});

// List Immich albums
router.get('/immich/albums', async (req, res) => {
  try {
    const albums = await getAlbums();
    res.json(albums);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Get Immich album details
router.get('/immich/albums/:id', async (req, res) => {
  try {
    const album = await getAlbum(req.params.id);
    res.json(album);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// List Immich tags
router.get('/immich/tags', async (req, res) => {
  try {
    const tags = await getTags();
    res.json(tags);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Dashboard stats
router.get('/stats', (req, res) => {
  const db = getDb();
  const totalShares = db.prepare('SELECT COUNT(*) as count FROM shares').get().count;
  const activeShares = db.prepare('SELECT COUNT(*) as count FROM shares WHERE is_active = 1').get().count;
  const expiredShares = db.prepare("SELECT COUNT(*) as count FROM shares WHERE expires_at IS NOT NULL AND expires_at < datetime('now')").get().count;
  const totalViews = db.prepare('SELECT SUM(view_count) as total FROM shares').get().total || 0;
  const recentViews = db.prepare("SELECT COUNT(*) as count FROM access_logs WHERE accessed_at > datetime('now', '-7 days')").get().count;

  res.json({ totalShares, activeShares, expiredShares, totalViews, recentViews });
});

// ── Global access logs ────────────────────────────────────────────────────────

// GET /admin/logs — paginated, filterable
router.get('/logs', (req, res) => {
  const db = getDb();
  const limit  = Math.min(parseInt(req.query.limit  || '100', 10), 500);
  const offset = parseInt(req.query.offset || '0', 10);
  const action = req.query.action || null;   // filter by action
  const search = req.query.search || null;   // filter by share name / ip

  let where = '';
  const params = [];

  if (action) {
    where += ' AND l.action = ?';
    params.push(action);
  }
  if (search) {
    where += ' AND (l.share_name LIKE ? OR l.ip_address LIKE ? OR s.name LIKE ?)';
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  const rows = db.prepare(`
    SELECT
      l.id,
      l.share_id,
      COALESCE(l.share_name, s.name, l.share_id) AS share_name,
      l.ip_address,
      l.user_agent,
      l.action,
      l.accessed_at
    FROM access_logs l
    LEFT JOIN shares s ON s.id = l.share_id
    WHERE 1=1 ${where}
    ORDER BY l.accessed_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  const totalRow = db.prepare(`
    SELECT COUNT(*) as count
    FROM access_logs l
    LEFT JOIN shares s ON s.id = l.share_id
    WHERE 1=1 ${where}
  `).get(...params);

  res.json({ logs: rows, total: totalRow.count, limit, offset });
});

// GET /admin/logs/summary — action breakdown + top shares
router.get('/logs/summary', (req, res) => {
  const db = getDb();

  const byAction = db.prepare(`
    SELECT action, COUNT(*) as count
    FROM access_logs
    GROUP BY action
    ORDER BY count DESC
  `).all();

  const topShares = db.prepare(`
    SELECT
      l.share_id,
      COALESCE(l.share_name, s.name, l.share_id) AS share_name,
      COUNT(*) AS total,
      SUM(CASE WHEN l.action = 'view' THEN 1 ELSE 0 END) AS views,
      SUM(CASE WHEN l.action = 'upload' THEN 1 ELSE 0 END) AS uploads
    FROM access_logs l
    LEFT JOIN shares s ON s.id = l.share_id
    GROUP BY l.share_id
    ORDER BY total DESC
    LIMIT 10
  `).all();

  const byDay = db.prepare(`
    SELECT
      date(accessed_at) AS day,
      COUNT(*) AS count
    FROM access_logs
    WHERE accessed_at >= date('now', '-30 days')
    GROUP BY day
    ORDER BY day ASC
  `).all();

  res.json({ byAction, topShares, byDay });
});

// DELETE /admin/logs — purge all logs older than N days
router.delete('/logs', (req, res) => {
  const db = getDb();
  const days = parseInt(req.query.days || '90', 10);
  const result = db.prepare(
    `DELETE FROM access_logs WHERE accessed_at < datetime('now', '-' || ? || ' days')`
  ).run(days);
  res.json({ deleted: result.changes });
});

module.exports = router;