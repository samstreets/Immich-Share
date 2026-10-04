'use strict';

const { getAlbumAssets, getAssetsByTag } = require('./immich');

const TTL_MS = 30 * 1000;
const cache = new Map();

/** Set of asset ids that belong to a share (cached briefly). */
async function getShareAssetIds(share) {
  const hit = cache.get(share.id);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.ids;
  const assets = share.share_type === 'album'
    ? await getAlbumAssets(share.immich_album_id)
    : await getAssetsByTag(share.immich_tag_id);
  const ids = new Set(assets.map(a => a.id));
  cache.set(share.id, { at: Date.now(), ids });
  return ids;
}

async function shareContainsAsset(share, assetId) {
  return (await getShareAssetIds(share)).has(assetId);
}

module.exports = { shareContainsAsset };
