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
  const allowed = ['immich_url', 'immich_api_key', 'external_url', 'app_name'];

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

module.exports = router;