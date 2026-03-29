import React, { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'

function ImmichLogo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 2 L2 16 L16 16 Z" fill="#f44336" opacity="0.92"/>
      <path d="M16 2 L30 16 L16 16 Z" fill="#4caf50" opacity="0.92"/>
      <path d="M16 30 L2 16 L16 16 Z" fill="#2196f3" opacity="0.92"/>
      <path d="M16 30 L30 16 L16 16 Z" fill="#ffc107" opacity="0.92"/>
    </svg>
  )
}

const NAV_ITEMS = [
  {
    to: '/admin', label: 'Dashboard', end: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="9" rx="1"/>
        <rect x="14" y="3" width="7" height="5" rx="1"/>
        <rect x="14" y="12" width="7" height="9" rx="1"/>
        <rect x="3" y="16" width="7" height="5" rx="1"/>
      </svg>
    ),
  },
  {
    to: '/admin/shares', label: 'Shares',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
        <polyline points="16 6 12 2 8 6"/>
        <line x1="12" y1="2" x2="12" y2="15"/>
      </svg>
    ),
  },
  {
    to: '/admin/logs', label: 'Logs',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    ),
  },
  {
    to: '/admin/settings', label: 'Settings',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    ),
  },
]

export default function AdminLayout() {
  const { username, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  function handleLogout() {
    logout()
    navigate('/admin/login')
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      <style>{`
        /* ── Sidebar: visible on desktop, hidden on mobile ── */
        .admin-sidebar {
          width: var(--sidebar-w);
          background: var(--bg2);
          border-right: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          position: fixed;
          top: 0; left: 0; bottom: 0;
          z-index: 20;
          overflow-y: auto;
        }
        .admin-main {
          margin-left: var(--sidebar-w);
          flex: 1;
          padding: 28px 32px;
          min-width: 0;
          max-width: 100%;
        }

        /* ── Mobile top bar ── */
        .mobile-topbar {
          display: none;
        }

        /* ── Mobile bottom nav ── */
        .mobile-bottom-nav {
          display: none;
        }

        @media (max-width: 768px) {
          .admin-sidebar { display: none; }

          .admin-main {
            margin-left: 0;
            padding: 16px;
            padding-bottom: 80px; /* space for bottom nav */
          }

          .mobile-topbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 16px;
            height: 52px;
            background: var(--bg2);
            border-bottom: 1px solid var(--border);
            position: sticky;
            top: 0;
            z-index: 30;
          }

          .mobile-bottom-nav {
            display: flex;
            position: fixed;
            bottom: 0; left: 0; right: 0;
            height: 60px;
            background: var(--bg2);
            border-top: 1px solid var(--border);
            z-index: 30;
            padding-bottom: env(safe-area-inset-bottom, 0);
          }

          .mobile-bottom-nav a {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 3px;
            color: var(--text-dim);
            text-decoration: none;
            font-size: 0.62rem;
            font-weight: 600;
            letter-spacing: 0.03em;
            transition: color 0.15s;
            padding: 6px 4px;
          }

          .mobile-bottom-nav a.active-mobile {
            color: var(--accent);
          }

          .mobile-bottom-nav a svg {
            transition: color 0.15s;
          }
        }
      `}</style>

      {/* ── Desktop sidebar ── */}
      <aside className="admin-sidebar">
        {/* Logo */}
        <div style={{
          padding: '18px 16px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          borderBottom: '1px solid var(--border)',
        }}>
          <ImmichLogo size={30} />
          <span style={{ fontWeight: 800, fontSize: '1.05rem', letterSpacing: '-0.02em', color: 'var(--text)' }}>
            immich share
          </span>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '8px 0' }}>
          {NAV_ITEMS.map(({ to, label, icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 18px',
                color: isActive ? 'var(--text)' : 'var(--text-muted)',
                background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                fontWeight: isActive ? 700 : 500,
                fontSize: '0.875rem',
                textDecoration: 'none',
                transition: 'all 0.12s',
                position: 'relative',
                borderRight: isActive ? '3px solid var(--accent)' : '3px solid transparent',
              })}
            >
              {({ isActive }) => (
                <>
                  <span style={{
                    color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                    display: 'flex', alignItems: 'center',
                    transition: 'color 0.12s',
                  }}>
                    {icon}
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User / logout */}
        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 10px', borderRadius: 'var(--radius-sm)', marginBottom: 6,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'linear-gradient(135deg, #4caf50, #2196f3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.8rem', fontWeight: 700, color: '#fff', flexShrink: 0,
            }}>
              {username?.[0]?.toUpperCase() || 'A'}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {username}
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', fontWeight: 500 }}>Admin</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              padding: '7px 10px', borderRadius: 'var(--radius-sm)',
              background: 'transparent', color: 'var(--text-dim)',
              fontSize: '0.8rem', fontWeight: 500, border: 'none',
              cursor: 'pointer', transition: 'all 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-dim)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Mobile top bar ── */}
      <div className="mobile-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ImmichLogo size={24} />
          <span style={{ fontWeight: 800, fontSize: '0.95rem', letterSpacing: '-0.02em', color: 'var(--text)' }}>
            immich share
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'linear-gradient(135deg, #4caf50, #2196f3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.72rem', fontWeight: 700, color: '#fff',
          }}>
            {username?.[0]?.toUpperCase() || 'A'}
          </div>
          <button
            onClick={handleLogout}
            style={{
              background: 'var(--bg3)', border: '1px solid var(--border)',
              color: 'var(--text-muted)', borderRadius: 6,
              padding: '5px 10px', fontSize: '0.72rem', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Sign out
          </button>
        </div>
      </div>

      {/* ── Main content ── */}
      <main className="admin-main">
        <Outlet />
      </main>

      {/* ── Mobile bottom nav ── */}
      <nav className="mobile-bottom-nav">
        {NAV_ITEMS.map(({ to, label, icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => isActive ? 'active-mobile' : ''}
          >
            {icon}
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}