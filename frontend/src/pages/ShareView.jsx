import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'

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
      const res = await fetch(`/api/public/verify/${shareInfo.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
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
  const [shareData, setShareData] = useState(null)   // from /verify
  const [assets, setAssets] = useState([])
  const [assetsLoading, setAssetsLoading] = useState(false)
  const [assetsError, setAssetsError] = useState('')
  const [lightbox, setLightbox] = useState(null)      // index

  // Load public share info
  useEffect(() => {
    fetch(`/api/public/info/${shareId}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setShareInfo(data)
      })
      .catch(e => setInfoError(e.message))
      .finally(() => setInfoLoading(false))
  }, [shareId])

  // Called after successful password entry — shareData includes sessionToken
  const handleUnlock = useCallback(async (data) => {
    setShareData(data)
    setAssetsLoading(true)
    setAssetsError('')
    try {
      const res = await fetch(`/api/public/content/${shareId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionToken: data.sessionToken }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error)
      setAssets(body.assets)
    } catch (err) {
      setAssetsError(err.message)
    } finally {
      setAssetsLoading(false)
    }
  }, [shareId])

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
        </div>
      </div>

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
          No photos found in this share.
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
