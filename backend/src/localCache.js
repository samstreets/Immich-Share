'use strict';

/**
 * Local sync — keeps a share's media (thumbnails, previews, originals) on this
 * server's disk so viewers are served locally instead of proxying Immich on
 * every request.
 *
 * Layout (under CACHE_DIR, default <data dir>/cache):
 *   assets/<assetId>/{thumbnail,preview,original}   cached Immich assets
 *   pending/<uploadId>                              uploads waiting to reach Immich
 *
 * Uploads to a local-sync share are written to disk first, then forwarded to
 * Immich (retried each cycle if Immich is unreachable). After Immich accepts
 * them the file is kept in the cache as the asset's original.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const fetch = require('node-fetch');
const { getDb } = require('./db');
const {
  getAlbumAssets, getAssetsByTag, proxyAssetThumbnail, proxyAssetOriginal,
  tagAssets, getImmichConfig,
} = require('./immich');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/app.db');
const CACHE_DIR = process.env.CACHE_DIR || path.join(path.dirname(DB_PATH), 'cache');
const ASSETS_DIR = path.join(CACHE_DIR, 'assets');
const PENDING_DIR = path.join(CACHE_DIR, 'pending');

const INTERVAL_MS = parseInt(process.env.LOCAL_SYNC_INTERVAL_MS || String(5 * 60 * 1000), 10);
const CONCURRENCY = Math.max(1, parseInt(process.env.LOCAL_SYNC_CONCURRENCY || '3', 10));
const MAX_UPLOAD_ATTEMPTS = 50;

const KINDS = {
  thumbnail: { mimeCol: 'thumb_mime' },
  preview:   { mimeCol: 'preview_mime' },
  original:  { mimeCol: 'orig_mime' },
};

function ensureDirs() {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
  fs.mkdirSync(PENDING_DIR, { recursive: true });
}

const assetDir = (id) => path.join(ASSETS_DIR, id);
const assetFile = (id, kind) => path.join(ASSETS_DIR, id, kind);
const pendingFile = (id) => path.join(PENDING_DIR, id);

function isLocalReady(share) {
  return !!share && share.local_sync === 1 && !!share.local_sync_at;
}

// ── Downloading ───────────────────────────────────────────────────────────────

async function downloadTo(dest, upstream) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.${crypto.randomBytes(4).toString('hex')}.part`;
  try {
    await pipeline(upstream.body, fs.createWriteStream(tmp));
    fs.renameSync(tmp, dest);
  } catch (err) {
    try { fs.rmSync(tmp, { force: true }); } catch {}
    throw err;
  }
}

async function cacheKind(assetId, kind) {
  const upstream = kind === 'original'
    ? await proxyAssetOriginal(assetId)
    : await proxyAssetThumbnail(assetId, kind);
  await downloadTo(assetFile(assetId, kind), upstream);
  return upstream.headers.get('content-type') || null;
}

// ── Sync ──────────────────────────────────────────────────────────────────────

const running = new Map();

/** Sync one share. Concurrent calls for the same share share one run. */
function syncShare(shareId) {
  if (running.has(shareId)) return running.get(shareId);
  const p = _syncShare(shareId).catch(err => {
    console.error(`[local-sync] ${shareId}: ${err.message}`);
  }).finally(() => running.delete(shareId));
  running.set(shareId, p);
  return p;
}

const isSyncing = (shareId) => running.has(shareId);

async function _syncShare(shareId) {
  const db = getDb();
  const share = db.prepare('SELECT * FROM shares WHERE id = ?').get(shareId);
  if (!share || !share.local_sync || !share.is_active) return;
  ensureDirs();

  const startedAt = new Date().toISOString();
  let assets;
  try {
    assets = share.share_type === 'album'
      ? await getAlbumAssets(share.immich_album_id, { withExif: true })
      : await getAssetsByTag(share.immich_tag_id, { withExif: true });
  } catch (err) {
    db.prepare('UPDATE shares SET local_sync_error = ? WHERE id = ?').run(err.message.slice(0, 500), shareId);
    throw err;
  }

  const getRow = db.prepare('SELECT * FROM cached_assets WHERE asset_id = ?');
  const upsert = db.prepare(`
    INSERT INTO cached_assets (asset_id, type, filename, checksum, meta)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(asset_id) DO UPDATE SET
      type = excluded.type, filename = excluded.filename, meta = excluded.meta,
      checksum = COALESCE(excluded.checksum, cached_assets.checksum)
  `);
  const link = db.prepare(`
    INSERT INTO share_cached_assets (share_id, asset_id, sort_order) VALUES (?, ?, ?)
    ON CONFLICT(share_id, asset_id) DO UPDATE SET sort_order = excluded.sort_order
  `);
  const setMime = (col) => db.prepare(`UPDATE cached_assets SET ${col} = ? WHERE asset_id = ?`);

  // Record the list first so the gallery works even while files are still downloading
  db.transaction(() => {
    assets.forEach((a, i) => {
      if (!UUID_RE.test(a.id)) return;
      const meta = {
        type: a.type,
        originalFileName: a.originalFileName,
        fileCreatedAt: a.fileCreatedAt,
        exifInfo: a.exifInfo,
        duration: a.duration,
      };
      upsert.run(a.id, a.type || null, a.originalFileName || null, a.checksum || null, JSON.stringify(meta));
      link.run(shareId, a.id, i);
    });
  })();

  // Download missing / changed files
  let failed = 0;
  const queue = assets.filter(a => UUID_RE.test(a.id));
  async function worker() {
    while (queue.length) {
      const a = queue.shift();
      const prev = getRow.get(a.id);
      const changed = prev?.checksum && a.checksum && prev.checksum !== a.checksum;
      for (const kind of Object.keys(KINDS)) {
        const file = assetFile(a.id, kind);
        if (!changed && fs.existsSync(file)) continue;
        try {
          const mime = await cacheKind(a.id, kind);
          if (mime) setMime(KINDS[kind].mimeCol).run(mime, a.id);
        } catch (err) {
          failed++;
          console.error(`[local-sync] ${shareId} ${a.id} ${kind}: ${err.message}`);
        }
      }
      if (changed) db.prepare('UPDATE cached_assets SET checksum = ? WHERE asset_id = ?').run(a.checksum, a.id);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // Drop assets that left the album/tag. Rows less than 5 minutes old (just-forwarded
  // uploads Immich may not list yet) are left alone and re-checked next cycle.
  const keep = new Set(assets.map(a => a.id));
  const existing = db.prepare(`
    SELECT s.asset_id FROM share_cached_assets s
    JOIN cached_assets c ON c.asset_id = s.asset_id
    WHERE s.share_id = ? AND c.cached_at < datetime(?, '-5 minutes')
  `).all(shareId, startedAt);
  const unlink = db.prepare('DELETE FROM share_cached_assets WHERE share_id = ? AND asset_id = ?');
  let removed = 0;
  for (const r of existing) {
    if (!keep.has(r.asset_id)) { unlink.run(shareId, r.asset_id); removed++; }
  }

  db.prepare(`
    UPDATE shares SET local_sync_at = CURRENT_TIMESTAMP, local_sync_error = ? WHERE id = ?
  `).run(failed ? `${failed} file(s) could not be cached; they are served from Immich` : null, shareId);

  console.log(`[local-sync] "${share.name}": ${assets.length} asset(s), ${removed} removed, ${failed} failed`);
}

/** Delete cached files/rows for assets no share references, and orphaned pending files. */
function sweepOrphans() {
  const db = getDb();
  const orphans = db.prepare(`
    SELECT asset_id FROM cached_assets
    WHERE asset_id NOT IN (SELECT asset_id FROM share_cached_assets)
  `).all();
  for (const { asset_id } of orphans) {
    try { fs.rmSync(assetDir(asset_id), { recursive: true, force: true }); } catch {}
    db.prepare('DELETE FROM cached_assets WHERE asset_id = ?').run(asset_id);
  }
  try {
    const known = new Set(db.prepare('SELECT id FROM pending_uploads').all().map(r => r.id));
    for (const f of fs.readdirSync(PENDING_DIR)) {
      if (!known.has(f)) fs.rmSync(path.join(PENDING_DIR, f), { recursive: true, force: true });
    }
  } catch {}
}

/** Remove everything cached for a share (used when local sync is switched off). */
function purgeShareCache(shareId) {
  const db = getDb();
  db.prepare('DELETE FROM share_cached_assets WHERE share_id = ?').run(shareId);
  db.prepare('DELETE FROM pending_uploads WHERE share_id = ?').run(shareId);
  db.prepare('UPDATE shares SET local_sync_at = NULL, local_sync_error = NULL WHERE id = ?').run(shareId);
  sweepOrphans();
}

// ── Reading from the cache ────────────────────────────────────────────────────

/** Is this asset part of the share according to the local cache (or a pending upload)? */
function localHasAsset(shareId, assetId) {
  const db = getDb();
  if (db.prepare('SELECT 1 FROM share_cached_assets WHERE share_id = ? AND asset_id = ?').get(shareId, assetId)) return true;
  return !!db.prepare('SELECT 1 FROM pending_uploads WHERE share_id = ? AND id = ?').get(shareId, assetId);
}

/** Cached file for an asset: { path, mime, filename } or null. */
function getCachedFile(shareId, assetId, kind) {
  const db = getDb();
  const pending = db.prepare('SELECT * FROM pending_uploads WHERE share_id = ? AND id = ?').get(shareId, assetId);
  if (pending) {
    // The raw upload doubles as its own thumbnail/preview until Immich has generated real ones
    if (kind !== 'original' && !String(pending.mime || '').startsWith('image/')) return null;
    const p = pendingFile(pending.id);
    return fs.existsSync(p) ? { path: p, mime: pending.mime || 'application/octet-stream', filename: pending.filename } : null;
  }
  const row = db.prepare('SELECT * FROM cached_assets WHERE asset_id = ?').get(assetId);
  if (!row || !KINDS[kind]) return null;
  const p = assetFile(assetId, kind);
  if (!fs.existsSync(p)) return null;
  const fallback = kind === 'original' ? 'application/octet-stream' : 'image/jpeg';
  return { path: p, mime: row[KINDS[kind].mimeCol] || fallback, filename: row.filename };
}

/** Asset list for a share from the local cache (synced assets + pending uploads). */
function listLocalAssets(share) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT c.asset_id, c.meta FROM share_cached_assets s
    JOIN cached_assets c ON c.asset_id = s.asset_id
    WHERE s.share_id = ? ORDER BY s.sort_order, c.asset_id
  `).all(share.id);
  const out = [];
  for (const r of rows) {
    let meta = {};
    try { meta = JSON.parse(r.meta || '{}'); } catch {}
    out.push({ id: r.asset_id, ...meta });
  }
  const pending = db.prepare('SELECT * FROM pending_uploads WHERE share_id = ? ORDER BY created_at').all(share.id);
  for (const p of pending) {
    out.push({
      id: p.id,
      type: String(p.mime || '').startsWith('video/') ? 'VIDEO' : 'IMAGE',
      originalFileName: p.filename,
      fileCreatedAt: p.file_created_at,
      exifInfo: { fileSizeInByte: p.size },
      pending: true,
    });
  }
  return out;
}

/** Stream an asset's cached file with Range support. Returns false if not cached. */
function sendCached(res, file, { download = false } = {}) {
  const headers = { 'Content-Type': file.mime, 'Cache-Control': 'private, max-age=3600' };
  if (download) {
    const name = (file.filename || 'download').replace(/[\r\n"\\]/g, '_');
    headers['Content-Disposition'] = `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`;
  }
  res.sendFile(file.path, { headers, dotfiles: 'allow', cacheControl: false }, (err) => {
    if (err && !res.headersSent) res.status(err.status || 500).end();
  });
}

// ── Uploads: save locally, then forward to Immich ────────────────────────────

function guessMime(filename) {
  const ext = (String(filename).split('.').pop() || '').toLowerCase();
  const map = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', tiff: 'image/tiff', tif: 'image/tiff',
    mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo', mkv: 'video/x-matroska',
    webm: 'video/webm', m4v: 'video/mp4', '3gp': 'video/3gpp',
  };
  return map[ext] || 'application/octet-stream';
}

async function applyUploadTags(share, assetId) {
  if (!share.upload_tag_ids) return;
  for (const tagId of share.upload_tag_ids.split(',').map(s => s.trim()).filter(Boolean)) {
    try { await tagAssets(tagId, [assetId]); }
    catch (err) { console.error(`[upload] Failed to apply tag ${tagId} to asset ${assetId}: ${err.message}`); }
  }
}

/**
 * Upload a file (given as an ordered list of file parts) to Immich, add it to
 * the share's album and apply the share's upload tags.
 * Returns { assetId, warning? }. Errors carry `.permanent` for 4xx responses.
 */
async function uploadToImmich(share, { filePaths, filename, fileCreatedAt, fileModifiedAt }) {
  const { url, apiKey } = getImmichConfig();
  if (!url || !apiKey) throw new Error('Immich not configured');

  const boundary = '----ImmichShareBoundary' + crypto.randomBytes(8).toString('hex');
  const field = (name, value) => Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
  const prefix = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="assetData"; filename="${filename}"\r\nContent-Type: ${guessMime(filename)}\r\n\r\n`);
  const suffix = Buffer.from('\r\n');
  // Immich v3 removed deviceId/deviceAssetId from AssetMediaCreateDto — not sent.
  const tail = Buffer.concat([
    field('fileCreatedAt', fileCreatedAt || new Date().toISOString()),
    field('fileModifiedAt', fileModifiedAt || new Date().toISOString()),
    Buffer.from(`--${boundary}--\r\n`),
  ]);
  const fileSize = filePaths.reduce((n, p) => n + fs.statSync(p).size, 0);

  async function* body() {
    yield prefix;
    for (const p of filePaths) for await (const buf of fs.createReadStream(p)) yield buf;
    yield suffix;
    yield tail;
  }

  const res = await fetch(`${url}/api/assets`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': String(prefix.length + fileSize + suffix.length + tail.length),
    },
    body: Readable.from(body()),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || `Immich responded with ${res.status}`);
    err.permanent = res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429;
    throw err;
  }
  const assetId = data.id;
  if (!assetId) throw new Error('Immich did not return an asset ID');

  let warning;
  if (share.share_type === 'album') {
    const albumRes = await fetch(`${url}/api/albums/${share.immich_album_id}/assets`, {
      method: 'PUT',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [assetId] }),
    });
    if (!albumRes.ok) {
      console.error(`[upload] Failed to add asset ${assetId} to album: ${albumRes.status} ${await albumRes.text()}`);
      warning = `File uploaded to Immich but could not be added to the album (HTTP ${albumRes.status}). Check server logs.`;
    }
  }
  await applyUploadTags(share, assetId);
  return { assetId, warning };
}

/**
 * Save an upload to the local cache and queue it for Immich. Returns the
 * pending id (usable immediately as an asset id in the share gallery).
 */
async function enqueueUpload(share, { chunkFiles, filename, fileCreatedAt, fileModifiedAt }) {
  ensureDirs();
  const id = crypto.randomUUID();
  const dest = pendingFile(id);
  try {
    const out = fs.createWriteStream(dest, { mode: 0o600 });
    for (const p of chunkFiles) {
      await new Promise((resolve, reject) => {
        const r = fs.createReadStream(p);
        r.on('error', reject);
        out.on('error', reject);
        r.on('end', resolve);
        r.pipe(out, { end: false });
      });
    }
    await new Promise((resolve, reject) => out.end(err => (err ? reject(err) : resolve())));
  } catch (err) {
    try { fs.rmSync(dest, { force: true }); } catch {}
    throw err;
  }
  const size = fs.statSync(dest).size;
  getDb().prepare(`
    INSERT INTO pending_uploads (id, share_id, filename, mime, size, file_created_at, file_modified_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, share.id, filename, guessMime(filename), size, fileCreatedAt || null, fileModifiedAt || null);
  return id;
}

const forwarding = new Set();

async function forwardPending(row) {
  if (forwarding.has(row.id)) return;
  forwarding.add(row.id);
  const db = getDb();
  try {
    const share = db.prepare('SELECT * FROM shares WHERE id = ?').get(row.share_id);
    if (!share) return;
    const src = pendingFile(row.id);
    if (!fs.existsSync(src)) {
      db.prepare('DELETE FROM pending_uploads WHERE id = ?').run(row.id);
      return;
    }
    let result;
    try {
      result = await uploadToImmich(share, {
        filePaths: [src],
        filename: row.filename,
        fileCreatedAt: row.file_created_at,
        fileModifiedAt: row.file_modified_at,
      });
    } catch (err) {
      db.prepare('UPDATE pending_uploads SET attempts = ?, last_error = ? WHERE id = ?')
        .run(err.permanent ? MAX_UPLOAD_ATTEMPTS : row.attempts + 1, String(err.message).slice(0, 500), row.id);
      console.error(`[local-sync] Upload "${row.filename}" not forwarded yet: ${err.message}`);
      return;
    }

    // Keep the file as the cached original of the new Immich asset
    const { assetId } = result;
    const dir = assetDir(assetId);
    fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(assetFile(assetId, 'original'))) fs.rmSync(src, { force: true });
    else fs.renameSync(src, assetFile(assetId, 'original'));

    const meta = {
      type: String(row.mime || '').startsWith('video/') ? 'VIDEO' : 'IMAGE',
      originalFileName: row.filename,
      fileCreatedAt: row.file_created_at,
      exifInfo: { fileSizeInByte: row.size },
    };
    db.transaction(() => {
      db.prepare(`
        INSERT INTO cached_assets (asset_id, type, filename, orig_mime, meta) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(asset_id) DO UPDATE SET orig_mime = COALESCE(cached_assets.orig_mime, excluded.orig_mime)
      `).run(assetId, meta.type, row.filename, row.mime, JSON.stringify(meta));
      const max = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM share_cached_assets WHERE share_id = ?').get(share.id).m;
      db.prepare('INSERT OR IGNORE INTO share_cached_assets (share_id, asset_id, sort_order) VALUES (?, ?, ?)')
        .run(share.id, assetId, max + 1);
      db.prepare('DELETE FROM pending_uploads WHERE id = ?').run(row.id);
    })();
    console.log(`[local-sync] Upload "${row.filename}" forwarded to Immich as ${assetId}`);
    // Fetch Immich's generated thumbnail/preview for it
    syncShare(share.id);
  } finally {
    forwarding.delete(row.id);
  }
}

let processing = null;
/** Forward every pending upload to Immich. Safe to call often. */
function processPending() {
  if (processing) return processing;
  processing = (async () => {
    const rows = getDb().prepare(
      'SELECT * FROM pending_uploads WHERE attempts < ? ORDER BY created_at'
    ).all(MAX_UPLOAD_ATTEMPTS);
    for (const row of rows) await forwardPending(row);
  })().catch(err => console.error(`[local-sync] pending uploads: ${err.message}`))
    .finally(() => { processing = null; });
  return processing;
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

async function runLocalSync() {
  try {
    ensureDirs();
    await processPending();
    const shares = getDb().prepare(`
      SELECT id FROM shares
      WHERE local_sync = 1 AND is_active = 1
        AND (expires_at IS NULL OR expires_at > datetime('now'))
    `).all();
    for (const s of shares) await syncShare(s.id);
    sweepOrphans();
  } catch (err) {
    console.error(`[local-sync] ${err.message}`);
  }
}

let timer = null;
function startLocalSync() {
  if (timer) return;
  console.log(`[local-sync] Cache dir: ${CACHE_DIR} (interval: ${INTERVAL_MS / 1000}s)`);
  setTimeout(runLocalSync, 20_000);
  timer = setInterval(runLocalSync, INTERVAL_MS);
}

module.exports = {
  startLocalSync, runLocalSync, syncShare, isSyncing, isLocalReady, purgeShareCache, sweepOrphans,
  localHasAsset, getCachedFile, listLocalAssets, sendCached,
  enqueueUpload, processPending,
};
