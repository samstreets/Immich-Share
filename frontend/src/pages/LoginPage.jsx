import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      login(data.token, data.username)
      navigate('/admin')
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
      background: 'var(--bg)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Decorative background */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: `
          radial-gradient(ellipse 60% 50% at 80% 20%, rgba(212,168,67,0.06) 0%, transparent 70%),
          radial-gradient(ellipse 40% 40% at 20% 80%, rgba(96,165,250,0.04) 0%, transparent 60%)
        `,
        pointerEvents: 'none',
      }} />

      {/* Photo strip decoration on left (desktop) */}
      <div style={{
        display: 'none',
        width: '45%',
        background: 'var(--bg2)',
        borderRight: '1.5px solid var(--border)',
        padding: '60px 48px',
        flexDirection: 'column',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
      }} className="login-left">
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 3,
          opacity: 0.15,
        }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} style={{
              background: `hsl(${210 + i * 15}, 20%, ${15 + i * 3}%)`,
              borderRadius: 4,
            }} />
          ))}
        </div>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 32 }}>
            <div className="immich-mark" style={{ width: 52, height: 52, borderRadius: 14, fontSize: '1.5rem' }}>📷</div>
            <div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Immich Share</div>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem', fontWeight: 500 }}>Self-hosted photo sharing</div>
            </div>
          </div>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.8, maxWidth: 320 }}>
            Share your Immich albums and photos with anyone via a password-protected link — no Immich account required.
          </div>
        </div>
      </div>

      {/* Login form */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        position: 'relative',
        zIndex: 1,
      }}>
        <div style={{ width: '100%', maxWidth: '380px' }}>
          {/* Logo (mobile / standalone) */}
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <div style={{
              width: 60, height: 60,
              borderRadius: 18,
              background: 'linear-gradient(135deg, #d4a843 0%, #f5cc6c 55%, #dba93a 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 18px',
              fontSize: '1.75rem',
              boxShadow: '0 8px 28px rgba(212,168,67,0.4)',
            }}>
              📷
            </div>
            <h1 style={{
              fontSize: '1.6rem',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              marginBottom: 5,
            }}>
              Welcome back
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', fontWeight: 500 }}>
              Sign in to the Admin Dashboard
            </p>
          </div>

          <div style={{
            background: 'var(--bg2)',
            border: '1.5px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '28px',
            boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
          }}>
            {error && (
              <div className="error-msg">
                <span>⚠ </span>{error}
              </div>
            )}
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="admin"
                  autoFocus
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 22 }}>
                <label>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
                style={{ width: '100%', justifyContent: 'center', padding: '11px 18px', fontSize: '0.95rem' }}
              >
                {loading ? <span className="loading-spinner" /> : 'Sign In'}
              </button>
            </form>
          </div>

          <div style={{ textAlign: 'center', marginTop: 20, fontSize: '0.75rem', color: 'var(--text-dim)' }}>
            Immich Share · Admin Console
          </div>
        </div>
      </div>
    </div>
  )
}