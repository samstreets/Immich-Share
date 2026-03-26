import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useApi } from '../hooks/useAuth.jsx'

// ── tiny bar chart ─────────────────────────────────────────────────────────
function MiniBarChart({ data }) {
  if (!data || data.length === 0) return null
  const max = Math.max(...data.map(d => d.count), 1)
  const last30 = (() => {
    const out = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      const found = data.find(r => r.day === key)
      out.push({ day: key, count: found ? found.count : 0 })
    }
    return out
  })()

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 48, marginTop: 8 }}>
      {last30.map(({ day, count }) => (
        <div
          key={day}
          title={`${day}: ${count}`}
          style={{
            flex: 1,
            height: `${Math.max((count / max) * 100, count > 0 ? 6 : 1)}%`,
            background: count > 0 ? 'var(--accent)' : 'var(--border)',
            borderRadius: 2,
            opacity: count > 0 ? 0.85 : 0.3,
            cursor: 'default',
            transition: 'opacity 0.15s',
            minHeight: 1,
          }}
        />
      ))}
    </div>
  )
}

// ── action badge ────────────────────────────────────────────────────────────
const ACTION_STYLE = {
  view:   { bg: 'rgba(124,106,247,0.15)', color: 'var(--accent)',  icon: '👁' },
  upload: { bg: 'rgba(74,222,128,0.12)',  color: 'var(--green)',   icon: '📤' },
}

function ActionBadge({ action }) {
  const s = ACTION_STYLE[action] || { bg: 'var(--bg3)', color: 'var(--text-muted)', icon: '·' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 99, fontSize: '0.72rem',
      background: s.bg, color: s.color, fontWeight: 500, whiteSpace: 'nowrap',
    }}>
      {s.icon} {action}
    </span>
  )
}

// ── human-readable relative time ────────────────────────────────────────────
function relTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  return `${days}d ago`
}

// ── main page ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 100

export default function LogsPage() {
  const api = useApi()

  const [logs, setLogs]         = useState([])
  const [total, setTotal]       = useState(0)
  const [offset, setOffset]     = useState(0)
  const [loading, setLoading]   = useState(true)
  const [summary, setSummary]   = useState(null)

  // Filters
  const [search, setSearch]     = useState('')
  const [action, setAction]     = useState('')
  const searchTimer             = useRef(null)

  // Purge
  const [purgeDays, setPurgeDays] = useState('90')
  const [purging, setPurging]     = useState(false)
  const [purgeMsg, setPurgeMsg]   = useState(null)

  // Expanded row
  const [expanded, setExpanded] = useState(null)

  const loadLogs = useCallback(async (opts = {}) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        limit: PAGE_SIZE,
        offset: opts.offset ?? offset,
        ...(opts.action ?? action ? { action: opts.action ?? action } : {}),
        ...(opts.search ?? search ? { search: opts.search ?? search } : {}),
      })
      const data = await api(`/admin/logs?${params}`)
      setLogs(data.logs)
      setTotal(data.total)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [api, offset, action, search])

  const loadSummary = useCallback(async () => {
    try {
      const data = await api('/admin/logs/summary')
      setSummary(data)
    } catch (e) {
      console.error(e)
    }
  }, [api])

  useEffect(() => {
    loadLogs()
    loadSummary()
  }, [])

  // Debounced search
  function handleSearchChange(val) {
    setSearch(val)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setOffset(0)
      loadLogs({ search: val, offset: 0 })
    }, 350)
  }

  function handleActionChange(val) {
    setAction(val)
    setOffset(0)
    loadLogs({ action: val, offset: 0 })
  }

  function goPage(newOffset) {
    setOffset(newOffset)
    loadLogs({ offset: newOffset })
  }

  async function purge() {
    const days = parseInt(purgeDays, 10)
    if (!days || days < 1) return
    setPurging(true)
    setPurgeMsg(null)
    try {
      const data = await api(`/admin/logs?days=${days}`, { method: 'DELETE' })
      setPurgeMsg({ type: 'success', text: `Deleted ${data.deleted} log entries older than ${days} days.` })
      setOffset(0)
      loadLogs({ offset: 0 })
      loadSummary()
    } catch (e) {
      setPurgeMsg({ type: 'error', text: e.message })
    } finally {
      setPurging(false)
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Activity Logs</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: 4 }}>
          All access events across every share
        </p>
      </div>

      {/* Summary cards */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
          {/* Activity over 30 days */}
          <div className="card" style={{ gridColumn: 'span 2' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                Activity — last 30 days
              </span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                {summary.byDay.reduce((a, b) => a + b.count, 0)} events
              </span>
            </div>
            <MiniBarChart data={summary.byDay} />
          </div>

          {/* Action breakdown */}
          <div className="card">
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500, marginBottom: 10 }}>
              By Action
            </div>
            {summary.byAction.length === 0 && (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>No data yet</div>
            )}
            {summary.byAction.map(({ action: a, count }) => {
              const s = ACTION_STYLE[a] || { color: 'var(--text-muted)', icon: '·' }
              return (
                <div key={a} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: '0.82rem', color: s.color }}>
                    {s.icon} {a}
                  </span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{count.toLocaleString()}</span>
                </div>
              )
            })}
          </div>

          {/* Top shares */}
          <div className="card">
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500, marginBottom: 10 }}>
              Top Shares
            </div>
            {summary.topShares.length === 0 && (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>No data yet</div>
            )}
            {summary.topShares.slice(0, 5).map(row => (
              <div key={row.share_id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{
                    fontSize: '0.8rem', fontWeight: 500,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{row.share_name}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                    {row.views} views · {row.uploads} uploads
                  </div>
                </div>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, flexShrink: 0 }}>{row.total}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters + controls */}
      <div style={{
        display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center',
      }}>
        <input
          placeholder="Search share name or IP…"
          value={search}
          onChange={e => handleSearchChange(e.target.value)}
          style={{ flex: '1 1 220px', minWidth: 0 }}
        />
        <select
          value={action}
          onChange={e => handleActionChange(e.target.value)}
          style={{ width: 'auto', minWidth: 130, flex: '0 0 auto' }}
        >
          <option value="">All actions</option>
          <option value="view">👁 view</option>
          <option value="upload">📤 upload</option>
        </select>

        <button
          className="btn btn-secondary btn-sm"
          onClick={() => { setOffset(0); loadLogs({ offset: 0 }); loadSummary() }}
        >
          ↺ Refresh
        </button>
      </div>

      {/* Log table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
            <span className="loading-spinner" style={{ width: 26, height: 26 }} />
          </div>
        ) : logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
            No log entries found
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg3)' }}>
                  {['Time', 'Action', 'Share', 'IP Address', 'User Agent', ''].map(h => (
                    <th key={h} style={{
                      padding: '10px 14px', textAlign: 'left',
                      color: 'var(--text-dim)', fontWeight: 500, whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <React.Fragment key={log.id}>
                    <tr
                      style={{
                        borderBottom: '1px solid var(--border)',
                        cursor: 'pointer',
                        background: expanded === log.id ? 'var(--bg3)' : 'transparent',
                        transition: 'background 0.1s',
                      }}
                      onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                    >
                      {/* Time */}
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                        <div style={{ color: 'var(--text)' }}>
                          {new Date(log.accessed_at).toLocaleString(undefined, {
                            dateStyle: 'short', timeStyle: 'short',
                          })}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 1 }}>
                          {relTime(log.accessed_at)}
                        </div>
                      </td>
                      {/* Action */}
                      <td style={{ padding: '10px 14px' }}>
                        <ActionBadge action={log.action} />
                      </td>
                      {/* Share */}
                      <td style={{ padding: '10px 14px', maxWidth: 160 }}>
                        <div style={{
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          color: 'var(--text)',
                        }}>{log.share_name || log.share_id}</div>
                      </td>
                      {/* IP */}
                      <td style={{
                        padding: '10px 14px',
                        fontFamily: 'monospace',
                        fontSize: '0.78rem',
                        color: 'var(--text-muted)',
                        whiteSpace: 'nowrap',
                      }}>
                        {log.ip_address || '—'}
                      </td>
                      {/* UA (truncated) */}
                      <td style={{
                        padding: '10px 14px',
                        color: 'var(--text-dim)',
                        maxWidth: 200,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {log.user_agent || '—'}
                      </td>
                      {/* expand toggle */}
                      <td style={{ padding: '10px 14px', color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                        {expanded === log.id ? '▲' : '▼'}
                      </td>
                    </tr>

                    {/* Expanded detail row */}
                    {expanded === log.id && (
                      <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg3)' }}>
                        <td colSpan={6} style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                            <div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: 2 }}>Log ID</div>
                              <div style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{log.id}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: 2 }}>Share ID</div>
                              <div style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{log.share_id}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: 2 }}>Timestamp (UTC)</div>
                              <div style={{ fontSize: '0.8rem' }}>{new Date(log.accessed_at).toISOString()}</div>
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: 2 }}>Full User Agent</div>
                              <div style={{
                                fontSize: '0.78rem', fontFamily: 'monospace',
                                background: 'var(--bg)', padding: '6px 10px',
                                borderRadius: 4, wordBreak: 'break-all',
                              }}>
                                {log.user_agent || '—'}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary btn-sm"
            disabled={offset === 0}
            onClick={() => goPage(0)}
          >« First</button>
          <button
            className="btn btn-secondary btn-sm"
            disabled={offset === 0}
            onClick={() => goPage(Math.max(0, offset - PAGE_SIZE))}
          >‹ Prev</button>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Page {currentPage} of {totalPages} ({total.toLocaleString()} entries)
          </span>
          <button
            className="btn btn-secondary btn-sm"
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => goPage(offset + PAGE_SIZE)}
          >Next ›</button>
          <button
            className="btn btn-secondary btn-sm"
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => goPage((totalPages - 1) * PAGE_SIZE)}
          >Last »</button>
        </div>
      )}

      {!loading && totalPages <= 1 && total > 0 && (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: 24 }}>
          {total.toLocaleString()} {total === 1 ? 'entry' : 'entries'}
        </div>
      )}

      {/* Purge panel */}
      <div className="card" style={{ maxWidth: 480 }}>
        <h2 style={{
          fontSize: '0.95rem', fontWeight: 600,
          marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--border)',
        }}>
          Purge Old Logs
        </h2>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 14 }}>
          Delete log entries older than the specified number of days. This cannot be undone.
        </p>

        {purgeMsg && (
          <div className={purgeMsg.type === 'success' ? 'success-msg' : 'error-msg'} style={{ marginBottom: 12 }}>
            {purgeMsg.text}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              Older than
            </span>
            <input
              type="number"
              min="1"
              max="3650"
              value={purgeDays}
              onChange={e => setPurgeDays(e.target.value)}
              style={{ width: 80 }}
            />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>days</span>
          </div>
          <button
            className="btn btn-danger btn-sm"
            onClick={purge}
            disabled={purging}
          >
            {purging ? <span className="loading-spinner" /> : '🗑 Purge'}
          </button>
        </div>
      </div>
    </div>
  )
}
