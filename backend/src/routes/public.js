const express = require('express');
const bcrypt = require('bcryptjs');
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
// Streams a ZIP of all original assets in the share.
// Uses no extra npm packages — assembles ZIP manually (STORE method, no compression).
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

    // We build a DEFLATE-free ZIP (method=0, STORE) by streaming it manually.
    // This avoids pulling in archiver/jszip and works fine for photos
    // (which are already compressed).
    const crc32Table = makeCrc32Table();

    const centralDir = [];
    let offset = 0;

    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];
      let upstream;
      try {
        upstream = await proxyAssetOriginal(asset.id);
      } catch {
        continue; // skip assets that fail
      }

      // Determine filename
      const contentDisp = upstream.headers.get('content-disposition') || '';
      let filename = asset.originalFileName || asset.id;
      const cdMatch = contentDisp.match(/filename[^;=\n]*=(['"]?)([^'";\n]+)\1/i);
      if (cdMatch) filename = cdMatch[2].trim();
      // Ensure unique names
      filename = `${String(i + 1).padStart(4, '0')}_${filename}`;

      // Read full file into buffer (needed for size + crc before writing LFH)
      const chunks = [];
      for await (const chunk of upstream.body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const fileData = Buffer.concat(chunks);
      const crc = crc32(crc32Table, fileData);
      const size = fileData.length;

      const nameBytes = Buffer.from(filename, 'utf8');
      const dosTime = dosDateTime(new Date());

      // Local file header
      const lfh = Buffer.alloc(30 + nameBytes.length);
      lfh.writeUInt32LE(0x04034b50, 0);  // signature
      lfh.writeUInt16LE(20, 4);           // version needed
      lfh.writeUInt16LE(0, 6);            // flags
      lfh.writeUInt16LE(0, 8);            // compression: STORE
      lfh.writeUInt16LE(dosTime.time, 10);
      lfh.writeUInt16LE(dosTime.date, 12);
      lfh.writeUInt32LE(crc >>> 0, 14);
      lfh.writeUInt32LE(size, 18);
      lfh.writeUInt32LE(size, 22);
      lfh.writeUInt16LE(nameBytes.length, 26);
      lfh.writeUInt16LE(0, 28);           // extra field length
      nameBytes.copy(lfh, 30);

      res.write(lfh);
      res.write(fileData);

      // Central directory entry
      const cde = Buffer.alloc(46 + nameBytes.length);
      cde.writeUInt32LE(0x02014b50, 0);  // signature
      cde.writeUInt16LE(20, 4);           // version made by
      cde.writeUInt16LE(20, 6);           // version needed
      cde.writeUInt16LE(0, 8);            // flags
      cde.writeUInt16LE(0, 10);           // compression: STORE
      cde.writeUInt16LE(dosTime.time, 12);
      cde.writeUInt16LE(dosTime.date, 14);
      cde.writeUInt32LE(crc >>> 0, 16);
      cde.writeUInt32LE(size, 20);
      cde.writeUInt32LE(size, 24);
      cde.writeUInt16LE(nameBytes.length, 28);
      cde.writeUInt16LE(0, 30);           // extra
      cde.writeUInt16LE(0, 32);           // comment
      cde.writeUInt16LE(0, 34);           // disk start
      cde.writeUInt16LE(0, 36);           // internal attrs
      cde.writeUInt32LE(0, 38);           // external attrs
      cde.writeUInt32LE(offset, 42);      // local header offset
      nameBytes.copy(cde, 46);

      centralDir.push(cde);
      offset += lfh.length + size;
    }

    // Write central directory
    const cdOffset = offset;
    for (const cde of centralDir) res.write(cde);

    const cdSize = centralDir.reduce((a, b) => a + b.length, 0);

    // End of central directory record
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);             // disk number
    eocd.writeUInt16LE(0, 6);             // disk with cd start
    eocd.writeUInt16LE(centralDir.length, 8);
    eocd.writeUInt16LE(centralDir.length, 10);
    eocd.writeUInt32LE(cdSize, 12);
    eocd.writeUInt32LE(cdOffset, 16);
    eocd.writeUInt16LE(0, 20);            // comment length
    res.write(eocd);
    res.end();

  } catch (err) {
    if (!res.headersSent) {
      res.status(502).send(`ZIP generation failed: ${err.message}`);
    }
  }
});

// ── Upload assets to share ────────────────────────────────────────────────────
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
      await fetch(`${immichUrl}/api/albums/${share.immich_album_id}/assets`, {
        method: 'PUT',
        headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [uploadData.id] }),
      });
    }

    logAccess(share, req, 'upload');

    res.json({ success: true, assetId: uploadData.id });
  } catch (err) {
    res.status(502).json({ error: `Upload failed: ${err.message}` });
  }
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

function crc32(table, buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function dosDateTime(d) {
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() >> 1) & 0x1f);
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f);
  return { time, date };
}

module.exports = router;