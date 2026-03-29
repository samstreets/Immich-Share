import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useApi } from '../hooks/useAuth.jsx'

function MiniBarChart({ data }) {
  if (!data || data.length === 0) return null
  const max = Math.max(...data.map(d => d.count), 1)
  const last30 = (() => {
    const out = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      const found = data.find(r => r.day === key)
      out.push({ day: key, count: found ? found.count : 0 })
    }
    return out
  })()
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 44, marginTop: 8 }}>
      {last30.map(({ day, count }) => (
        <div key={day} title={`${day}: ${count}`} style={{
          flex: 1,
          height: `${Math.max((count / max) * 100, count > 0 ? 6 : 1)}%`,
          background: count > 0 ? 'var(--accent)' : 'var(--border)',
          borderRadius: 2, opacity: count > 0 ? 0.85 : 0.3, cursor: 'default', minHeight: 1,
        }} />
      ))}
    </div>
  )
}

const ACTION_STYLE = {
  view:   { bg: 'rgba(124,106,247,0.15)', color: 'var(--accent)', icon: '👁' },
  upload: { bg: 'rgba(74,222,128,0.12)',  color: 'var(--green)',  icon: '📤' },
}

function ActionBadge({ action }) {
  const s = ACTION_STYLE[action] || { bg: 'var(--bg3)', color: 'var(--text-muted)', icon: '·' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 99, fontSize: '0.7rem', background: s.bg, color: s.color, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {s.icon} {action}
    </span>
  )
}

function relTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const PAGE_SIZE = 100

export default function LogsPage() {
  const api = useApi()
  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState(null)
  const [search, setSearch] = useState('')
  const [action, setAction] = useState('')
  const searchTimer = useRef(null)
  const [purgeDays, setPurgeDays] = useState('90')
  const [purging, setPurging] = useState(false)
  const [purgeMsg, setPurgeMsg] = useState(null)
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
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [api, offset, action, search])

  const loadSummary = useCallback(async () => {
    try { setSummary(await api('/admin/logs/summary')) } catch (e) { console.error(e) }
  }, [api])

  useEffect(() => { loadLogs(); loadSummary() }, [])

  function handleSearchChange(val) {
    setSearch(val)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setOffset(0); loadLogs({ search: val, offset: 0 }) }, 350)
  }

  function handleActionChange(val) {
    setAction(val); setOffset(0); loadLogs({ action: val, offset: 0 })
  }

  function goPage(newOffset) { setOffset(newOffset); loadLogs({ offset: newOffset }) }

  async function purge() {
    const days = parseInt(purgeDays, 10)
    if (!days || days < 1) return
    setPurging(true); setPurgeMsg(null)
    try {
      const data = await api(`/admin/logs?days=${days}`, { method: 'DELETE' })
      setPurgeMsg({ type: 'success', text: `Deleted ${data.deleted} entries older than ${days} days.` })
      setOffset(0); loadLogs({ offset: 0 }); loadSummary()
    } catch (e) {
      setPurgeMsg({ type: 'error', text: e.message })
    } finally { setPurging(false) }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  return (
    <div>
      <style>{`
        .logs-summary-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-bottom: 20px;
        }
        .logs-summary-wide {
          grid-column: 1 / -1;
        }
        @media (min-width: 700px) {
          .logs-summary-grid {
            grid-template-columns: 2fr 1fr 1fr;
          }
          .logs-summary-wide {
            grid-column: auto;
          }
        }

        /* Log row: show all columns on desktop, condensed on mobile */
        .log-row-ua, .log-row-ip-desktop {
          display: table-cell;
        }
        @media (max-width: 600px) {
          .log-row-ua { display: none; }
        }
      `}</style>

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Activity Logs</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 2 }}>
          All access events across every share
        </p>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="logs-summary-grid">
          <div className="card logs-summary-wide">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>Last 30 days</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                {summary.byDay.reduce((a, b) => a + b.count, 0)} events
              </span>
            </div>
            <MiniBarChart data={summary.byDay} />
          </div>

          <div className="card">
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8 }}>By Action</div>
            {summary.byAction.length === 0
              ? <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>No data</div>
              : summary.byAction.map(({ action: a, count }) => {
                  const s = ACTION_STYLE[a] || { color: 'var(--text-muted)', icon: '·' }
                  return (
                    <div key={a} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: '0.78rem', color: s.color }}>{s.icon} {a}</span>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>{count.toLocaleString()}</span>
                    </div>
                  )
                })
            }
          </div>

          <div className="card">
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8 }}>Top Shares</div>
            {summary.topShares.length === 0
              ? <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>No data</div>
              : summary.topShares.slice(0, 5).map(row => (
                  <div key={row.share_id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.share_name}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>{row.views}v · {row.uploads}u</div>
                    </div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, flexShrink: 0 }}>{row.total}</span>
                  </div>
                ))
            }
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          placeholder="Search share or IP…"
          value={search}
          onChange={e => handleSearchChange(e.target.value)}
          style={{ flex: '1 1 160px', minWidth: 0 }}
        />
        <select value={action} onChange={e => handleActionChange(e.target.value)} style={{ width: 'auto', minWidth: 120, flex: '0 0 auto' }}>
          <option value="">All actions</option>
          <option value="view">👁 view</option>
          <option value="upload">📤 upload</option>
        </select>
        <button className="btn btn-secondary btn-sm" onClick={() => { setOffset(0); loadLogs({ offset: 0 }); loadSummary() }}>
          ↺
        </button>
      </div>

      {/* Log table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 14 }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
            <span className="loading-spinner" style={{ width: 26, height: 26 }} />
          </div>
        ) : logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>No log entries found</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg3)' }}>
                  <th style={{ padding: '9px 12px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 500, whiteSpace: 'nowrap' }}>Time</th>
                  <th style={{ padding: '9px 12px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 500 }}>Action</th>
                  <th style={{ padding: '9px 12px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 500 }}>Share</th>
                  <th style={{ padding: '9px 12px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 500, whiteSpace: 'nowrap' }}>IP</th>
                  <th className="log-row-ua" style={{ padding: '9px 12px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 500 }}>User Agent</th>
                  <th style={{ padding: '9px 12px' }}></th>
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
                      <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                        <div style={{ color: 'var(--text)', fontSize: '0.75rem' }}>
                          {new Date(log.accessed_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: 1 }}>{relTime(log.accessed_at)}</div>
                      </td>
                      <td style={{ padding: '9px 12px' }}><ActionBadge action={log.action} /></td>
                      <td style={{ padding: '9px 12px', maxWidth: 130 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.78rem', color: 'var(--text)' }}>
                          {log.share_name || log.share_id}
                        </div>
                      </td>
                      <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {log.ip_address || '—'}
                      </td>
                      <td className="log-row-ua" style={{ padding: '9px 12px', color: 'var(--text-dim)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                        {log.user_agent || '—'}
                      </td>
                      <td style={{ padding: '9px 10px', color: 'var(--text-dim)', fontSize: '0.75rem' }}>
                        {expanded === log.id ? '▲' : '▼'}
                      </td>
                    </tr>
                    {expanded === log.id && (
                      <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg3)' }}>
                        <td colSpan={6} style={{ padding: '12px 14px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                            <div>
                              <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginBottom: 2 }}>Log ID</div>
                              <div style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{log.id}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginBottom: 2 }}>Share ID</div>
                              <div style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{log.share_id}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginBottom: 2 }}>UTC</div>
                              <div style={{ fontSize: '0.75rem' }}>{new Date(log.accessed_at).toISOString()}</div>
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                              <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginBottom: 2 }}>User Agent</div>
                              <div style={{ fontSize: '0.72rem', fontFamily: 'monospace', background: 'var(--bg)', padding: '5px 8px', borderRadius: 4, wordBreak: 'break-all' }}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" disabled={offset === 0} onClick={() => goPage(0)}>« First</button>
          <button className="btn btn-secondary btn-sm" disabled={offset === 0} onClick={() => goPage(Math.max(0, offset - PAGE_SIZE))}>‹ Prev</button>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {currentPage} / {totalPages} <span style={{ color: 'var(--text-dim)' }}>({total.toLocaleString()})</span>
          </span>
          <button className="btn btn-secondary btn-sm" disabled={offset + PAGE_SIZE >= total} onClick={() => goPage(offset + PAGE_SIZE)}>Next ›</button>
          <button className="btn btn-secondary btn-sm" disabled={offset + PAGE_SIZE >= total} onClick={() => goPage((totalPages - 1) * PAGE_SIZE)}>Last »</button>
        </div>
      )}

      {!loading && totalPages <= 1 && total > 0 && (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: 20 }}>
          {total.toLocaleString()} {total === 1 ? 'entry' : 'entries'}
        </div>
      )}

      {/* Purge panel */}
      <div className="card" style={{ maxWidth: 480 }}>
        <h2 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
          Purge Old Logs
        </h2>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 12 }}>
          Delete entries older than the specified number of days. This cannot be undone.
        </p>
        {purgeMsg && (
          <div className={purgeMsg.type === 'success' ? 'success-msg' : 'error-msg'} style={{ marginBottom: 10 }}>
            {purgeMsg.text}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Older than</span>
            <input type="number" min="1" max="3650" value={purgeDays} onChange={e => setPurgeDays(e.target.value)} style={{ width: 72 }} />
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>days</span>
          </div>
          <button className="btn btn-danger btn-sm" onClick={purge} disabled={purging}>
            {purging ? <span className="loading-spinner" /> : '🗑 Purge'}
          </button>
        </div>
      </div>
    </div>
  )
}