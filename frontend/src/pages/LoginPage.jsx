import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'

function ImmichLogo({ size = 52 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M26 3 L3 26 L26 26 Z" fill="#f44336" opacity="0.93"/>
      <path d="M26 3 L49 26 L26 26 Z" fill="#4caf50" opacity="0.93"/>
      <path d="M26 49 L3 26 L26 26 Z" fill="#2196f3" opacity="0.93"/>
      <path d="M26 49 L49 26 L26 26 Z" fill="#ffc107" opacity="0.93"/>
    </svg>
  )
}

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
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: '24px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Subtle background glow — Immich uses very dark, minimal bg */}
      <div style={{
        position: 'absolute',
        width: '500px',
        height: '500px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(33,150,243,0.04) 0%, transparent 70%)',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
      }} />

      <div style={{
        width: '100%',
        maxWidth: '360px',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Logo + name */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <ImmichLogo size={40} />
            <span style={{
              fontSize: '1.6rem',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              color: 'var(--text)',
            }}>
              immich share
            </span>
          </div>
          <p style={{
            color: 'var(--text-dim)',
            fontSize: '0.82rem',
            fontWeight: 500,
            marginTop: 4,
          }}>
            Admin Dashboard
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--bg2)',
          border: '1px solid var(--border-light)',
          borderRadius: 'var(--radius)',
          padding: '28px 24px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}>
          <h1 style={{
            fontSize: '1rem',
            fontWeight: 700,
            marginBottom: 20,
            color: 'var(--text)',
          }}>
            Sign in
          </h1>

          {error && (
            <div className="error-msg">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Email / Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="admin"
                autoFocus
                required
              />
            </div>
            <div className="form-group" style={{ marginBottom: 24 }}>
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Password"
                required
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{
                width: '100%',
                justifyContent: 'center',
                padding: '10px 18px',
                fontSize: '0.875rem',
                fontWeight: 700,
                borderRadius: 'var(--radius-sm)',
              }}
            >
              {loading ? <span className="loading-spinner" /> : 'Sign in'}
            </button>
          </form>
        </div>

        <p style={{
          textAlign: 'center',
          marginTop: 20,
          fontSize: '0.73rem',
          color: 'var(--text-dim)',
        }}>
          immich share · admin console
        </p>
      </div>
    </div>
  )
}