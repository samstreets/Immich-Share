import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApi } from '../hooks/useAuth.jsx'

function StatCard({ icon, label, value, sub, color }) {
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
      <div style={{
        width: 44, height: 44, borderRadius: 10,
        background: `${color}18`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1.25rem', flexShrink: 0,
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: '1.6rem', fontWeight: 600, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
        {sub && <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: 2 }}>{sub}</div>}
      </div>
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
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Dashboard</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: 4 }}>
          Overview of your Immich Share instance
        </p>
      </div>

      {/* Immich connection status */}
      <div className="card" style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: immichStatus?.ok ? 'var(--green)' : immichStatus === null ? 'var(--text-dim)' : 'var(--red)',
            boxShadow: immichStatus?.ok ? '0 0 8px var(--green)' : 'none',
          }} />
          <div>
            <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>Immich Connection</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {immichStatus === null ? 'Checking…' : immichStatus.ok ? 'Connected and operational' : `Error: ${immichStatus.error}`}
            </div>
          </div>
        </div>
        <Link to="/admin/settings" className="btn btn-secondary btn-sm">Configure →</Link>
      </div>

      {/* Stats grid */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <span className="loading-spinner" style={{ width: 28, height: 28 }} />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
          <StatCard icon="⬡" label="Total Shares" value={stats?.totalShares ?? 0} color="#7c6af7" />
          <StatCard icon="✓" label="Active Shares" value={stats?.activeShares ?? 0} color="#4ade80" />
          <StatCard icon="⏱" label="Expired Shares" value={stats?.expiredShares ?? 0} color="#fbbf24" />
          <StatCard icon="👁" label="Total Views" value={stats?.totalViews ?? 0} sub={`${stats?.recentViews ?? 0} this week`} color="#60a5fa" />
        </div>
      )}

      {/* Quick actions */}
      <div className="card">
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 16 }}>Quick Actions</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link to="/admin/shares" className="btn btn-primary">＋ Create Share</Link>
          <Link to="/admin/shares" className="btn btn-secondary">View All Shares</Link>
          <Link to="/admin/settings" className="btn btn-secondary">⚙ Settings</Link>
        </div>
      </div>
    </div>
  )
}
