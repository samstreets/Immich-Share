/**
 * Album watcher — periodically checks shares that have watch_tag_ids set,
 * fetches the album's current asset list, and applies the configured tags
 * to any assets that have appeared since the last check.
 *
 * Runs in the same Node process as the Express server (started from index.js).
 * Check interval: every 5 minutes by default (WATCH_INTERVAL_MS env var).
 */

'use strict';

const { getDb } = require('./db');
const { getAlbum, tagAssets } = require('./immich');

const INTERVAL_MS = parseInt(process.env.WATCH_INTERVAL_MS || String(5 * 60 * 1000), 10);

async function runWatcher() {
  const db = getDb();

  // Find all active album shares that have watch_tag_ids configured
  const shares = db.prepare(`
    SELECT id, name, immich_album_id, watch_tag_ids, watch_last_seen_ids
    FROM shares
    WHERE is_active = 1
      AND share_type = 'album'
      AND watch_tag_ids IS NOT NULL
      AND watch_tag_ids != ''
      AND immich_album_id IS NOT NULL
  `).all();

  if (shares.length === 0) return;

  console.log(`[watcher] Checking ${shares.length} watched share(s)…`);

  for (const share of shares) {
    try {
      const tagIds = share.watch_tag_ids.split(',').map(s => s.trim()).filter(Boolean);
      if (tagIds.length === 0) continue;

      // Fetch current album assets from Immich
      const album = await getAlbum(share.immich_album_id);
      const currentAssets = album.assets || [];
      const currentIds = new Set(currentAssets.map(a => a.id));

      // Load previously seen IDs
      let seenIds = new Set();
      if (share.watch_last_seen_ids) {
        try {
          seenIds = new Set(JSON.parse(share.watch_last_seen_ids));
        } catch { /* ignore parse errors — treat as empty */ }
      }

      // New assets = in current but not in seen
      const newIds = [...currentIds].filter(id => !seenIds.has(id));

      if (newIds.length > 0) {
        console.log(`[watcher] Share "${share.name}": ${newIds.length} new asset(s) — applying ${tagIds.length} tag(s)`);

        for (const tagId of tagIds) {
          try {
            await tagAssets(tagId, newIds);
          } catch (err) {
            console.error(`[watcher] Failed to apply tag ${tagId} to share "${share.name}": ${err.message}`);
          }
        }
      }

      // Always update seen IDs to the current full set
      db.prepare(`
        UPDATE shares SET watch_last_seen_ids = ? WHERE id = ?
      `).run(JSON.stringify([...currentIds]), share.id);

    } catch (err) {
      console.error(`[watcher] Error processing share "${share.name}" (${share.id}): ${err.message}`);
    }
  }
}

let _timer = null;

function startWatcher() {
  if (_timer) return; // already running

  console.log(`[watcher] Starting album watcher (interval: ${INTERVAL_MS / 1000}s)`);

  // Run once at startup after a short delay (let Immich connection settle)
  const startupDelay = setTimeout(runWatcher, 15_000);

  _timer = setInterval(runWatcher, INTERVAL_MS);

  // Allow clean shutdown
  function stop() {
    clearTimeout(startupDelay);
    clearInterval(_timer);
    _timer = null;
  }

  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

module.exports = { startWatcher, runWatcher };
