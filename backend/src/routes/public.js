const express = require('express');
const bcrypt = require('bcryptjs');
const os = require('os');
const fs = require('fs');
const pathLib = require('path');
const { getDb } = require('../db');
const { getAlbum, getAssetsByTag, proxyAssetOriginal } = require('../immich');
const { makeToken, verifyToken } = require('../shareSession');

const router = express.Router();

function logAccess(share, req, action = 'view') {
  try {
    const db = getDb();
    db.prepare(
      'INSERT INTO access_logs (share_id, share_name, ip_address, user_agent, action) VALUES (?, ?, ?, ?, ?)'
    ).run(
      share.id,
      share.name || null,
      req.ip,
      req.headers['user-agent'] || '',
      action
    );
    if (action === 'view') {
      db.prepare('UPDATE shares SET view_count = view_count + 1 WHERE id = ?').run(share.id);
    }
  } catch (_) {}
}

function getActiveShare(id) {
  const db = getDb();
  // Accept either UUID id OR custom slug
  const share = db.prepare(
    'SELECT * FROM shares WHERE (id = ? OR slug = ?) AND is_active = 1'
  ).get(id, id);
  if (!share) return null;
  if (share.expires_at && new Date(share.expires_at) < new Date()) return null;
  return share;
}

// Public share info (no auth) — used by the password gate page
// Accepts both UUID and slug
router.get('/info/:id', (req, res) => {
  const db = getDb();
  const share = db.prepare(
    `SELECT id, slug, name, description, expires_at, is_active
     FROM shares WHERE id = ? OR slug = ?`
  ).get(req.params.id, req.params.id);
  if (!share) return res.status(404).json({ error: 'Share not found' });

  const appNameRow = db.prepare("SELECT value FROM settings WHERE key = 'app_name'").get();
  res.json({
    id: share.id,
    slug: share.slug,
    name: share.name,
    description: share.description,
    isExpired: share.expires_at ? new Date(share.expires_at) < new Date() : false,
    isActive: share.is_active === 1,
    appName: appNameRow?.value || 'Immich Share',
  });
});

// Healthcheck (no auth)
router.get('/info/healthcheck', (req, res) => {
  res.json({ status: 'ok' });
});

// Verify password -> short-lived HMAC session token
router.post('/verify/:id', async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });

  const share = getActiveShare(req.params.id);
  if (!share) return res.status(404).json({ error: 'Share not found or inactive' });

  const valid = await bcrypt.compare(password, share.password_hash);
  if (!valid) return res.status(401).json({ error: 'Incorrect password' });

  logAccess(share, req, 'view');

  // Always issue token keyed to the real UUID (not slug)
  const sessionToken = makeToken(share.id);
  res.json({
    id: share.id,
    slug: share.slug,
    name: share.name,
    description: share.description,
    share_type: share.share_type,
    allow_download: share.allow_download === 1,
    allow_upload: share.allow_upload === 1,
    show_metadata: share.show_metadata === 1,
    sessionToken,
    verified: true,
  });
});

// Fetch share contents (requires session token)
router.post('/content/:id', async (req, res) => {
  const { sessionToken } = req.body;
  if (!sessionToken) return res.status(400).json({ error: 'Session token required' });

  // Resolve slug -> id if needed
  const share = getActiveShare(req.params.id);
  if (!share) return res.status(404).json({ error: 'Share not found' });

  if (!verifyToken(share.id, sessionToken)) {
    return res.status(401).json({ error: 'Invalid or expired session. Please re-enter the password.' });
  }

  try {
    let assets = [];
    if (share.share_type === 'album') {
      const album = await getAlbum(share.immich_album_id);
      assets = album.assets || [];
    } else if (share.share_type === 'tag') {
      assets = await getAssetsByTag(share.immich_tag_id);
    }

    const sanitized = assets.map(a => ({
      id: a.id,
      type: a.type,
      originalFileName: share.show_metadata ? a.originalFileName : undefined,
      fileCreatedAt: share.show_metadata ? a.fileCreatedAt : undefined,
      exifInfo: share.show_metadata ? a.exifInfo : undefined,
      duration: a.duration,
      thumbnailUrl: `/api/proxy/thumbnail/${share.id}/${a.id}`,
      previewUrl:   `/api/proxy/preview/${share.id}/${a.id}`,
      originalUrl:  share.allow_download ? `/api/proxy/original/${share.id}/${a.id}` : undefined,
      videoUrl:     a.type === 'VIDEO'   ? `/api/proxy/video/${share.id}/${a.id}`    : undefined,
    }));

    res.json({ assets: sanitized, total: sanitized.length });
  } catch (err) {
    res.status(502).json({ error: `Failed to fetch content: ${err.message}` });
  }
});

// ── Download all as ZIP ───────────────────────────────────────────────────────
// GET /public/zip/:id?t=<sessionToken>
//
// Streams a ZIP using data descriptors (flag bit 3).  Each asset is piped
// directly from Immich → client with NO intermediate buffer.  CRC-32 and
// file size are computed incrementally while streaming and written in a
// trailing Data Descriptor record.  RAM usage is O(1) regardless of album size.
router.get('/zip/:id', async (req, res) => {
  const sessionToken = req.query.t;
  if (!sessionToken) return res.status(400).send('Session token required');

  const share = getActiveShare(req.params.id);
  if (!share) return res.status(404).send('Share not found');
  if (!share.allow_download) return res.status(403).send('Downloads not allowed for this share');

  if (!verifyToken(share.id, sessionToken)) {
    return res.status(401).send('Invalid or expired session');
  }

  try {
    let assets = [];
    if (share.share_type === 'album') {
      const album = await getAlbum(share.immich_album_id);
      assets = album.assets || [];
    } else if (share.share_type === 'tag') {
      assets = await getAssetsByTag(share.immich_tag_id);
    }

    if (assets.length === 0) {
      return res.status(404).send('No assets found');
    }

    const safeName = share.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60) || 'share';
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.zip"`);
    res.setHeader('Transfer-Encoding', 'chunked');

    const crc32Table = makeCrc32Table();
    const centralDir = [];
    let offset = 0;

    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];
      let upstream;
      try {
        upstream = await proxyAssetOriginal(asset.id);
      } catch {
        continue;
      }

      // Derive filename
      const contentDisp = upstream.headers.get('content-disposition') || '';
      let filename = asset.originalFileName || asset.id;
      const cdMatch = contentDisp.match(/filename[^;=\n]*=(['"]?)([^'";\n]+)\1/i);
      if (cdMatch) filename = cdMatch[2].trim();
      filename = `${String(i + 1).padStart(4, '0')}_${filename}`;

      const nameBytes = Buffer.from(filename, 'utf8');
      const dosTime = dosDateTime(new Date());

      // ── Local File Header ─────────────────────────────────────────────────
      // Flag 0x0808: bit3 = data descriptor present, bit11 = UTF-8 filename.
      // CRC and sizes are 0 here — filled by the Data Descriptor below.
      const lfh = Buffer.alloc(30 + nameBytes.length);
      lfh.writeUInt32LE(0x04034b50, 0);   // signature
      lfh.writeUInt16LE(20, 4);            // version needed (2.0)
      lfh.writeUInt16LE(0x0808, 6);        // general purpose flags
      lfh.writeUInt16LE(0, 8);             // compression: STORE
      lfh.writeUInt16LE(dosTime.time, 10);
      lfh.writeUInt16LE(dosTime.date, 12);
      lfh.writeUInt32LE(0, 14);            // CRC-32 placeholder
      lfh.writeUInt32LE(0, 18);            // compressed size placeholder
      lfh.writeUInt32LE(0, 22);            // uncompressed size placeholder
      lfh.writeUInt16LE(nameBytes.length, 26);
      lfh.writeUInt16LE(0, 28);            // extra field length
      nameBytes.copy(lfh, 30);

      res.write(lfh);

      // ── Stream file data, computing CRC-32 and size incrementally ─────────
      let crc = 0xFFFFFFFF;
      let fileSize = 0;

      for await (const chunk of upstream.body) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        for (let j = 0; j < buf.length; j++) {
          crc = (crc >>> 8) ^ crc32Table[(crc ^ buf[j]) & 0xFF];
        }
        fileSize += buf.length;
        res.write(buf);
      }

      crc = (crc ^ 0xFFFFFFFF) >>> 0;

      // ── Data Descriptor ───────────────────────────────────────────────────
      const dd = Buffer.alloc(16);
      dd.writeUInt32LE(0x08074b50, 0);   // optional signature
      dd.writeUInt32LE(crc, 4);
      dd.writeUInt32LE(fileSize, 8);     // compressed size (= uncompressed, STORE)
      dd.writeUInt32LE(fileSize, 12);    // uncompressed size
      res.write(dd);

      // ── Central Directory record (queued, written after all files) ────────
      const cde = Buffer.alloc(46 + nameBytes.length);
      cde.writeUInt32LE(0x02014b50, 0);
      cde.writeUInt16LE(20, 4);           // version made by
      cde.writeUInt16LE(20, 6);           // version needed
      cde.writeUInt16LE(0x0808, 8);       // flags (match LFH)
      cde.writeUInt16LE(0, 10);           // compression: STORE
      cde.writeUInt16LE(dosTime.time, 12);
      cde.writeUInt16LE(dosTime.date, 14);
      cde.writeUInt32LE(crc, 16);
      cde.writeUInt32LE(fileSize, 20);
      cde.writeUInt32LE(fileSize, 24);
      cde.writeUInt16LE(nameBytes.length, 28);
      cde.writeUInt16LE(0, 30);  // extra field length
      cde.writeUInt16LE(0, 32);  // file comment length
      cde.writeUInt16LE(0, 34);  // disk number start
      cde.writeUInt16LE(0, 36);  // internal file attributes
      cde.writeUInt32LE(0, 38);  // external file attributes
      cde.writeUInt32LE(offset, 42);  // relative offset of LFH
      nameBytes.copy(cde, 46);

      centralDir.push(cde);
      // Advance offset: LFH + raw file data + data descriptor
      offset += lfh.length + fileSize + 16;
    }

    // ── Central Directory ─────────────────────────────────────────────────────
    const cdOffset = offset;
    for (const cde of centralDir) res.write(cde);
    const cdSize = centralDir.reduce((a, b) => a + b.length, 0);

    // ── End of Central Directory record ──────────────────────────────────────
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);   // disk number
    eocd.writeUInt16LE(0, 6);   // disk with CD start
    eocd.writeUInt16LE(centralDir.length, 8);
    eocd.writeUInt16LE(centralDir.length, 10);
    eocd.writeUInt32LE(cdSize, 12);
    eocd.writeUInt32LE(cdOffset, 16);
    eocd.writeUInt16LE(0, 20);  // comment length
    res.write(eocd);
    res.end();

  } catch (err) {
    if (!res.headersSent) {
      res.status(502).send(`ZIP generation failed: ${err.message}`);
    }
  }
});

// ── Original single-request upload (kept for backward compatibility) ──────────
router.post('/upload/:id', async (req, res) => {
  const sessionToken = req.query.t;
  if (!sessionToken) return res.status(400).json({ error: 'Session token required' });

  const share = getActiveShare(req.params.id);
  if (!share) return res.status(404).json({ error: 'Share not found' });

  if (!verifyToken(share.id, sessionToken)) {
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }

  if (!share.allow_upload) return res.status(403).json({ error: 'Uploads not allowed for this share' });

  const fetch = require('node-fetch');
  const settingsDb = getDb();
  const urlRow = settingsDb.prepare("SELECT value FROM settings WHERE key = 'immich_url'").get();
  const keyRow = settingsDb.prepare("SELECT value FROM settings WHERE key = 'immich_api_key'").get();
  const immichUrl = urlRow?.value?.replace(/\/$/, '') || '';
  const apiKey = keyRow?.value || '';

  if (!immichUrl || !apiKey) {
    return res.status(502).json({ error: 'Immich not configured' });
  }

  const contentType = req.headers['content-type'];
  try {
    const uploadRes = await fetch(`${immichUrl}/api/assets`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': contentType,
        'x-immich-checksum': req.headers['x-immich-checksum'] || '',
      },
      body: req,
    });

    const uploadData = await uploadRes.json();

    if (!uploadRes.ok) {
      return res.status(uploadRes.status).json({ error: uploadData.message || 'Upload failed' });
    }

    if (share.share_type === 'album' && uploadData.id) {
      const albumRes = await fetch(`${immichUrl}/api/albums/${share.immich_album_id}/assets`, {
        method: 'PUT',
        headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [uploadData.id] }),
      });
      if (!albumRes.ok) {
        const albumErr = await albumRes.text();
        console.error(`[upload] Failed to add asset ${uploadData.id} to album ${share.immich_album_id}: ${albumRes.status} ${albumErr}`);
      } else {
        const albumData = await albumRes.json();
        console.log(`[upload] Album add result:`, JSON.stringify(albumData));
      }
    }

    logAccess(share, req, 'upload');
    res.json({ success: true, assetId: uploadData.id });
  } catch (err) {
    res.status(502).json({ error: `Upload failed: ${err.message}` });
  }
});

// ── Chunked upload: receive one chunk ─────────────────────────────────────────
// POST /public/upload-chunk/:id?t=<token>
// Body: multipart/form-data with fields:
//   chunkData    - the raw bytes for this chunk
//   uploadId     - client-generated UUID for this upload session
//   chunkIndex   - 0-based index
//   totalChunks  - total number of chunks
//   filename     - original filename
router.post('/upload-chunk/:id', async (req, res) => {
  const sessionToken = req.query.t;
  if (!sessionToken) return res.status(400).json({ error: 'Session token required' });

  const share = getActiveShare(req.params.id);
  if (!share) return res.status(404).json({ error: 'Share not found' });
  if (!verifyToken(share.id, sessionToken)) return res.status(401).json({ error: 'Invalid or expired session.' });
  if (!share.allow_upload) return res.status(403).json({ error: 'Uploads not allowed for this share' });

  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) {
    return res.status(400).json({ error: 'Expected multipart/form-data' });
  }

  const boundaryMatch = contentType.match(/boundary=([^\s;]+)/);
  if (!boundaryMatch) return res.status(400).json({ error: 'Missing multipart boundary' });

  // Buffer the stream — chunks are small (≤ ~5 MB)
  const buffers = [];
  for await (const chunk of req) buffers.push(chunk);
  const body = Buffer.concat(buffers);

  const parts = parseMultipart(body, boundaryMatch[1]);

  const fields = {};
  let chunkBuffer = null;

  for (const part of parts) {
    const nameMatch = part.headers['content-disposition']?.match(/name="([^"]+)"/);
    if (!nameMatch) continue;
    const fieldName = nameMatch[1];
    if (fieldName === 'chunkData') {
      chunkBuffer = part.data;
    } else {
      fields[fieldName] = part.data.toString('utf8').trim();
    }
  }

  const { uploadId, chunkIndex, totalChunks, filename } = fields;
  if (!uploadId || chunkIndex === undefined || !totalChunks || !chunkBuffer) {
    return res.status(400).json({ error: 'Missing required chunk fields (uploadId, chunkIndex, totalChunks, chunkData)' });
  }

  const tmpDir = pathLib.join(os.tmpdir(), 'immich-share-chunks', uploadId);
  fs.mkdirSync(tmpDir, { recursive: true });

  const chunkPath = pathLib.join(tmpDir, `chunk_${String(chunkIndex).padStart(6, '0')}`);
  fs.writeFileSync(chunkPath, chunkBuffer);

  // Write metadata on first chunk arrival (idempotent)
  const metaPath = pathLib.join(tmpDir, 'meta.json');
  if (!fs.existsSync(metaPath)) {
    fs.writeFileSync(metaPath, JSON.stringify({
      uploadId,
      totalChunks: parseInt(totalChunks, 10),
      filename: filename || uploadId,
      shareId: share.id,
      createdAt: Date.now(),
    }));
  }

  return res.json({
    ok: true,
    received: parseInt(chunkIndex, 10) + 1,
    total: parseInt(totalChunks, 10),
  });
});

// ── Chunked upload: assemble and forward to Immich ────────────────────────────
// POST /public/upload-assemble/:id?t=<token>
// Body JSON: { uploadId, filename, deviceAssetId, fileCreatedAt, fileModifiedAt }
// (express.json() is applied to this path in index.js)
router.post('/upload-assemble/:id', async (req, res) => {
  const sessionToken = req.query.t;
  if (!sessionToken) return res.status(400).json({ error: 'Session token required' });

  const share = getActiveShare(req.params.id);
  if (!share) return res.status(404).json({ error: 'Share not found' });
  if (!verifyToken(share.id, sessionToken)) return res.status(401).json({ error: 'Invalid or expired session.' });
  if (!share.allow_upload) return res.status(403).json({ error: 'Uploads not allowed' });

  const { uploadId, filename, deviceAssetId, fileCreatedAt, fileModifiedAt } = req.body;
  if (!uploadId || !filename) return res.status(400).json({ error: 'Missing uploadId or filename' });

  const tmpDir = pathLib.join(os.tmpdir(), 'immich-share-chunks', uploadId);
  const metaPath = pathLib.join(tmpDir, 'meta.json');

  if (!fs.existsSync(metaPath)) {
    return res.status(404).json({ error: 'Upload session not found. Chunks may have expired.' });
  }

  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  } catch {
    return res.status(500).json({ error: 'Could not read upload session metadata' });
  }

  // Verify every chunk is present before assembling
  const chunkFiles = [];
  for (let i = 0; i < meta.totalChunks; i++) {
    const p = pathLib.join(tmpDir, `chunk_${String(i).padStart(6, '0')}`);
    if (!fs.existsSync(p)) {
      return res.status(400).json({ error: `Missing chunk ${i} of ${meta.totalChunks}. Please retry the upload.` });
    }
    chunkFiles.push(p);
  }

  // Assemble chunks into one buffer
  const chunkBuffers = chunkFiles.map(p => fs.readFileSync(p));
  const fileData = Buffer.concat(chunkBuffers);

  // Get Immich config
  const settingsDb = getDb();
  const urlRow = settingsDb.prepare("SELECT value FROM settings WHERE key = 'immich_url'").get();
  const keyRow = settingsDb.prepare("SELECT value FROM settings WHERE key = 'immich_api_key'").get();
  const immichUrl = urlRow?.value?.replace(/\/$/, '') || '';
  const apiKey = keyRow?.value || '';

  if (!immichUrl || !apiKey) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return res.status(502).json({ error: 'Immich not configured' });
  }

  try {
    const fetch = require('node-fetch');
    const mimeType = guessMimeType(filename);
    const boundary = '----ImmichShareBoundary' + Date.now().toString(16);

    const buildField = (name, value) => Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n`),
      Buffer.from(String(value)),
      Buffer.from('\r\n'),
    ]);

    const buildFile = (name, fname, mime, data) => Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${fname}"\r\nContent-Type: ${mime}\r\n\r\n`),
      data,
      Buffer.from('\r\n'),
    ]);

    const bodyBuffer = Buffer.concat([
      buildFile('assetData', filename, mimeType, fileData),
      buildField('deviceAssetId', deviceAssetId || `${filename}-${Date.now()}`),
      buildField('deviceId', 'immich-share-chunked-upload'),
      buildField('fileCreatedAt', fileCreatedAt || new Date().toISOString()),
      buildField('fileModifiedAt', fileModifiedAt || new Date().toISOString()),
      Buffer.from(`--${boundary}--\r\n`),
    ]);

    const uploadRes = await fetch(`${immichUrl}/api/assets`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': String(bodyBuffer.length),
      },
      body: bodyBuffer,
    });

    const uploadData = await uploadRes.json();
    console.log(`[upload-assemble] Immich upload response (${uploadRes.status}):`, JSON.stringify(uploadData));

    if (!uploadRes.ok) {
      throw new Error(uploadData.message || `Immich responded with ${uploadRes.status}`);
    }

    // Immich may return the existing asset id if it's a duplicate — use it either way
    const assetId = uploadData.id;

    if (!assetId) {
      throw new Error('Immich did not return an asset ID. Response: ' + JSON.stringify(uploadData));
    }

    // Add to album if applicable
    if (share.share_type === 'album') {
      const albumRes = await fetch(`${immichUrl}/api/albums/${share.immich_album_id}/assets`, {
        method: 'PUT',
        headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [assetId] }),
      });

      if (!albumRes.ok) {
        const albumErr = await albumRes.text();
        console.error(`[upload-assemble] Failed to add asset ${assetId} to album ${share.immich_album_id}: ${albumRes.status} ${albumErr}`);
        // Upload succeeded but album add failed — tell the client
        logAccess(share, req, 'upload');
        return res.json({
          success: true,
          assetId,
          warning: `File uploaded to Immich but could not be added to the album (HTTP ${albumRes.status}). Check server logs.`,
        });
      }

      const albumData = await albumRes.json();
      console.log(`[upload-assemble] Album add result:`, JSON.stringify(albumData));
    }

    logAccess(share, req, 'upload');
    res.json({ success: true, assetId });

  } catch (err) {
    console.error('[upload-assemble] Error:', err.message);
    res.status(502).json({ error: `Assembly/upload failed: ${err.message}` });
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
});

// ── Chunked upload: cancel / clean up ────────────────────────────────────────
// DELETE /public/upload-chunk/:id/:uploadId?t=<token>
router.delete('/upload-chunk/:id/:uploadId', (req, res) => {
  const sessionToken = req.query.t;
  if (!sessionToken) return res.status(400).json({ error: 'Session token required' });

  const share = getActiveShare(req.params.id);
  if (!share || !verifyToken(share.id, sessionToken)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const tmpDir = pathLib.join(os.tmpdir(), 'immich-share-chunks', req.params.uploadId);
  try {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
  res.json({ ok: true });
});

// ── ZIP helpers ───────────────────────────────────────────────────────────────

function makeCrc32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  return table;
}

function dosDateTime(d) {
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() >> 1) & 0x1f);
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f);
  return { time, date };
}

// ── Chunked upload helpers ────────────────────────────────────────────────────

/**
 * Minimal multipart/form-data parser.
 * Returns array of { headers: { key: value }, data: Buffer }
 */
function parseMultipart(body, boundary) {
  const parts = [];
  const boundaryBuf = Buffer.from('\r\n--' + boundary);
  const startBuf    = Buffer.from('--' + boundary);

  let pos = body.indexOf(startBuf);
  if (pos === -1) return parts;
  pos += startBuf.length;

  while (pos < body.length) {
    // Final boundary ends with --
    if (body[pos] === 0x2d && body[pos + 1] === 0x2d) break;
    // Skip \r\n after boundary line
    if (body[pos] === 0x0d && body[pos + 1] === 0x0a) pos += 2;

    // Find end of headers (\r\n\r\n)
    const headerEnd = body.indexOf(Buffer.from('\r\n\r\n'), pos);
    if (headerEnd === -1) break;

    const headerStr = body.slice(pos, headerEnd).toString('utf8');
    const headers = {};
    for (const line of headerStr.split('\r\n')) {
      const colon = line.indexOf(':');
      if (colon !== -1) {
        headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
      }
    }

    pos = headerEnd + 4; // skip \r\n\r\n

    // Find next boundary
    const nextBoundary = body.indexOf(boundaryBuf, pos);
    const dataEnd = nextBoundary !== -1 ? nextBoundary : body.length;
    parts.push({ headers, data: body.slice(pos, dataEnd) });

    if (nextBoundary === -1) break;
    pos = nextBoundary + boundaryBuf.length;
  }

  return parts;
}

function guessMimeType(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  const map = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif',  webp: 'image/webp', heic: 'image/heic',
    heif: 'image/heif', tiff: 'image/tiff', tif: 'image/tiff',
    mp4: 'video/mp4',  mov: 'video/quicktime', avi: 'video/x-msvideo',
    mkv: 'video/x-matroska', webm: 'video/webm', m4v: 'video/mp4',
    '3gp': 'video/3gpp',
  };
  return map[ext] || 'application/octet-stream';
}

module.exports = router;
