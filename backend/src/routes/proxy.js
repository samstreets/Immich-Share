const express = require('express');
const { pipeline } = require('stream');
const { asyncRouter } = require('../asyncRoutes');
const { getDb } = require('../db');
const { proxyAssetThumbnail, proxyAssetOriginal, proxyAssetVideo } = require('../immich');
const { verifyToken } = require('../shareSession');
const { shareContainsAsset } = require('../shareAssets');
const { isLocalReady, localHasAsset, getCachedFile, sendCached } = require('../localCache');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const router = asyncRouter();

// Session valid AND asset belongs to this share. Returns the share row or null.
async function authorizeAsset(shareId, assetId, token) {
  if (!UUID_RE.test(assetId)) return null;
  const share = getDb().prepare('SELECT * FROM shares WHERE id = ?').get(shareId);
  if (!share || !share.is_active) return null;
  if (share.expires_at && new Date(share.expires_at) < new Date()) return null;
  if (!verifyToken(share, token)) return null;
  // Local-sync shares answer from the cache, so they keep working if Immich is unreachable
  if (isLocalReady(share) && localHasAsset(share.id, assetId)) return share;
  try {
    if (!(await shareContainsAsset(share, assetId))) return null;
  } catch {
    return null;
  }
  return share;
}

// Stream an upstream response to the client. Tears both sides down if either
// fails, so a dropped client doesn't leave the Immich download running and a
// dropped Immich connection doesn't leave the client hanging.
function pipeUpstream(upstream, res) {
  pipeline(upstream.body, res, () => {});
}

// ── Thumbnail ─────────────────────────────────────────────────────────────────
router.get('/thumbnail/:shareId/:assetId', async (req, res) => {
  const { shareId, assetId } = req.params;
  const share = await authorizeAsset(shareId, assetId, req.query.t);
  if (!share) {
    return res.status(401).send('Unauthorized');
  }
  if (share.local_sync) {
    const cached = getCachedFile(share.id, assetId, 'thumbnail');
    if (cached) return sendCached(res, cached);
  }
  try {
    const upstream = await proxyAssetThumbnail(assetId, 'thumbnail');
    res.set('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
    res.set('Cache-Control', 'private, max-age=86400');
    pipeUpstream(upstream, res);
  } catch (err) {
    res.status(502).send('Upstream error');
  }
});

// ── Preview (large thumbnail) ─────────────────────────────────────────────────
router.get('/preview/:shareId/:assetId', async (req, res) => {
  const { shareId, assetId } = req.params;
  const share = await authorizeAsset(shareId, assetId, req.query.t);
  if (!share) {
    return res.status(401).send('Unauthorized');
  }
  if (share.local_sync) {
    const cached = getCachedFile(share.id, assetId, 'preview');
    if (cached) return sendCached(res, cached);
  }
  try {
    const upstream = await proxyAssetThumbnail(assetId, 'preview');
    res.set('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
    res.set('Cache-Control', 'private, max-age=86400');
    pipeUpstream(upstream, res);
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
  if (share.local_sync) {
    const cached = getCachedFile(share.id, assetId, 'original');
    if (cached) return sendCached(res, cached, { download: true });
  }
  try {
    const upstream = await proxyAssetOriginal(assetId);
    res.set('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
    // Forward content-disposition from Immich (includes filename)
    const cd = upstream.headers.get('content-disposition');
    if (cd) res.set('Content-Disposition', cd);
    else res.set('Content-Disposition', 'attachment');
    res.set('Cache-Control', 'private, max-age=3600');
    pipeUpstream(upstream, res);
  } catch (err) {
    res.status(502).send('Upstream error');
  }
});

// ── Video with Range support (needed for seeking) ─────────────────────────────
router.get('/video/:shareId/:assetId', async (req, res) => {
  const { shareId, assetId } = req.params;
  const share = await authorizeAsset(shareId, assetId, req.query.t);
  if (!share) {
    return res.status(401).send('Unauthorized');
  }
  // Cached original supports Range natively (Express sendFile)
  if (share.local_sync) {
    const cached = getCachedFile(share.id, assetId, 'original');
    if (cached) {
      // This route streams the full original. Only do that for videos — for a
      // photo it would hand out the original file (EXIF/GPS included) even on
      // shares where downloads are switched off.
      if (!cached.isVideo && !share.allow_download) return res.status(403).send('Not a video');
      return sendCached(res, cached);
    }
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

    pipeUpstream(upstream, res);
  } catch (err) {
    res.status(502).send('Upstream error');
  }
});

module.exports = router;
