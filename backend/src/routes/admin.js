const express = require('express');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { getAlbums, getAlbum, getTags, testConnection, createAlbum, createTag, tagAssets } = require('../immich');
const { sendEmail, fireWebhook } = require('../notifications');

const router = express.Router();
router.use(requireAuth);

// Get all settings (sensitive keys masked)
router.get('/settings', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const row of rows) {
    if (row.key === 'immich_api_key' && row.value) {
      settings[row.key] = '••••••••' + row.value.slice(-4);
    } else if (row.key === 'smtp_pass' && row.value) {
      settings[row.key] = '••••••••';
    } else if (row.key === 'global_webhook_secret' && row.value) {
      settings[row.key] = '••••••••';
    } else {
      settings[row.key] = row.value;
    }
  }
  res.json(settings);
});

// Update settings
router.put('/settings', (req, res) => {
  const db = getDb();
  const allowed = [
    'immich_url', 'immich_api_key', 'external_url', 'app_name', 'allowed_origins',
    // Email / SMTP
    'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from', 'smtp_secure',
    // Webhooks
    'global_webhook_url', 'global_webhook_secret',
    // Cleanup
    'cleanup_expired_shares', 'cleanup_chunk_max_age_hours',
  ];

  const update = db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)');

  const updateMany = db.transaction((updates) => {
    for (const [key, value] of updates) {
      // Don't overwrite secrets if the client sent the masked placeholder
      if ((key === 'smtp_pass' || key === 'global_webhook_secret') && value === '••••••••') continue;
      if (key === 'immich_api_key' && value && value.startsWith('••••••••')) continue;
      update.run(key, value);
    }
  });

  const updates = Object.entries(req.body).filter(([k]) => allowed.includes(k));
  updateMany(updates);

  res.json({ message: 'Settings saved' });
});

// Test Immich connection
router.get('/immich/test', async (req, res) => {
  const result = await testConnection();
  res.json(result);
});

// Test email configuration — sends a test message to the given address
router.post('/notifications/test-email', async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: 'Recipient email (to) is required' });

  const db = getDb();
  const appNameRow = db.prepare("SELECT value FROM settings WHERE key = 'app_name'").get();
  const appName = appNameRow?.value || 'Immich Share';

  try {
    await sendEmail({
      to,
      subject: `[${appName}] Test email`,
      text: `This is a test email from ${appName}. If you received this, your SMTP settings are working correctly.`,
      html: `<p>This is a test email from <strong>${appName}</strong>. If you received this, your SMTP settings are working correctly.</p>`,
    });
    res.json({ ok: true, message: `Test email sent to ${to}` });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

// Test webhook — fires a test payload to the given URL
router.post('/notifications/test-webhook', async (req, res) => {
  const { url, secret } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });

  try {
    await fireWebhook(url, { event: 'test', timestamp: new Date().toISOString(), message: 'Webhook test from Immich Share' }, secret || null);
    res.json({ ok: true, message: `Webhook fired to ${url}` });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
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

// Create a new Immich album
router.post('/immich/albums', async (req, res) => {
  const { albumName, description } = req.body;
  if (!albumName || !albumName.trim()) {
    return res.status(400).json({ error: 'albumName is required' });
  }
  try {
    const album = await createAlbum(albumName.trim(), description || '');
    res.status(201).json(album);
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

// Create a new Immich tag
router.post('/immich/tags', async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  try {
    const tag = await createTag(name.trim());
    res.status(201).json(tag);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Apply a tag to a list of assets
router.put('/immich/tags/:tagId/assets', async (req, res) => {
  const { tagId } = req.params;
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids array required' });
  }
  try {
    const result = await tagAssets(tagId, ids);
    res.json(result);
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

router.get('/logs', (req, res) => {
  const db = getDb();
  const limit  = Math.min(parseInt(req.query.limit  || '100', 10), 500);
  const offset = parseInt(req.query.offset || '0', 10);
  const action = req.query.action || null;
  const search = req.query.search || null;

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

// ── Log export (CSV or JSON) ──────────────────────────────────────────────────
router.get('/logs/export', (req, res) => {
  const db = getDb();
  const format = (req.query.format || 'csv').toLowerCase();
  const action = req.query.action || null;
  const days   = parseInt(req.query.days || '0', 10); // 0 = all time

  let where = 'WHERE 1=1';
  const params = [];

  if (action) {
    where += ' AND l.action = ?';
    params.push(action);
  }
  if (days > 0) {
    where += ` AND l.accessed_at >= datetime('now', '-' || ? || ' days')`;
    params.push(days);
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
    ${where}
    ORDER BY l.accessed_at DESC
    LIMIT 50000
  `).all(...params);

  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="access_logs.json"');
    return res.send(JSON.stringify(rows, null, 2));
  }

  // Default: CSV
  const cols = ['id', 'share_id', 'share_name', 'ip_address', 'user_agent', 'action', 'accessed_at'];
  const escape = (val) => {
    if (val == null) return '';
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  const csv = [
    cols.join(','),
    ...rows.map(r => cols.map(c => escape(r[c])).join(',')),
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="access_logs.csv"');
  res.send(csv);
});

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

router.delete('/logs', (req, res) => {
  const db = getDb();
  const days = parseInt(req.query.days || '90', 10);
  const result = db.prepare(
    `DELETE FROM access_logs WHERE accessed_at < datetime('now', '-' || ? || ' days')`
  ).run(days);
  res.json({ deleted: result.changes });
});

module.exports = router;