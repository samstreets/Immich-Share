import React from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'

export default function AdminLayout() {
  const { username, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/admin/login')
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside style={{
        width: 220,
        background: 'var(--bg2)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        top: 0, left: 0, bottom: 0,
        zIndex: 10,
      }}>
        {/* Logo */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9,
              background: 'linear-gradient(135deg, #7c6af7, #a78bfa)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1rem', flexShrink: 0,
            }}>🖼️</div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', lineHeight: 1.2 }}>Immich Share</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Admin Panel</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 10px' }}>
          {[
            { to: '/admin', label: 'Dashboard', icon: '◈', end: true },
            { to: '/admin/shares', label: 'Shares', icon: '⬡' },
            { to: '/admin/settings', label: 'Settings', icon: '⚙' },
          ].map(({ to, label, icon, end }) => (
            <NavLink key={to} to={to} end={end} style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 12px',
              borderRadius: 'var(--radius-sm)',
              color: isActive ? 'var(--accent)' : 'var(--text-muted)',
              background: isActive ? 'var(--accent-glow)' : 'transparent',
              fontWeight: isActive ? 500 : 400,
              fontSize: '0.875rem',
              marginBottom: 2,
              textDecoration: 'none',
              transition: 'all 0.15s',
            })}>
              <span style={{ fontSize: '1rem', opacity: 0.85 }}>{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div style={{ padding: '12px 10px', borderTop: '1px solid var(--border)' }}>
          <div style={{
            padding: '10px 12px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg3)',
            marginBottom: 8,
          }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Signed in as</div>
            <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text)' }}>{username}</div>
          </div>
          <button
            onClick={handleLogout}
            className="btn btn-secondary"
            style={{ width: '100%', justifyContent: 'center' }}
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ marginLeft: 220, flex: 1, padding: '32px', minWidth: 0 }}>
        <Outlet />
      </main>
    </div>
  )
}
