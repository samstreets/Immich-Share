const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');
const { getAlbum, getAssets } = require('../immich');

const router = express.Router();

function logAccess(shareId, req) {
  try {
    const db = getDb();
    db.prepare('INSERT INTO access_logs (share_id, ip_address, user_agent) VALUES (?, ?, ?)')
      .run(shareId, req.ip, req.headers['user-agent'] || '');
    db.prepare('UPDATE shares SET view_count = view_count + 1 WHERE id = ?').run(shareId);
  } catch (_) {}
}

// Verify share password and return session token
router.post('/verify/:id', async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });

  const db = getDb();
  const share = db.prepare('SELECT * FROM shares WHERE id = ? AND is_active = 1').get(req.params.id);
  if (!share) return res.status(404).json({ error: 'Share not found or inactive' });

  // Check expiry
  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return res.status(410).json({ error: 'This share has expired' });
  }

  const valid = await bcrypt.compare(password, share.password_hash);
  if (!valid) return res.status(401).json({ error: 'Incorrect password' });

  // Return share metadata (no media yet)
  logAccess(share.id, req);

  res.json({
    id: share.id,
    name: share.name,
    description: share.description,
    share_type: share.share_type,
    allow_download: share.allow_download === 1,
    show_metadata: share.show_metadata === 1,
    verified: true,
  });
});

// Get share contents (requires password re-verification via header or body)
router.post('/content/:id', async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });

  const db = getDb();
  const share = db.prepare('SELECT * FROM shares WHERE id = ? AND is_active = 1').get(req.params.id);
  if (!share) return res.status(404).json({ error: 'Share not found' });

  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return res.status(410).json({ error: 'This share has expired' });
  }

  const valid = await bcrypt.compare(password, share.password_hash);
  if (!valid) return res.status(401).json({ error: 'Incorrect password' });

  try {
    let assets = [];

    if (share.share_type === 'album') {
      const album = await getAlbum(share.immich_album_id);
      assets = album.assets || [];
    } else {
      const ids = JSON.parse(share.immich_asset_ids || '[]');
      assets = await getAssets(ids);
    }

    // Strip sensitive data, build proxied URLs
    const sanitized = assets.map(a => ({
      id: a.id,
      type: a.type,
      originalFileName: share.show_metadata ? a.originalFileName : undefined,
      fileCreatedAt: share.show_metadata ? a.fileCreatedAt : undefined,
      exifInfo: share.show_metadata ? a.exifInfo : undefined,
      duration: a.duration,
      thumbnailUrl: `/api/proxy/thumbnail/${share.id}/${a.id}`,
      previewUrl: `/api/proxy/preview/${share.id}/${a.id}`,
      originalUrl: share.allow_download ? `/api/proxy/original/${share.id}/${a.id}` : undefined,
      videoUrl: a.type === 'VIDEO' ? `/api/proxy/video/${share.id}/${a.id}` : undefined,
    }));

    res.json({ assets: sanitized, total: sanitized.length });
  } catch (err) {
    res.status(502).json({ error: `Failed to fetch content: ${err.message}` });
  }
});

// Get share info (public, no password - just name/description for the UI)
router.get('/info/:id', (req, res) => {
  const db = getDb();
  const share = db.prepare('SELECT id, name, description, expires_at, is_active FROM shares WHERE id = ?').get(req.params.id);
  if (!share) return res.status(404).json({ error: 'Share not found' });

  const appNameRow = db.prepare("SELECT value FROM settings WHERE key = 'app_name'").get();

  res.json({
    id: share.id,
    name: share.name,
    description: share.description,
    isExpired: share.expires_at ? new Date(share.expires_at) < new Date() : false,
    isActive: share.is_active === 1,
    appName: appNameRow?.value || 'Immich Share',
  });
});

module.exports = router;
