const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');
const { proxyAssetThumbnail, proxyAssetOriginal, proxyAssetVideo } = require('../immich');

const router = express.Router();

// Validate share access - password passed as query param for media requests
async function validateShare(shareId, password) {
  const db = getDb();
  const share = db.prepare('SELECT * FROM shares WHERE id = ? AND is_active = 1').get(shareId);
  if (!share) return null;
  if (share.expires_at && new Date(share.expires_at) < new Date()) return null;
  if (!password) return null;
  const valid = await bcrypt.compare(password, share.password_hash);
  return valid ? share : null;
}

// Thumbnail proxy
router.get('/thumbnail/:shareId/:assetId', async (req, res) => {
  const { shareId, assetId } = req.params;
  const password = req.query.p;

  const share = await validateShare(shareId, password);
  if (!share) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const response = await proxyAssetThumbnail(assetId, 'thumbnail');
    res.set('Content-Type', response.headers.get('content-type') || 'image/jpeg');
    res.set('Cache-Control', 'private, max-age=86400');
    response.body.pipe(res);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Preview (larger thumbnail)
router.get('/preview/:shareId/:assetId', async (req, res) => {
  const { shareId, assetId } = req.params;
  const password = req.query.p;

  const share = await validateShare(shareId, password);
  if (!share) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const response = await proxyAssetThumbnail(assetId, 'preview');
    res.set('Content-Type', response.headers.get('content-type') || 'image/jpeg');
    res.set('Cache-Control', 'private, max-age=86400');
    response.body.pipe(res);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Original asset proxy (download)
router.get('/original/:shareId/:assetId', async (req, res) => {
  const { shareId, assetId } = req.params;
  const password = req.query.p;

  const share = await validateShare(shareId, password);
  if (!share) return res.status(401).json({ error: 'Unauthorized' });
  if (!share.allow_download) return res.status(403).json({ error: 'Downloads not allowed for this share' });

  try {
    const response = await proxyAssetOriginal(assetId);
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const contentDisposition = response.headers.get('content-disposition') || 'attachment';
    res.set('Content-Type', contentType);
    res.set('Content-Disposition', contentDisposition);
    res.set('Cache-Control', 'private, max-age=3600');
    response.body.pipe(res);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Video proxy
router.get('/video/:shareId/:assetId', async (req, res) => {
  const { shareId, assetId } = req.params;
  const password = req.query.p;

  const share = await validateShare(shareId, password);
  if (!share) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const response = await proxyAssetVideo(assetId);
    res.set('Content-Type', response.headers.get('content-type') || 'video/mp4');
    res.set('Cache-Control', 'private, max-age=3600');
    response.body.pipe(res);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
