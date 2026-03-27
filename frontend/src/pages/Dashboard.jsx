import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApi } from '../hooks/useAuth.jsx'

function StatCard({ icon, label, value, sub, color, accentBg }) {
  return (
    <div className="card" style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 16,
      border: '1.5px solid var(--border)',
      transition: 'border-color 0.15s, transform 0.15s',
    }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = `${color}40`
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      <div style={{
        width: 46, height: 46,
        borderRadius: 12,
        background: accentBg || `${color}12`,
        border: `1.5px solid ${color}22`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '1.3rem',
        flexShrink: 0,
      }}>{icon}</div>
      <div>
        <div style={{
          fontSize: '1.75rem',
          fontWeight: 800,
          lineHeight: 1.1,
          letterSpacing: '-0.02em',
          color: 'var(--text)',
        }}>{value}</div>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 3, fontWeight: 600 }}>
          {label}
        </div>
        {sub && (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: 2 }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  )
}

function ConnectionDot({ ok }) {
  if (ok === null) return (
    <div style={{
      width: 8, height: 8, borderRadius: '50%',
      background: 'var(--text-dim)',
    }} />
  )
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {ok && (
        <div style={{
          position: 'absolute',
          width: 16, height: 16, borderRadius: '50%',
          background: 'var(--green)',
          opacity: 0.25,
          animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite',
        }} />
      )}
      <div style={{
        width: 8, height: 8, borderRadius: '50%',
        background: ok ? 'var(--green)' : 'var(--red)',
      }} />
      <style>{`@keyframes ping { 75%,100% { transform:scale(2); opacity:0; } }`}</style>
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
      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
          Dashboard
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: 4, fontWeight: 500 }}>
          Overview of your Immich Share instance
        </p>
      </div>

      {/* Connection status banner */}
      <div style={{
        background: 'var(--bg2)',
        border: '1.5px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '14px 18px',
        marginBottom: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ConnectionDot ok={immichStatus?.ok ?? null} />
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
              Immich Connection
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 1 }}>
              {immichStatus === null
                ? 'Checking connection…'
                : immichStatus.ok
                  ? 'Connected and operational'
                  : `Error: ${immichStatus.error}`}
            </div>
          </div>
        </div>
        <Link to="/admin/settings" className="btn btn-secondary btn-sm">
          Configure →
        </Link>
      </div>

      {/* Stats grid */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '64px 0', gap: 12, color: 'var(--text-dim)' }}>
          <span className="loading-spinner" style={{ width: 26, height: 26 }} />
          <span style={{ fontSize: '0.875rem' }}>Loading stats…</span>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
          gap: 14,
          marginBottom: 28,
        }}>
          <StatCard
            icon="🔗"
            label="Total Shares"
            value={stats?.totalShares ?? 0}
            color="#d4a843"
          />
          <StatCard
            icon="✅"
            label="Active Shares"
            value={stats?.activeShares ?? 0}
            color="#4ade80"
          />
          <StatCard
            icon="⌛"
            label="Expired"
            value={stats?.expiredShares ?? 0}
            color="#fbbf24"
          />
          <StatCard
            icon="👁️"
            label="Total Views"
            value={stats?.totalViews ?? 0}
            sub={`${stats?.recentViews ?? 0} in last 7 days`}
            color="#60a5fa"
          />
        </div>
      )}

      {/* Quick actions */}
      <div style={{
        background: 'var(--bg2)',
        border: '1.5px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '20px 24px',
      }}>
        <div style={{
          fontSize: '0.72rem',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--text-dim)',
          marginBottom: 14,
        }}>
          Quick Actions
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link to="/admin/shares" className="btn btn-primary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Share
          </Link>
          <Link to="/admin/shares" className="btn btn-secondary">View All Shares</Link>
          <Link to="/admin/logs" className="btn btn-secondary">Activity Logs</Link>
          <Link to="/admin/settings" className="btn btn-secondary">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            Settings
          </Link>
        </div>
      </div>
    </div>
  )
}