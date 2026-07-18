const fetch = require('node-fetch');
const { getDb } = require('./db');

function getImmichConfig() {
  const db = getDb();
  const urlRow = db.prepare("SELECT value FROM settings WHERE key = 'immich_url'").get();
  const keyRow = db.prepare("SELECT value FROM settings WHERE key = 'immich_api_key'").get();
  return {
    url: urlRow?.value?.replace(/\/$/, '') || '',
    apiKey: keyRow?.value || '',
  };
}

async function immichRequest(path, options = {}) {
  const { url, apiKey } = getImmichConfig();
  if (!url || !apiKey) {
    throw new Error('Immich URL or API key not configured');
  }

  const response = await fetch(`${url}/api${path}`, {
    ...options,
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Immich API error ${response.status}: ${text}`);
  }

  return response.json();
}

async function getAlbums() {
  return immichRequest('/albums');
}

async function getAlbum(albumId) {
  return immichRequest(`/albums/${albumId}`);
}

// Immich v3 removed the `assets` property from AlbumResponseDto (GET /albums/:id).
// Fetch an album's assets via POST /search/metadata with an albumIds filter instead,
// paginating through all pages since results are capped per page.
async function getAlbumAssets(albumId) {
  const items = [];
  let page = 1;
  // Safety cap so a misbehaving server can't loop forever.
  for (let i = 0; i < 1000; i++) {
    const result = await immichRequest('/search/metadata', {
      method: 'POST',
      body: JSON.stringify({ albumIds: [albumId], size: 1000, page }),
    });
    const batch = result?.assets?.items || [];
    items.push(...batch);
    const nextPage = result?.assets?.nextPage;
    if (!nextPage || batch.length === 0) break;
    page = typeof nextPage === 'number' ? nextPage : page + 1;
  }
  return items;
}

async function createAlbum(albumName, description = '') {
  return immichRequest('/albums', {
    method: 'POST',
    body: JSON.stringify({ albumName, description }),
  });
}

// Tags — Immich exposes tags under /tags
async function getTags() {
  return immichRequest('/tags');
}

async function createTag(name) {
  return immichRequest('/tags', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

// Tag assets in bulk: PUT /tags/{id}/assets
async function tagAssets(tagId, assetIds) {
  return immichRequest(`/tags/${tagId}/assets`, {
    method: 'PUT',
    body: JSON.stringify({ ids: assetIds }),
  });
}

// Assets for a tag via search
async function getAssetsByTag(tagId) {
  // Immich search endpoint with tag filter
  const body = { tagIds: [tagId], size: 1000, page: 1 };
  const result = await immichRequest('/search/metadata', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  // Result shape: { assets: { items: [...] } }
  return result?.assets?.items || [];
}

async function getAsset(assetId) {
  return immichRequest(`/assets/${assetId}`);
}

async function proxyAssetThumbnail(assetId, size = 'thumbnail') {
  const { url, apiKey } = getImmichConfig();
  if (!url || !apiKey) throw new Error('Immich not configured');

  const response = await fetch(`${url}/api/assets/${assetId}/thumbnail?size=${size}`, {
    headers: { 'x-api-key': apiKey },
  });

  if (!response.ok) throw new Error(`Failed to fetch thumbnail: ${response.status}`);
  return response;
}

async function proxyAssetOriginal(assetId) {
  const { url, apiKey } = getImmichConfig();
  if (!url || !apiKey) throw new Error('Immich not configured');

  const response = await fetch(`${url}/api/assets/${assetId}/original`, {
    headers: { 'x-api-key': apiKey },
  });

  if (!response.ok) throw new Error(`Failed to fetch original: ${response.status}`);
  return response;
}

async function proxyAssetVideo(assetId, rangeHeader) {
  const { url, apiKey } = getImmichConfig();
  if (!url || !apiKey) throw new Error('Immich not configured');

  const headers = { 'x-api-key': apiKey };
  if (rangeHeader) headers['Range'] = rangeHeader;

  const response = await fetch(`${url}/api/assets/${assetId}/video/playback`, { headers });

  if (!response.ok && response.status !== 206) {
    throw new Error(`Failed to fetch video: ${response.status}`);
  }
  return response;
}

async function testConnection() {
  try {
    const result = await immichRequest('/server/ping');
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  getAlbums,
  getAlbum,
  getAlbumAssets,
  createAlbum,
  getTags,
  createTag,
  tagAssets,
  getAssetsByTag,
  getAsset,
  proxyAssetThumbnail,
  proxyAssetOriginal,
  proxyAssetVideo,
  testConnection,
};
