const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { generateQR, matrixToSVG } = require('../qr');

const router = express.Router();

router.use(requireAuth);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateUuids(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: 'ids must be a non-empty array' };
  }
  for (const id of ids) {
    if (typeof id !== 'string' || !UUID_RE.test(id)) {
      return { ok: false, error: `Invalid id format: "${id}"` };
    }
  }
  return { ok: true };
}

function getExternalUrl(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'external_url'").get();
  return (row?.value || '').replace(/\/$/, '');
}

function cleanSlug(raw) {
  const s = raw.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (s.length < 3) throw new Error('Slug must be at least 3 characters');
  if (s.length > 60) throw new Error('Slug must be 60 characters or fewer');
  if (!/^[a-z0-9]/.test(s)) throw new Error('Slug must start with a letter or number');
  const reserved = ['admin', 'api', 's', 'login', 'share', 'shares'];
  if (reserved.includes(s)) throw new Error(`"${s}" is a reserved slug`);
  return s;
}

function shareUrl(externalUrl, share) {
  if (share.slug) return `${externalUrl}/s/${share.slug}`;
  return `${externalUrl}/s/${share.id}`;
}

function passwordlessUrl(externalUrl, share) {
  if (!share.access_token) return null;
  if (share.slug) return `${externalUrl}/s/${share.slug}?k=${share.access_token}`;
  return `${externalUrl}/s/${share.id}?k=${share.access_token}`;
}

function cleanTagIds(raw) {
  if (!raw || !raw.trim()) return null;
  const ids = raw.split(',').map(s => s.trim()).filter(Boolean);
  for (const id of ids) {
    if (!UUID_RE.test(id)) throw new Error(`Invalid tag ID format: "${id}"`);
  }
  return ids.length > 0 ? ids.join(',') : null;
}

function generateAccessToken() {
  // 32 bytes → 64 hex chars — long enough to be unguessable
  return crypto.randomBytes(32).toString('hex');
}

// List all shares
router.get('/', (req, res) => {
  const db = getDb();
  const { search, type, status } = req.query;

  let where = 'WHERE 1=1';
  const params = [];

  if (search) {
    where += ' AND (name LIKE ? OR description LIKE ? OR slug LIKE ?)';
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  if (type && ['album', 'tag'].includes(type)) {
    where += ' AND share_type = ?';
    params.push(type);
  }
  if (status === 'active') {
    where += ' AND is_active = 1';
  } else if (status === 'inactive') {
    where += ' AND is_active = 0';
  } else if (status === 'expired') {
    where += " AND expires_at IS NOT NULL AND expires_at < datetime('now')";
  }

  const shares = db.prepare(`
    SELECT id, slug, name, description, share_type, immich_album_id, immich_tag_id,
           expires_at, allow_download, allow_upload, show_metadata,
           upload_tag_ids, watch_tag_ids,
           access_token, max_views, webhook_url, notify_email,
           view_count, created_at, updated_at, is_active
    FROM shares ${where} ORDER BY created_at DESC
  `).all(...params);

  const externalUrl = getExternalUrl(db);

  const sharesWithLinks = shares.map(s => ({
    ...s,
    shareUrl: shareUrl(externalUrl, s),
    passwordlessUrl: passwordlessUrl(externalUrl, s),
    isExpired: s.expires_at ? new Date(s.expires_at) < new Date() : false,
  }));

  res.json(sharesWithLinks);
});

// Get single share
router.get('/:id', (req, res) => {
  const db = getDb();
  if (!UUID_RE.test(req.params.id)) {
    return res.status(400).json({ error: 'Invalid share id' });
  }
  const share = db.prepare('SELECT * FROM shares WHERE id = ?').get(req.params.id);
  if (!share) return res.status(404).json({ error: 'Share not found' });

  const externalUrl = getExternalUrl(db);

  res.json({
    ...share,
    shareUrl: shareUrl(externalUrl, share),
    passwordlessUrl: passwordlessUrl(externalUrl, share),
    password_hash: undefined,
  });
});

// QR Code for share
router.get('/:id/qr', (req, res) => {
  if (!UUID_RE.test(req.params.id)) {
    return res.status(400).json({ error: 'Invalid share id' });
  }
  const db = getDb();
  const share = db.prepare('SELECT * FROM shares WHERE id = ?').get(req.params.id);
  if (!share) return res.status(404).json({ error: 'Share not found' });

  const externalUrl = getExternalUrl(db);
  const url = shareUrl(externalUrl, share);

  const size = Math.min(Math.max(parseInt(req.query.size || '256', 10), 64), 1024);
  const dark = req.query.dark ? decodeURIComponent(req.query.dark) : '#13161f';
  const light = req.query.light ? decodeURIComponent(req.query.light) : '#ffffff';

  try {
    const matrix = generateQR(url);
    const svg = matrixToSVG(matrix, { size, dark, light });
    res.set('Content-Type', 'image/svg+xml');
    res.set('Cache-Control', 'private, max-age=3600');
    res.send(svg);
  } catch (err) {
    res.status(422).json({ error: `QR generation failed: ${err.message}` });
  }
});

// Per-share activity stats
router.get('/:id/stats', (req, res) => {
  if (!UUID_RE.test(req.params.id)) {
    return res.status(400).json({ error: 'Invalid share id' });
  }
  const db = getDb();
  const share = db.prepare('SELECT id, name FROM shares WHERE id = ?').get(req.params.id);
  if (!share) return res.status(404).json({ error: 'Share not found' });

  const byDay = db.prepare(`
    SELECT date(accessed_at) AS day, action, COUNT(*) AS count
    FROM access_logs
    WHERE share_id = ? AND accessed_at >= date('now', '-30 days')
    GROUP BY day, action
    ORDER BY day ASC
  `).all(req.params.id);

  const byAction = db.prepare(`
    SELECT action, COUNT(*) AS count
    FROM access_logs WHERE share_id = ?
    GROUP BY action
  `).all(req.params.id);

  const total = db.prepare('SELECT COUNT(*) AS count FROM access_logs WHERE share_id = ?').get(req.params.id).count;
  const unique = db.prepare('SELECT COUNT(DISTINCT ip_address) AS count FROM access_logs WHERE share_id = ?').get(req.params.id).count;

  res.json({ byDay, byAction, total, unique });
});

// Bulk operations
router.post('/bulk/delete', (req, res) => {
  const { ids } = req.body;
  const check = validateUuids(ids);
  if (!check.ok) return res.status(400).json({ error: check.error });

  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  const result = db.prepare(`DELETE FROM shares WHERE id IN (${placeholders})`).run(...ids);
  res.json({ deleted: result.changes });
});

router.post('/bulk/toggle', (req, res) => {
  const { ids, is_active } = req.body;
  const check = validateUuids(ids);
  if (!check.ok) return res.status(400).json({ error: check.error });

  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  const result = db.prepare(
    `UPDATE shares SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`
  ).run(is_active ? 1 : 0, ...ids);
  res.json({ updated: result.changes });
});

// POST /shares/:id/access-token  — generate or regenerate passwordless token
router.post('/:id/access-token', (req, res) => {
  if (!UUID_RE.test(req.params.id)) {
    return res.status(400).json({ error: 'Invalid share id' });
  }
  const db = getDb();
  const share = db.prepare('SELECT id FROM shares WHERE id = ?').get(req.params.id);
  if (!share) return res.status(404).json({ error: 'Share not found' });

  const token = generateAccessToken();
  db.prepare('UPDATE shares SET access_token = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(token, req.params.id);

  const externalUrl = getExternalUrl(db);
  const updated = db.prepare('SELECT * FROM shares WHERE id = ?').get(req.params.id);
  res.json({ access_token: token, passwordlessUrl: passwordlessUrl(externalUrl, updated) });
});

// DELETE /shares/:id/access-token  — revoke passwordless token
router.delete('/:id/access-token', (req, res) => {
  if (!UUID_RE.test(req.params.id)) {
    return res.status(400).json({ error: 'Invalid share id' });
  }
  const db = getDb();
  const result = db.prepare(
    'UPDATE shares SET access_token = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Share not found' });
  res.json({ message: 'Passwordless access token revoked' });
});

// Create share
router.post('/', async (req, res) => {
  const {
    name,
    description,
    share_type,
    immich_album_id,
    immich_tag_id,
    password,
    expires_at,
    allow_download,
    allow_upload,
    show_metadata,
    upload_tag_ids: rawUploadTagIds,
    watch_tag_ids: rawWatchTagIds,
    slug: rawSlug,
    max_views,
    webhook_url,
    notify_email,
  } = req.body;

  if (!name || !password) {
    return res.status(400).json({ error: 'Name and password are required' });
  }
  if (!share_type || !['album', 'tag'].includes(share_type)) {
    return res.status(400).json({ error: 'share_type must be "album" or "tag"' });
  }
  if (share_type === 'album' && !immich_album_id) {
    return res.status(400).json({ error: 'immich_album_id required for album shares' });
  }
  if (share_type === 'tag' && !immich_tag_id) {
    return res.status(400).json({ error: 'immich_tag_id required for tag shares' });
  }
  if (immich_album_id && !UUID_RE.test(immich_album_id)) {
    return res.status(400).json({ error: 'Invalid immich_album_id format' });
  }
  if (immich_tag_id && !UUID_RE.test(immich_tag_id)) {
    return res.status(400).json({ error: 'Invalid immich_tag_id format' });
  }

  let slug = null;
  if (rawSlug && rawSlug.trim()) {
    try {
      slug = cleanSlug(rawSlug);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    const db2 = getDb();
    const existing = db2.prepare('SELECT id FROM shares WHERE slug = ?').get(slug);
    if (existing) return res.status(409).json({ error: `Slug "${slug}" is already taken` });
  }

  let uploadTagIds, watchTagIds;
  try {
    uploadTagIds = cleanTagIds(rawUploadTagIds);
    watchTagIds = share_type === 'album' ? cleanTagIds(rawWatchTagIds) : null;
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  // Validate max_views
  const maxViews = max_views ? parseInt(max_views, 10) : null;
  if (maxViews !== null && (isNaN(maxViews) || maxViews < 1)) {
    return res.status(400).json({ error: 'max_views must be a positive integer' });
  }

  const id = uuidv4();
  const passwordHash = await bcrypt.hash(password, 10);
  const db = getDb();

  try {
    db.prepare(`
      INSERT INTO shares (
        id, slug, name, description, share_type, immich_album_id, immich_tag_id,
        password_hash, expires_at, allow_download, allow_upload, show_metadata,
        upload_tag_ids, watch_tag_ids, max_views, webhook_url, notify_email
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, slug, name, description || null, share_type,
      immich_album_id || null,
      immich_tag_id || null,
      passwordHash,
      expires_at || null,
      allow_download !== false ? 1 : 0,
      allow_upload ? 1 : 0,
      show_metadata ? 1 : 0,
      uploadTagIds,
      watchTagIds,
      maxViews,
      webhook_url || null,
      notify_email || null,
    );
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed: shares.slug')) {
      return res.status(409).json({ error: `Slug "${slug}" is already taken` });
    }
    throw err;
  }

  const externalUrl = getExternalUrl(db);
  const newShare = { id, slug, access_token: null };
  res.status(201).json({ id, slug, shareUrl: shareUrl(externalUrl, newShare), passwordlessUrl: null });
});

// Update share
router.patch('/:id', async (req, res) => {
  if (!UUID_RE.test(req.params.id)) {
    return res.status(400).json({ error: 'Invalid share id' });
  }
  const db = getDb();
  const share = db.prepare('SELECT * FROM shares WHERE id = ?').get(req.params.id);
  if (!share) return res.status(404).json({ error: 'Share not found' });

  const {
    name, description, password, expires_at,
    allow_download, allow_upload, show_metadata, is_active,
    upload_tag_ids: rawUploadTagIds,
    watch_tag_ids: rawWatchTagIds,
    slug: rawSlug,
    max_views,
    webhook_url,
    notify_email,
  } = req.body;

  let passwordHash = share.password_hash;
  if (password) {
    passwordHash = await bcrypt.hash(password, 10);
  }

  let slug = share.slug;
  if (rawSlug !== undefined) {
    if (!rawSlug || !rawSlug.trim()) {
      slug = null;
    } else {
      try {
        slug = cleanSlug(rawSlug);
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
      const existing = db.prepare('SELECT id FROM shares WHERE slug = ? AND id != ?').get(slug, req.params.id);
      if (existing) return res.status(409).json({ error: `Slug "${slug}" is already taken` });
    }
  }

  const maxViews = max_views !== undefined
    ? (max_views === null || max_views === '' ? null : parseInt(max_views, 10))
    : share.max_views;

  if (maxViews !== null && maxViews !== undefined && (isNaN(maxViews) || maxViews < 1)) {
    return res.status(400).json({ error: 'max_views must be a positive integer or empty' });
  }

  const updatedName        = name !== undefined ? name : share.name;
  const updatedDescription = description !== undefined ? description : share.description;
  const updatedExpiresAt   = expires_at !== undefined ? (expires_at || null) : share.expires_at;
  const updatedDownload    = allow_download !== undefined ? (allow_download ? 1 : 0) : share.allow_download;
  const updatedUpload      = allow_upload !== undefined ? (allow_upload ? 1 : 0) : share.allow_upload;
  const updatedMetadata    = show_metadata !== undefined ? (show_metadata ? 1 : 0) : share.show_metadata;
  const updatedActive      = is_active !== undefined ? (is_active ? 1 : 0) : share.is_active;
  const updatedWebhook     = webhook_url !== undefined ? (webhook_url || null) : share.webhook_url;
  const updatedEmail       = notify_email !== undefined ? (notify_email || null) : share.notify_email;

  let updatedUploadTagIds, updatedWatchTagIds;
  try {
    updatedUploadTagIds = rawUploadTagIds !== undefined
      ? cleanTagIds(rawUploadTagIds)
      : share.upload_tag_ids;
    updatedWatchTagIds = share.share_type === 'album'
      ? (rawWatchTagIds !== undefined ? cleanTagIds(rawWatchTagIds) : share.watch_tag_ids)
      : null;
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  try {
    db.prepare(`
      UPDATE shares SET
        slug = ?,
        name = ?,
        description = ?,
        password_hash = ?,
        expires_at = ?,
        allow_download = ?,
        allow_upload = ?,
        show_metadata = ?,
        upload_tag_ids = ?,
        watch_tag_ids = ?,
        is_active = ?,
        max_views = ?,
        webhook_url = ?,
        notify_email = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      slug, updatedName, updatedDescription, passwordHash,
      updatedExpiresAt, updatedDownload, updatedUpload, updatedMetadata,
      updatedUploadTagIds, updatedWatchTagIds, updatedActive,
      maxViews, updatedWebhook, updatedEmail,
      req.params.id
    );
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed: shares.slug')) {
      return res.status(409).json({ error: `Slug "${slug}" is already taken` });
    }
    throw err;
  }

  res.json({ message: 'Share updated' });
});

// Delete share
router.delete('/:id', (req, res) => {
  if (!UUID_RE.test(req.params.id)) {
    return res.status(400).json({ error: 'Invalid share id' });
  }
  const db = getDb();
  const result = db.prepare('DELETE FROM shares WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Share not found' });
  res.json({ message: 'Share deleted' });
});

// Get share access logs
router.get('/:id/logs', (req, res) => {
  if (!UUID_RE.test(req.params.id)) {
    return res.status(400).json({ error: 'Invalid share id' });
  }
  const db = getDb();
  const logs = db.prepare(`
    SELECT * FROM access_logs WHERE share_id = ? ORDER BY accessed_at DESC LIMIT 200
  `).all(req.params.id);
  res.json(logs);
});

module.exports = router;