import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'

// Safe JSON fetch — never throws on non-JSON bodies
async function safeFetch(url, options = {}) {
  const res = await fetch(url, options)
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = { error: text || `HTTP ${res.status}` }
  }
  return { ok: res.ok, status: res.status, data }
}

// ── Password gate ─────────────────────────────────────────────────────────────
function PasswordGate({ shareInfo, onUnlock }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { ok, data } = await safeFetch(`/api/public/verify/${shareInfo.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!ok) throw new Error(data.error || 'Verification failed')
      onUnlock(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      background: 'radial-gradient(ellipse at 50% 0%, rgba(124,106,247,0.07) 0%, transparent 65%)',
    }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: 'linear-gradient(135deg, #7c6af7, #a78bfa)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', fontSize: '1.6rem',
          }}>🔒</div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 600, marginBottom: 4 }}>{shareInfo.name}</h1>
          {shareInfo.description && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{shareInfo.description}</p>
          )}
          <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: 8 }}>
            Shared via {shareInfo.appName}
          </p>
        </div>

        <div className="card">
          {error && <div className="error-msg">{error}</div>}
          <form onSubmit={submit}>
            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter share password"
                autoFocus
                required
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center' }}
              disabled={loading}
            >
              {loading ? <span className="loading-spinner" /> : 'View Photos →'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

// ── Upload Panel ──────────────────────────────────────────────────────────────
function UploadPanel({ shareId, sessionToken, onUploaded }) {
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState([])
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef()

  function addFiles(incoming) {
    const arr = Array.from(incoming).filter(f =>
      f.type.startsWith('image/') || f.type.startsWith('video/')
    )
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name + f.size))
      return [...prev, ...arr.filter(f => !existing.has(f.name + f.size))]
    })
    setResults([])
  }

  function removeFile(idx) {
    setFiles(prev => prev.filter((_, i) => i !== idx))
  }

  async function uploadAll() {
    if (!files.length) return
    setUploading(true)
    setResults([])
    const out = []

    for (const file of files) {
      try {
        const formData = new FormData()
        formData.append('assetData', file, file.name)
        formData.append('deviceAssetId', `${file.name}-${file.size}-${file.lastModified}`)
        formData.append('deviceId', 'immich-share-upload')
        formData.append('fileCreatedAt', new Date(file.lastModified).toISOString())
        formData.append('fileModifiedAt', new Date(file.lastModified).toISOString())
        // NOTE: token goes in the query string, NOT the form body.
        // The upload route streams req directly to Immich without parsing
        // the body, so anything appended to FormData would be lost.

        const res = await fetch(
          `/api/public/upload/${shareId}?t=${encodeURIComponent(sessionToken)}`,
          { method: 'POST', body: formData }
        )
        const text = await res.text()
        let data
        try { data = JSON.parse(text) } catch { data = { error: text } }

        if (res.ok && data.success) {
          out.push({ name: file.name, ok: true })
        } else {
          out.push({ name: file.name, ok: false, error: data.error || 'Upload failed' })
        }
      } catch (err) {
        out.push({ name: file.name, ok: false, error: err.message })
      }
    }

    setResults(out)
    setUploading(false)
    if (out.some(r => r.ok)) {
      setFiles([])
      setTimeout(onUploaded, 800)
    }
  }

  const successCount = results.filter(r => r.ok).length
  const failCount = results.filter(r => !r.ok).length

  return (
    <div style={{
      background: 'var(--bg2)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: 20,
      marginBottom: 20,
    }}>
      <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>📤</span> Upload Photos & Videos
      </h3>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-sm)',
          padding: '24px 16px',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragOver ? 'var(--accent-glow)' : 'var(--bg3)',
          transition: 'all 0.15s',
          marginBottom: 12,
        }}
      >
        <div style={{ fontSize: '1.8rem', marginBottom: 8 }}>🖼️</div>
        <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          Drop images/videos here or <span style={{ color: 'var(--accent)' }}>browse</span>
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: 4 }}>
          JPG, PNG, HEIC, MP4, MOV and more
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          style={{ display: 'none' }}
          onChange={e => addFiles(e.target.files)}
        />
      </div>

      {/* File queue */}
      {files.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: 6 }}>
            {files.length} file{files.length !== 1 ? 's' : ''} queued
          </div>
          <div style={{ maxHeight: 140, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {files.map((f, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 10px',
                background: 'var(--bg)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.8rem',
              }}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.type.startsWith('video/') ? '🎬 ' : '🖼 '}{f.name}
                </span>
                <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>
                  {(f.size / 1024 / 1024).toFixed(1)} MB
                </span>
                <button
                  onClick={e => { e.stopPropagation(); removeFile(i) }}
                  style={{ background: 'none', color: 'var(--text-dim)', fontSize: '1rem', padding: '0 2px', border: 'none', cursor: 'pointer' }}
                >✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {successCount > 0 && (
            <div className="success-msg" style={{ marginBottom: 6 }}>
              ✓ {successCount} file{successCount !== 1 ? 's' : ''} uploaded successfully
            </div>
          )}
          {failCount > 0 && (
            <div className="error-msg">
              {results.filter(r => !r.ok).map((r, i) => (
                <div key={i}>✗ {r.name}: {r.error}</div>
              ))}
            </div>
          )}
        </div>
      )}

      <button
        className="btn btn-primary"
        onClick={uploadAll}
        disabled={uploading || files.length === 0}
      >
        {uploading ? (
          <><span className="loading-spinner" /> Uploading…</>
        ) : (
          `Upload ${files.length > 0 ? files.length + ' file' + (files.length !== 1 ? 's' : '') : ''}`
        )}
      </button>
    </div>
  )
}

// ── Lightbox ──────────────────────────────────────────────────────────────────
function LightBox({ asset, token, onClose, onPrev, onNext, total, index }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') onPrev()
      if (e.key === 'ArrowRight') onNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onPrev, onNext])

  const t = encodeURIComponent(token)
  const isVideo = asset.type === 'VIDEO'

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.96)',
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      {/* Top bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)',
      }}>
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>
          {index + 1} / {total}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          {asset.originalUrl && (
            <a
              href={`${asset.originalUrl}?t=${t}`}
              download
              className="btn btn-secondary btn-sm"
              style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.2)' }}
              onClick={e => e.stopPropagation()}
            >
              ⬇ Download
            </a>
          )}
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.1)',
              color: '#fff', border: 'none', borderRadius: 6,
              padding: '6px 12px', cursor: 'pointer', fontSize: '0.875rem',
            }}
          >✕ Close</button>
        </div>
      </div>

      {/* Prev / Next */}
      {total > 1 && (
        <>
          <button onClick={onPrev} style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none',
            borderRadius: '50%', width: 48, height: 48, fontSize: '1.5rem',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>‹</button>
          <button onClick={onNext} style={{
            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
            background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none',
            borderRadius: '50%', width: 48, height: 48, fontSize: '1.5rem',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>›</button>
        </>
      )}

      {/* Media */}
      <div style={{ maxWidth: '92vw', maxHeight: '82vh' }}>
        {isVideo ? (
          <video
            key={asset.id}
            src={`${asset.videoUrl}?t=${t}`}
            controls
            autoPlay
            style={{ maxWidth: '92vw', maxHeight: '82vh', borderRadius: 6, outline: 'none' }}
          />
        ) : (
          <img
            key={asset.id}
            src={`${asset.previewUrl}?t=${t}`}
            alt={asset.originalFileName || ''}
            style={{ maxWidth: '92vw', maxHeight: '82vh', borderRadius: 6, objectFit: 'contain', display: 'block' }}
          />
        )}
      </div>

      {/* Metadata strip */}
      {(asset.originalFileName || asset.fileCreatedAt) && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          padding: '12px 20px',
          background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)',
          color: 'rgba(255,255,255,0.55)',
          fontSize: '0.78rem',
          display: 'flex', gap: 20,
        }}>
          {asset.originalFileName && <span>{asset.originalFileName}</span>}
          {asset.fileCreatedAt && (
            <span>{new Date(asset.fileCreatedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main share view ───────────────────────────────────────────────────────────
export default function ShareView() {
  const { shareId } = useParams()
  const [shareInfo, setShareInfo] = useState(null)
  const [infoLoading, setInfoLoading] = useState(true)
  const [infoError, setInfoError] = useState('')
  const [shareData, setShareData] = useState(null)
  const [assets, setAssets] = useState([])
  const [assetsLoading, setAssetsLoading] = useState(false)
  const [assetsError, setAssetsError] = useState('')
  const [lightbox, setLightbox] = useState(null)
  const [showUpload, setShowUpload] = useState(false)

  // Load public share info
  useEffect(() => {
    safeFetch(`/api/public/info/${shareId}`)
      .then(({ ok, data }) => {
        if (!ok || data.error) throw new Error(data.error || 'Share not found')
        setShareInfo(data)
      })
      .catch(e => setInfoError(e.message))
      .finally(() => setInfoLoading(false))
  }, [shareId])

  const loadAssets = useCallback(async (sessionToken) => {
    setAssetsLoading(true)
    setAssetsError('')
    try {
      const { ok, data } = await safeFetch(`/api/public/content/${shareId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionToken }),
      })
      if (!ok) throw new Error(data.error || 'Failed to load content')
      setAssets(data.assets)
    } catch (err) {
      setAssetsError(err.message)
    } finally {
      setAssetsLoading(false)
    }
  }, [shareId])

  const handleUnlock = useCallback(async (data) => {
    setShareData(data)
    await loadAssets(data.sessionToken)
  }, [loadAssets])

  const handleUploaded = useCallback(() => {
    if (shareData?.sessionToken) loadAssets(shareData.sessionToken)
  }, [shareData, loadAssets])

  const token = shareData?.sessionToken || ''
  const t = encodeURIComponent(token)

  // ── Render states ───────────────────────────────────────────────────────────
  if (infoLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="loading-spinner" style={{ width: 32, height: 32 }} />
      </div>
    )
  }

  if (infoError || !shareInfo) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>🔗</div>
          <h1 style={{ marginBottom: 8 }}>Share Not Found</h1>
          <p style={{ color: 'var(--text-muted)' }}>{infoError || 'This share link is invalid or has been removed.'}</p>
        </div>
      </div>
    )
  }

  if (shareInfo.isExpired || !shareInfo.isActive) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>⏱</div>
          <h1 style={{ marginBottom: 8 }}>{shareInfo.isExpired ? 'Share Expired' : 'Share Unavailable'}</h1>
          <p style={{ color: 'var(--text-muted)' }}>This share link is no longer active.</p>
        </div>
      </div>
    )
  }

  if (!shareData) {
    return <PasswordGate shareInfo={shareInfo} onUnlock={handleUnlock} />
  }

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 60 }}>
      {/* Header */}
      <div style={{
        padding: '16px 24px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg2)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12, position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div>
          <h1 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{shareData.name}</h1>
          {shareData.description && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 2 }}>{shareData.description}</p>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>
            {assets.length} {assets.length === 1 ? 'item' : 'items'}
          </span>
          {shareData.allow_download && assets.length > 0 && (
            <span className="badge badge-green">⬇ Downloads on</span>
          )}
          {shareData.allow_upload && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowUpload(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              📤 {showUpload ? 'Hide Upload' : 'Upload'}
            </button>
          )}
        </div>
      </div>

      {/* Upload panel */}
      {shareData.allow_upload && showUpload && (
        <div style={{ maxWidth: 640, margin: '20px auto 0', padding: '0 16px' }}>
          <UploadPanel
            shareId={shareId}
            sessionToken={token}
            onUploaded={handleUploaded}
          />
        </div>
      )}

      {/* Gallery */}
      {assetsLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
          <span className="loading-spinner" style={{ width: 32, height: 32 }} />
        </div>
      ) : assetsError ? (
        <div style={{ maxWidth: 480, margin: '60px auto', padding: '0 20px' }}>
          <div className="error-msg">{assetsError}</div>
        </div>
      ) : assets.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-muted)' }}>
          {shareData.allow_upload
            ? 'No photos yet — be the first to upload!'
            : 'No photos found in this share.'}
        </div>
      ) : (
        <div style={{
          padding: '16px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 4,
          maxWidth: 1600, margin: '0 auto',
        }}>
          {assets.map((asset, i) => (
            <div
              key={asset.id}
              onClick={() => setLightbox(i)}
              style={{
                aspectRatio: '1',
                borderRadius: 4,
                overflow: 'hidden',
                cursor: 'pointer',
                background: 'var(--bg3)',
                position: 'relative',
              }}
            >
              <img
                src={`${asset.thumbnailUrl}?t=${t}`}
                loading="lazy"
                alt=""
                style={{
                  width: '100%', height: '100%', objectFit: 'cover',
                  transition: 'transform 0.2s, opacity 0.2s',
                  opacity: 0,
                }}
                onLoad={e => { e.target.style.opacity = 1 }}
                onMouseEnter={e => e.target.style.transform = 'scale(1.05)'}
                onMouseLeave={e => e.target.style.transform = 'scale(1)'}
              />
              {asset.type === 'VIDEO' && (
                <div style={{
                  position: 'absolute', bottom: 6, right: 6,
                  background: 'rgba(0,0,0,0.65)',
                  borderRadius: 4, padding: '2px 7px',
                  fontSize: '0.7rem', color: '#fff',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>▶ {asset.duration || 'video'}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox !== null && (
        <LightBox
          asset={assets[lightbox]}
          token={token}
          index={lightbox}
          total={assets.length}
          onClose={() => setLightbox(null)}
          onPrev={() => setLightbox(i => (i - 1 + assets.length) % assets.length)}
          onNext={() => setLightbox(i => (i + 1) % assets.length)}
        />
      )}

      <div style={{ textAlign: 'center', marginTop: 40, color: 'var(--text-dim)', fontSize: '0.75rem' }}>
        Shared via {shareInfo.appName}
      </div>
    </div>
  )
}