import React, { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'

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
      onUnlock(password, data)
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

function LightBox({ asset, password, shareId, onClose, onPrev, onNext }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') onPrev()
      if (e.key === 'ArrowRight') onNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onPrev, onNext])

  const encodedPw = encodeURIComponent(password)
  const isVideo = asset.type === 'VIDEO'

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.95)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      {/* Controls */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 16, right: 16,
          background: 'rgba(255,255,255,0.1)',
          color: '#fff', border: 'none', borderRadius: '50%',
          width: 40, height: 40, fontSize: '1.2rem', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >✕</button>

      <button
        onClick={onPrev}
        style={{
          position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
          background: 'rgba(255,255,255,0.1)',
          color: '#fff', border: 'none', borderRadius: '50%',
          width: 44, height: 44, fontSize: '1.4rem', cursor: 'pointer',
        }}
      >‹</button>

      <button
        onClick={onNext}
        style={{
          position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)',
          background: 'rgba(255,255,255,0.1)',
          color: '#fff', border: 'none', borderRadius: '50%',
          width: 44, height: 44, fontSize: '1.4rem', cursor: 'pointer',
        }}
      >›</button>

      {/* Media */}
      <div style={{ maxWidth: '90vw', maxHeight: '90vh', position: 'relative' }}>
        {isVideo ? (
          <video
            src={`${asset.videoUrl}?p=${encodedPw}`}
            controls
            autoPlay
            style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 8 }}
          />
        ) : (
          <img
            src={`${asset.previewUrl}?p=${encodedPw}`}
            alt={asset.originalFileName || ''}
            style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 8, objectFit: 'contain' }}
          />
        )}

        {/* Download + metadata */}
        <div style={{
          position: 'absolute', bottom: -48, left: 0, right: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12,
        }}>
          {asset.originalFileName && (
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {asset.originalFileName}
            </span>
          )}
          {asset.originalUrl && (
            <a
              href={`${asset.originalUrl}?p=${encodedPw}`}
              download
              className="btn btn-secondary btn-sm"
              style={{ flexShrink: 0 }}
            >
              ⬇ Download
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ShareView() {
  const { shareId } = useParams()
  const [shareInfo, setShareInfo] = useState(null)
  const [infoLoading, setInfoLoading] = useState(true)
  const [infoError, setInfoError] = useState('')
  const [password, setPassword] = useState('')
  const [shareData, setShareData] = useState(null)
  const [assets, setAssets] = useState([])
  const [assetsLoading, setAssetsLoading] = useState(false)
  const [lightbox, setLightbox] = useState(null) // index

  // Load share info (name, status)
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

  const handleUnlock = useCallback(async (pw, info) => {
    setPassword(pw)
    setShareData(info)
    setAssetsLoading(true)
    try {
      const res = await fetch(`/api/public/content/${shareId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setAssets(data.assets)
    } catch (err) {
      alert('Failed to load photos: ' + err.message)
    } finally {
      setAssetsLoading(false)
    }
  }, [shareId])

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

  const encodedPw = encodeURIComponent(password)

  return (
    <div style={{ minHeight: '100vh', padding: '0 0 60px' }}>
      {/* Header */}
      <div style={{
        padding: '20px 32px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: 600 }}>{shareData.name}</h1>
          {shareData.description && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 2 }}>{shareData.description}</p>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>{assets.length} items</span>
          {shareData.allow_download && assets.length > 0 && (
            <span className="badge badge-green">⬇ Downloads allowed</span>
          )}
        </div>
      </div>

      {/* Gallery */}
      {assetsLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
          <span className="loading-spinner" style={{ width: 32, height: 32 }} />
        </div>
      ) : assets.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-muted)' }}>
          No photos found in this share.
        </div>
      ) : (
        <div style={{
          padding: '24px 20px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 6,
          maxWidth: 1400,
          margin: '0 auto',
        }}>
          {assets.map((asset, i) => (
            <div
              key={asset.id}
              onClick={() => setLightbox(i)}
              style={{
                aspectRatio: '1',
                borderRadius: 6,
                overflow: 'hidden',
                cursor: 'pointer',
                background: 'var(--bg3)',
                position: 'relative',
              }}
            >
              <img
                src={`${asset.thumbnailUrl}?p=${encodedPw}`}
                loading="lazy"
                alt=""
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transition: 'transform 0.2s',
                }}
                onMouseEnter={e => e.target.style.transform = 'scale(1.04)'}
                onMouseLeave={e => e.target.style.transform = 'scale(1)'}
              />
              {asset.type === 'VIDEO' && (
                <div style={{
                  position: 'absolute', top: 8, right: 8,
                  background: 'rgba(0,0,0,0.6)',
                  borderRadius: 4, padding: '2px 6px',
                  fontSize: '0.7rem', color: '#fff',
                }}>▶ {asset.duration}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox !== null && (
        <LightBox
          asset={assets[lightbox]}
          password={password}
          shareId={shareId}
          onClose={() => setLightbox(null)}
          onPrev={() => setLightbox(i => (i - 1 + assets.length) % assets.length)}
          onNext={() => setLightbox(i => (i + 1) % assets.length)}
        />
      )}

      {/* Footer */}
      <div style={{
        textAlign: 'center',
        marginTop: 40,
        color: 'var(--text-dim)',
        fontSize: '0.78rem',
      }}>
        Shared via {shareInfo.appName}
      </div>
    </div>
  )
}
