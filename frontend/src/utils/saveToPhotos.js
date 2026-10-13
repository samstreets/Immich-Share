// Saving to the Photos app (iOS) / gallery (Android) isn't possible with a normal
// file download — browsers put those in Files/Downloads, and ZIPs can't be imported.
// The Web Share API with files opens the native share sheet, which offers
// "Save Image"/"Save Video" (iOS) or Photos/Gallery (Android).

const isMobile = () =>
  typeof navigator !== 'undefined' &&
  (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

export function canShareToPhotos() {
  if (!isMobile() || typeof navigator.canShare !== 'function' || typeof navigator.share !== 'function') return false
  try {
    return navigator.canShare({ files: [new File(['x'], 'x.jpg', { type: 'image/jpeg' })] })
  } catch {
    return false
  }
}

function filenameFrom(res, fallback) {
  const cd = res.headers.get('content-disposition') || ''
  const star = cd.match(/filename\*=(?:UTF-8'')?([^;]+)/i)
  if (star) { try { return decodeURIComponent(star[1].trim().replace(/^"|"$/g, '')) } catch { /* fall through */ } }
  const plain = cd.match(/filename="?([^";]+)"?/i)
  return plain ? plain[1] : fallback
}

// Fetch the original files as File objects. onProgress(done, total) is optional.
export async function fetchAssetFiles(shareId, token, ids, { signal, onProgress } = {}) {
  const files = []
  for (let i = 0; i < ids.length; i++) {
    const res = await fetch(`/api/proxy/original/${shareId}/${encodeURIComponent(ids[i])}?t=${encodeURIComponent(token)}`, { signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const type = blob.type || res.headers.get('content-type') || 'application/octet-stream'
    files.push(new File([blob], filenameFrom(res, `${ids[i]}`), { type }))
    onProgress?.(i + 1, ids.length)
  }
  return files
}

// Opens the share sheet. Must be called from a user gesture (tap).
// Returns false if the user dismissed the sheet.
export async function shareFiles(files) {
  try {
    await navigator.share({ files })
    return true
  } catch (err) {
    if (err.name === 'AbortError') return false
    throw err
  }
}
