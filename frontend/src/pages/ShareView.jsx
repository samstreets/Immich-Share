import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'

async function safeFetch(url, options = {}) {
  const res = await fetch(url, options)
  const text = await res.text()
  let data
  try { data = JSON.parse(text) }
  catch { data = { error: text || `HTTP ${res.status}` } }
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
      background: `var(--bg)`,
      position: 'relative',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(ellipse 60% 40% at 50% 0%, rgba(212,168,67,0.07) 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      <div style={{ width: '100%', maxWidth: '380px', position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 62, height: 62, borderRadius: 18,
            background: 'linear-gradient(135deg, #d4a843, #f5cc6c)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 18px',
            fontSize: '1.8rem',
            boxShadow: '0 10px 32px rgba(212,168,67,0.4)',
          }}>🔒</div>
          <h1 style={{
            fontSize: '1.25rem', fontWeight: 800,
            letterSpacing: '-0.01em', marginBottom: 6,
          }}>{shareInfo.name}</h1>
          {shareInfo.description && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: 6 }}>
              {shareInfo.description}
            </p>
          )}
          <p style={{ color: 'var(--text-dim)', fontSize: '0.78rem', fontWeight: 500 }}>
            Shared via {shareInfo.appName}
          </p>
        </div>

        <div style={{
          background: 'var(--bg2)',
          border: '1.5px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '26px',
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
        }}>
          {error && <div className="error-msg">⚠ {error}</div>}
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
              style={{ width: '100%', justifyContent: 'center', padding: '11px 18px' }}
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

// ── Download ZIP ──────────────────────────────────────────────────────────────
function DownloadZipButton({ shareId, sessionToken, assetCount, shareName }) {
  const [state, setState] = useState('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleDownload() {
    setState('downloading')
    setErrorMsg('')
    try {
      const t = encodeURIComponent(sessionToken)
      const res = await fetch(`/api/public/zip/${shareId}?t=${t}`)
      if (!res.ok) { const text = await res.text(); throw new Error(text || `HTTP ${res.status}`) }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const safe = (shareName || 'share').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60)
      a.download = `${safe}.zip`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setState('done')
      setTimeout(() => setState('idle'), 3000)
    } catch (err) {
      setErrorMsg(err.message); setState('error')
      setTimeout(() => setState('idle'), 4000)
    }
  }

  const labels = {
    idle: `Download All (${assetCount})`,
    downloading: 'Preparing ZIP…',
    done: '✓ Downloaded!',
    error: `✗ ${errorMsg}`,
  }

  return (
    <button
      className={`btn btn-sm ${state === 'error' ? 'btn-danger' : 'btn-secondary'}`}
      onClick={handleDownload}
      disabled={state === 'downloading'}
      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
    >
      {state === 'downloading'
        ? <span className="loading-spinner" style={{ width: 13, height: 13 }} />
        : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        )
      }
      {labels[state]}
    </button>
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
    const arr = Array.from(incoming).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'))
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name + f.size))
      return [...prev, ...arr.filter(f => !existing.has(f.name + f.size))]
    })
    setResults([])
  }

  function removeFile(idx) { setFiles(prev => prev.filter((_, i) => i !== idx)) }

  async function uploadAll() {
    if (!files.length) return
    setUploading(true); setResults([])
    const out = []
    for (const file of files) {
      try {
        const formData = new FormData()
        formData.append('assetData', file, file.name)
        formData.append('deviceAssetId', `${file.name}-${file.size}-${file.lastModified}`)
        formData.append('deviceId', 'immich-share-upload')
        formData.append('fileCreatedAt', new Date(file.lastModified).toISOString())
        formData.append('fileModifiedAt', new Date(file.lastModified).toISOString())
        const res = await fetch(`/api/public/upload/${shareId}?t=${encodeURIComponent(sessionToken)}`, {
          method: 'POST', body: formData,
        })
        const text = await res.text()
        let data; try { data = JSON.parse(text) } catch { data = { error: text } }
        out.push(res.ok && data.success
          ? { name: file.name, ok: true }
          : { name: file.name, ok: false, error: data.error || 'Upload failed' })
      } catch (err) {
        out.push({ name: file.name, ok: false, error: err.message })
      }
    }
    setResults(out); setUploading(false)
    if (out.some(r => r.ok)) { setFiles([]); setTimeout(onUploaded, 800) }
  }

  const successCount = results.filter(r => r.ok).length
  const failCount = results.filter(r => !r.ok).length

  return (
    <div style={{
      background: 'var(--bg2)',
      border: '1.5px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: 20,
      marginBottom: 20,
    }}>
      <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text)' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        Upload Photos & Videos
      </h3>

      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-sm)',
          padding: '28px 16px',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragOver ? 'var(--accent-dim)' : 'var(--bg3)',
          transition: 'all 0.15s',
          marginBottom: 12,
        }}
      >
        <div style={{ fontSize: '2rem', marginBottom: 8 }}>📷</div>
        <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 500 }}>
          Drop photos & videos or{' '}
          <span style={{ color: 'var(--accent)', fontWeight: 700 }}>browse</span>
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: 5 }}>
          JPG, PNG, HEIC, MP4, MOV and more
        </div>
        <input ref={inputRef} type="file" multiple accept="image/*,video/*" style={{ display: 'none' }}
          onChange={e => addFiles(e.target.files)} />
      </div>

      {files.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: 6, fontWeight: 600 }}>
            {files.length} file{files.length !== 1 ? 's' : ''} queued
          </div>
          <div style={{ maxHeight: 130, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {files.map((f, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 10px',
                background: 'var(--bg)',
                borderRadius: 'var(--radius-xs)',
                border: '1px solid var(--border)',
                fontSize: '0.8rem',
              }}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.type.startsWith('video/') ? '🎬 ' : '📷 '}{f.name}
                </span>
                <span style={{ color: 'var(--text-dim)', flexShrink: 0, fontSize: '0.75rem' }}>
                  {(f.size / 1024 / 1024).toFixed(1)} MB
                </span>
                <button onClick={e => { e.stopPropagation(); removeFile(i) }}
                  style={{ background: 'none', color: 'var(--text-dim)', fontSize: '0.9rem', padding: '0 2px', border: 'none', cursor: 'pointer', lineHeight: 1 }}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {successCount > 0 && (
            <div className="success-msg" style={{ marginBottom: 6 }}>
              ✓ {successCount} file{successCount !== 1 ? 's' : ''} uploaded
            </div>
          )}
          {failCount > 0 && (
            <div className="error-msg">
              {results.filter(r => !r.ok).map((r, i) => <div key={i}>✗ {r.name}: {r.error}</div>)}
            </div>
          )}
        </div>
      )}

      <button
        className="btn btn-primary btn-sm"
        onClick={uploadAll}
        disabled={uploading || files.length === 0}
      >
        {uploading
          ? <><span className="loading-spinner" style={{ width: 13, height: 13 }} /> Uploading…</>
          : `Upload${files.length > 0 ? ` ${files.length} file${files.length !== 1 ? 's' : ''}` : ''}`
        }
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
        background: 'rgba(6,8,16,0.97)',
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
        padding: '12px 18px',
        background: 'linear-gradient(to bottom, rgba(6,8,16,0.8), transparent)',
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="immich-mark" style={{ width: 28, height: 28, borderRadius: 7, fontSize: '0.85rem' }}>📷</div>
          <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.82rem', fontWeight: 600 }}>
            {index + 1} / {total}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {asset.originalUrl && (
            <a
              href={`${asset.originalUrl}?t=${t}`}
              download
              className="btn btn-secondary btn-sm"
              style={{ color: 'rgba(255,255,255,0.8)', background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.15)' }}
              onClick={e => e.stopPropagation()}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download
            </a>
          )}
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.8)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 7,
              padding: '6px 13px',
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontFamily: 'inherit',
              fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            Close
          </button>
        </div>
      </div>

      {/* Nav arrows */}
      {total > 1 && (
        <>
          {[
            { onClick: onPrev, style: { left: 14 }, icon: '‹' },
            { onClick: onNext, style: { right: 14 }, icon: '›' },
          ].map(({ onClick, style: s, icon }) => (
            <button key={icon} onClick={onClick} style={{
              position: 'absolute', top: '50%', transform: 'translateY(-50%)',
              background: 'rgba(255,255,255,0.08)',
              backdropFilter: 'blur(8px)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '50%',
              width: 48, height: 48,
              fontSize: '1.6rem',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              lineHeight: 1,
              fontFamily: 'inherit',
              transition: 'background 0.15s',
              ...s,
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(212,168,67,0.2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
            >{icon}</button>
          ))}
        </>
      )}

      {/* Media */}
      <div style={{ maxWidth: '92vw', maxHeight: '82vh' }}>
        {isVideo ? (
          <video
            key={asset.id}
            src={`${asset.videoUrl}?t=${t}`}
            controls autoPlay
            style={{ maxWidth: '92vw', maxHeight: '82vh', borderRadius: 8, outline: 'none' }}
          />
        ) : (
          <img
            key={asset.id}
            src={`${asset.previewUrl}?t=${t}`}
            alt={asset.originalFileName || ''}
            style={{ maxWidth: '92vw', maxHeight: '82vh', borderRadius: 8, objectFit: 'contain', display: 'block' }}
          />
        )}
      </div>

      {/* Metadata strip */}
      {(asset.originalFileName || asset.fileCreatedAt) && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          padding: '14px 20px',
          background: 'linear-gradient(to top, rgba(6,8,16,0.8), transparent)',
          color: 'rgba(255,255,255,0.45)',
          fontSize: '0.78rem',
          display: 'flex', gap: 20,
          fontWeight: 500,
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

  useEffect(() => {
    safeFetch(`/api/public/info/${shareId}`)
      .then(({ ok, data }) => {
        if (!ok || data.error) throw new Error(data.error || 'Share not found')
        setShareInfo(data)
      })
      .catch(e => setInfoError(e.message))
      .finally(() => setInfoLoading(false))
  }, [shareId])

  const loadAssets = useCallback(async (sessionToken, shareUuid) => {
    setAssetsLoading(true); setAssetsError('')
    try {
      const id = shareUuid || shareId
      const { ok, data } = await safeFetch(`/api/public/content/${id}`, {
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
    await loadAssets(data.sessionToken, data.id)
  }, [loadAssets])

  const handleUploaded = useCallback(() => {
    if (shareData?.sessionToken) loadAssets(shareData.sessionToken, shareData.id)
  }, [shareData, loadAssets])

  const token = shareData?.sessionToken || ''
  const t = encodeURIComponent(token)

  if (infoLoading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <span className="loading-spinner" style={{ width: 32, height: 32 }} />
      <span style={{ color: 'var(--text-dim)', fontSize: '0.875rem', fontWeight: 500 }}>Loading share…</span>
    </div>
  )

  if (infoError || !shareInfo) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <div style={{ fontSize: '3.5rem', marginBottom: 16 }}>🔗</div>
        <h1 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: 10 }}>Share Not Found</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          {infoError || 'This share link is invalid or has been removed.'}
        </p>
      </div>
    </div>
  )

  if (shareInfo.isExpired || !shareInfo.isActive) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <div style={{ fontSize: '3.5rem', marginBottom: 16 }}>⏱</div>
        <h1 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: 10 }}>
          {shareInfo.isExpired ? 'Share Expired' : 'Share Unavailable'}
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          This share link is no longer active.
        </p>
      </div>
    </div>
  )

  if (!shareData) return <PasswordGate shareInfo={shareInfo} onUnlock={handleUnlock} />

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{
        padding: '0 20px',
        height: 58,
        borderBottom: '1.5px solid var(--border)',
        background: 'var(--bg2)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, position: 'sticky', top: 0, zIndex: 10,
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <div className="immich-mark" style={{ width: 28, height: 28, borderRadius: 7, fontSize: '0.85rem', flexShrink: 0 }}>📷</div>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontWeight: 800, fontSize: '0.9rem',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{shareData.name}</div>
            {shareData.description && (
              <div style={{
                color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 500,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{shareData.description}</div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--text-dim)', fontSize: '0.78rem', fontWeight: 600 }}>
            {assets.length} {assets.length === 1 ? 'item' : 'items'}
          </span>
          {shareData.allow_download && assets.length > 0 && (
            <DownloadZipButton
              shareId={shareData.id}
              sessionToken={token}
              assetCount={assets.length}
              shareName={shareData.name}
            />
          )}
          {shareData.allow_upload && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowUpload(v => !v)}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              {showUpload ? 'Hide Upload' : 'Upload'}
            </button>
          )}
        </div>
      </div>

      {/* Upload panel */}
      {shareData.allow_upload && showUpload && (
        <div style={{ maxWidth: 620, margin: '20px auto 0', padding: '0 16px' }}>
          <UploadPanel shareId={shareId} sessionToken={token} onUploaded={handleUploaded} />
        </div>
      )}

      {/* Gallery */}
      {assetsLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '100px 0', gap: 14, color: 'var(--text-dim)' }}>
          <span className="loading-spinner" style={{ width: 30, height: 30 }} />
          <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Loading photos…</span>
        </div>
      ) : assetsError ? (
        <div style={{ maxWidth: 460, margin: '60px auto', padding: '0 20px' }}>
          <div className="error-msg">{assetsError}</div>
        </div>
      ) : assets.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '100px 20px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '3rem', marginBottom: 14 }}>📷</div>
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>
            {shareData.allow_upload ? 'No photos yet — be the first to upload!' : 'No photos in this share.'}
          </div>
        </div>
      ) : (
        <div style={{
          padding: '4px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
          gap: 3,
          maxWidth: '100%',
        }}>
          {assets.map((asset, i) => (
            <div
              key={asset.id}
              onClick={() => setLightbox(i)}
              style={{
                aspectRatio: '1',
                overflow: 'hidden',
                cursor: 'pointer',
                background: 'var(--bg3)',
                position: 'relative',
                borderRadius: 3,
              }}
            >
              <img
                src={`${asset.thumbnailUrl}?t=${t}`}
                loading="lazy"
                alt=""
                style={{
                  width: '100%', height: '100%', objectFit: 'cover',
                  transition: 'transform 0.25s ease, opacity 0.3s',
                  opacity: 0,
                  display: 'block',
                }}
                onLoad={e => { e.target.style.opacity = 1 }}
                onMouseEnter={e => e.target.style.transform = 'scale(1.06)'}
                onMouseLeave={e => e.target.style.transform = 'scale(1)'}
              />
              {asset.type === 'VIDEO' && (
                <div style={{
                  position: 'absolute', bottom: 7, right: 7,
                  background: 'rgba(0,0,0,0.7)',
                  backdropFilter: 'blur(4px)',
                  borderRadius: 5, padding: '2px 8px',
                  fontSize: '0.7rem', color: '#fff',
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontWeight: 600,
                }}>▶ {asset.duration || 'video'}</div>
              )}
            </div>
          ))}
        </div>
      )}

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

      <div style={{ textAlign: 'center', padding: '32px 20px 40px', color: 'var(--text-dim)', fontSize: '0.75rem', fontWeight: 500 }}>
        Shared via {shareInfo.appName}
      </div>
    </div>
  )
}