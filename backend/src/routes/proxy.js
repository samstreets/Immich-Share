const express = require('express');
const { getDb } = require('../db');
const { proxyAssetThumbnail, proxyAssetOriginal, proxyAssetVideo } = require('../immich');
const { verifyToken } = require('../shareSession');
const { shareContainsAsset } = require('../shareAssets');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const router = express.Router();

function validateSession(shareId, token) {
  if (!token) return false;
  if (!verifyToken(shareId, token)) return false;
  // Also confirm share is still active
  const db = getDb();
  const share = db.prepare('SELECT is_active, expires_at FROM shares WHERE id = ?').get(shareId);
  if (!share || !share.is_active) return false;
  if (share.expires_at && new Date(share.expires_at) < new Date()) return false;
  return true;
}

// Session valid AND asset belongs to this share. Returns the share row or null.
async function authorizeAsset(shareId, assetId, token) {
  if (!UUID_RE.test(assetId)) return null;
  if (!validateSession(shareId, token)) return null;
  const share = getShare(shareId);
  if (!share) return null;
  try {
    if (!(await shareContainsAsset(share, assetId))) return null;
  } catch {
    return null;
  }
  return share;
}

function getShare(shareId) {
  const db = getDb();
  return db.prepare('SELECT * FROM shares WHERE id = ?').get(shareId);
}

// ── Thumbnail ─────────────────────────────────────────────────────────────────
router.get('/thumbnail/:shareId/:assetId', async (req, res) => {
  const { shareId, assetId } = req.params;
  if (!(await authorizeAsset(shareId, assetId, req.query.t))) {
    return res.status(401).send('Unauthorized');
  }
  try {
    const upstream = await proxyAssetThumbnail(assetId, 'thumbnail');
    res.set('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
    res.set('Cache-Control', 'private, max-age=86400');
    upstream.body.pipe(res);
  } catch (err) {
    res.status(502).send('Upstream error');
  }
});

// ── Preview (large thumbnail) ─────────────────────────────────────────────────
router.get('/preview/:shareId/:assetId', async (req, res) => {
  const { shareId, assetId } = req.params;
  if (!(await authorizeAsset(shareId, assetId, req.query.t))) {
    return res.status(401).send('Unauthorized');
  }
  try {
    const upstream = await proxyAssetThumbnail(assetId, 'preview');
    res.set('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
    res.set('Cache-Control', 'private, max-age=86400');
    upstream.body.pipe(res);
  } catch (err) {
    res.status(502).send('Upstream error');
  }
});

// ── Original download ─────────────────────────────────────────────────────────
router.get('/original/:shareId/:assetId', async (req, res) => {
  const { shareId, assetId } = req.params;
  const share = await authorizeAsset(shareId, assetId, req.query.t);
  if (!share) {
    return res.status(401).send('Unauthorized');
  }
  if (!share.allow_download) {
    return res.status(403).send('Downloads not allowed for this share');
  }
  try {
    const upstream = await proxyAssetOriginal(assetId);
    res.set('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
    // Forward content-disposition from Immich (includes filename)
    const cd = upstream.headers.get('content-disposition');
    if (cd) res.set('Content-Disposition', cd);
    else res.set('Content-Disposition', 'attachment');
    res.set('Cache-Control', 'private, max-age=3600');
    upstream.body.pipe(res);
  } catch (err) {
    res.status(502).send('Upstream error');
  }
});

// ── Video with Range support (needed for seeking) ─────────────────────────────
router.get('/video/:shareId/:assetId', async (req, res) => {
  const { shareId, assetId } = req.params;
  if (!(await authorizeAsset(shareId, assetId, req.query.t))) {
    return res.status(401).send('Unauthorized');
  }
  try {
    // Forward the Range header to Immich so seeking works
    const rangeHeader = req.headers.range;
    const upstream = await proxyAssetVideo(assetId, rangeHeader);

    // Mirror status code (200 or 206 Partial Content)
    const status = upstream.status || 200;
    res.status(status);

    // Forward relevant headers
    const forward = [
      'content-type', 'content-length', 'content-range',
      'accept-ranges', 'cache-control',
    ];
    for (const h of forward) {
      const v = upstream.headers.get(h);
      if (v) res.set(h, v);
    }
    if (!upstream.headers.get('accept-ranges')) {
      res.set('Accept-Ranges', 'bytes');
    }
    res.set('Cache-Control', 'private, max-age=3600');

    upstream.body.pipe(res);
  } catch (err) {
    res.status(502).send('Upstream error');
  }
});

module.exports = router;
