import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApi } from '../hooks/useAuth.jsx'

function StatCard({ icon, label, value, sub, accent }) {
  return (
    <div style={{
      background: 'var(--bg2)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      transition: 'border-color 0.15s, background 0.15s',
      cursor: 'default',
    }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg3)'; e.currentTarget.style.borderColor = 'var(--border-light)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg2)'; e.currentTarget.style.borderColor = 'var(--border)' }}
    >
      <div style={{
        width: 40, height: 40,
        borderRadius: 10,
        background: `${accent}14`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1.1rem',
      }}>
        {icon}
      </div>
      <div>
        <div style={{
          fontSize: '1.6rem',
          fontWeight: 800,
          letterSpacing: '-0.03em',
          lineHeight: 1,
          color: 'var(--text)',
        }}>
          {value ?? '—'}
        </div>
        <div style={{
          fontSize: '0.78rem',
          color: 'var(--text-muted)',
          marginTop: 5,
          fontWeight: 500,
        }}>
          {label}
        </div>
        {sub && (
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 2 }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  )
}

function ConnectionBadge({ status }) {
  if (status === null) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span className="loading-spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
      <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>Checking…</span>
    </div>
  )

  const ok = status?.ok
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {ok && (
          <div style={{
            position: 'absolute',
            width: 14, height: 14, borderRadius: '50%',
            background: 'var(--green)',
            opacity: 0.2,
            animation: 'ping 2s cubic-bezier(0,0,0.2,1) infinite',
          }} />
        )}
        <div style={{
          width: 7, height: 7, borderRadius: '50%',
          background: ok ? 'var(--green)' : 'var(--red)',
        }} />
      </div>
      <span style={{
        fontSize: '0.78rem',
        fontWeight: 600,
        color: ok ? 'var(--green)' : 'var(--red)',
      }}>
        {ok ? 'Connected' : status?.error || 'Disconnected'}
      </span>
      <style>{`@keyframes ping { 75%,100% { transform:scale(2.2); opacity:0; } }`}</style>
    </div>
  )
}

export default function Dashboard() {
  const api = useApi()
  const [stats, setStats] = useState(null)
  const [immichStatus, setImmichStatus] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [s, conn] = await Promise.all([
          api('/admin/stats'),
          api('/admin/immich/test'),
        ])
        setStats(s)
        setImmichStatus(conn)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div>
      {/* Page title — matches Immich's "Utilities" header style */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{
          fontSize: '1.25rem',
          fontWeight: 700,
          color: 'var(--text)',
          letterSpacing: '-0.01em',
        }}>
          Dashboard
        </h1>
      </div>

      {/* Immich connection status — matches the subtle info card style */}
      <div style={{
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '14px 18px',
        marginBottom: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)' }}>
            Immich Connection
          </div>
          <ConnectionBadge status={immichStatus} />
        </div>
        <Link to="/admin/settings" className="btn btn-secondary btn-sm">
          Configure
        </Link>
      </div>

      {/* Stats grid */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '60px 0', gap: 10, color: 'var(--text-dim)' }}>
          <span className="loading-spinner" style={{ width: 22, height: 22 }} />
          <span style={{ fontSize: '0.82rem' }}>Loading…</span>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
          marginBottom: 24,
        }}>
          <StatCard icon="🔗" label="Total Shares"  value={stats?.totalShares ?? 0}  accent="#c4a44a" />
          <StatCard icon="✅" label="Active"         value={stats?.activeShares ?? 0}  accent="#4ade80" />
          <StatCard icon="⌛" label="Expired"        value={stats?.expiredShares ?? 0} accent="#fbbf24" />
          <StatCard
            icon="👁"
            label="Total Views"
            value={stats?.totalViews ?? 0}
            sub={`${stats?.recentViews ?? 0} in last 7 days`}
            accent="#60a5fa"
          />
        </div>
      )}

      {/* Quick actions — matches Immich's "Organize your library" card style */}
      <div style={{
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--border)',
          fontSize: '0.75rem',
          fontWeight: 700,
          color: 'var(--text-muted)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}>
          Quick Actions
        </div>

        {/* Action list rows — like Immich's utility links */}
        {[
          {
            to: '/admin/shares',
            icon: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            ),
            label: 'Create new share',
          },
          {
            to: '/admin/shares',
            icon: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                <polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
              </svg>
            ),
            label: 'Manage shares',
          },
          {
            to: '/admin/logs',
            icon: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
              </svg>
            ),
            label: 'View activity logs',
          },
        ].map(({ to, icon, label }) => (
          <Link
            key={label}
            to={to}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '13px 18px',
              color: 'var(--text)',
              textDecoration: 'none',
              borderBottom: '1px solid var(--border)',
              fontSize: '0.875rem',
              fontWeight: 500,
              transition: 'background 0.12s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
              {icon}
            </span>
            {label}
            <span style={{ marginLeft: 'auto', color: 'var(--text-dim)', fontSize: '0.75rem' }}>→</span>
          </Link>
        ))}

        <div style={{ height: 1 }} /> {/* remove bottom border on last item */}
      </div>
    </div>
  )
}