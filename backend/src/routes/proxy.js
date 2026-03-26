const express = require('express');
const { getDb } = require('../db');
const { proxyAssetThumbnail, proxyAssetOriginal, proxyAssetVideo } = require('../immich');
const { verifyToken } = require('../shareSession');

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

function getShare(shareId) {
  const db = getDb();
  return db.prepare('SELECT * FROM shares WHERE id = ?').get(shareId);
}

// ── Thumbnail ─────────────────────────────────────────────────────────────────
router.get('/thumbnail/:shareId/:assetId', async (req, res) => {
  const { shareId, assetId } = req.params;
  if (!validateSession(shareId, req.query.t)) {
    return res.status(401).send('Unauthorized');
  }
  try {
    const upstream = await proxyAssetThumbnail(assetId, 'thumbnail');
    res.set('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
    res.set('Cache-Control', 'private, max-age=86400');
    upstream.body.pipe(res);
  } catch (err) {
    res.status(502).send(err.message);
  }
});

// ── Preview (large thumbnail) ─────────────────────────────────────────────────
router.get('/preview/:shareId/:assetId', async (req, res) => {
  const { shareId, assetId } = req.params;
  if (!validateSession(shareId, req.query.t)) {
    return res.status(401).send('Unauthorized');
  }
  try {
    const upstream = await proxyAssetThumbnail(assetId, 'preview');
    res.set('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
    res.set('Cache-Control', 'private, max-age=86400');
    upstream.body.pipe(res);
  } catch (err) {
    res.status(502).send(err.message);
  }
});

// ── Original download ─────────────────────────────────────────────────────────
router.get('/original/:shareId/:assetId', async (req, res) => {
  const { shareId, assetId } = req.params;
  if (!validateSession(shareId, req.query.t)) {
    return res.status(401).send('Unauthorized');
  }
  const share = getShare(shareId);
  if (!share || !share.allow_download) {
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
    res.status(502).send(err.message);
  }
});

// ── Video with Range support (needed for seeking) ─────────────────────────────
router.get('/video/:shareId/:assetId', async (req, res) => {
  const { shareId, assetId } = req.params;
  if (!validateSession(shareId, req.query.t)) {
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
    res.status(502).send(err.message);
  }
});

module.exports = router;
