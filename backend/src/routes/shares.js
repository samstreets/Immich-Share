const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// All share routes require admin auth
router.use(requireAuth);

function getExternalUrl(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'external_url'").get();
  return (row?.value || '').replace(/\/$/, '');
}

// List all shares
router.get('/', (req, res) => {
  const db = getDb();
  const shares = db.prepare(`
    SELECT id, name, description, share_type, immich_album_id, immich_tag_id,
           expires_at, allow_download, allow_upload, show_metadata, view_count,
           created_at, updated_at, is_active
    FROM shares ORDER BY created_at DESC
  `).all();

  const externalUrl = getExternalUrl(db);

  const sharesWithLinks = shares.map(s => ({
    ...s,
    shareUrl: `${externalUrl}/s/${s.id}`,
    isExpired: s.expires_at ? new Date(s.expires_at) < new Date() : false,
  }));

  res.json(sharesWithLinks);
});

// Get single share
router.get('/:id', (req, res) => {
  const db = getDb();
  const share = db.prepare('SELECT * FROM shares WHERE id = ?').get(req.params.id);
  if (!share) return res.status(404).json({ error: 'Share not found' });

  const externalUrl = getExternalUrl(db);

  res.json({
    ...share,
    shareUrl: `${externalUrl}/s/${share.id}`,
    password_hash: undefined,
  });
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

  const id = uuidv4();
  const passwordHash = await bcrypt.hash(password, 10);
  const db = getDb();

  db.prepare(`
    INSERT INTO shares (id, name, description, share_type, immich_album_id, immich_tag_id,
      password_hash, expires_at, allow_download, allow_upload, show_metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, name, description || null, share_type,
    immich_album_id || null,
    immich_tag_id || null,
    passwordHash,
    expires_at || null,
    allow_download !== false ? 1 : 0,
    allow_upload ? 1 : 0,
    show_metadata ? 1 : 0
  );

  const externalUrl = getExternalUrl(db);
  res.status(201).json({ id, shareUrl: `${externalUrl}/s/${id}` });
});

// Update share
router.patch('/:id', async (req, res) => {
  const db = getDb();
  const share = db.prepare('SELECT * FROM shares WHERE id = ?').get(req.params.id);
  if (!share) return res.status(404).json({ error: 'Share not found' });

  const { name, description, password, expires_at, allow_download, allow_upload, show_metadata, is_active } = req.body;

  let passwordHash = share.password_hash;
  if (password) {
    passwordHash = await bcrypt.hash(password, 10);
  }

  const updatedName        = name !== undefined ? name : share.name;
  const updatedDescription = description !== undefined ? description : share.description;
  const updatedExpiresAt   = expires_at !== undefined ? (expires_at || null) : share.expires_at;
  const updatedDownload    = allow_download !== undefined ? (allow_download ? 1 : 0) : share.allow_download;
  const updatedUpload      = allow_upload !== undefined ? (allow_upload ? 1 : 0) : share.allow_upload;
  const updatedMetadata    = show_metadata !== undefined ? (show_metadata ? 1 : 0) : share.show_metadata;
  const updatedActive      = is_active !== undefined ? (is_active ? 1 : 0) : share.is_active;

  db.prepare(`
    UPDATE shares SET
      name = ?,
      description = ?,
      password_hash = ?,
      expires_at = ?,
      allow_download = ?,
      allow_upload = ?,
      show_metadata = ?,
      is_active = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    updatedName, updatedDescription, passwordHash,
    updatedExpiresAt, updatedDownload, updatedUpload, updatedMetadata, updatedActive,
    req.params.id
  );

  res.json({ message: 'Share updated' });
});

// Delete share
router.delete('/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM shares WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Share not found' });
  res.json({ message: 'Share deleted' });
});

// Get share access logs
router.get('/:id/logs', (req, res) => {
  const db = getDb();
  const logs = db.prepare(`
    SELECT * FROM access_logs WHERE share_id = ? ORDER BY accessed_at DESC LIMIT 200
  `).all(req.params.id);
  res.json(logs);
});

module.exports = router;