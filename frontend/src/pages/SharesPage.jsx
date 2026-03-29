import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useApi } from '../hooks/useAuth.jsx'

// ── Copy button ───────────────────────────────────────────────────────────────
function CopyButton({ text, label = 'Copy', copiedLabel = 'Copied' }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try { await navigator.clipboard.writeText(text) }
    catch {
      const ta = document.createElement('textarea')
      ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'
      document.body.appendChild(ta); ta.focus(); ta.select()
      document.execCommand('copy'); document.body.removeChild(ta)
    }
    setCopied(true); setTimeout(() => setCopied(false), 1800)
  }
  return (
    <button onClick={copy} className="btn btn-secondary btn-sm" title="Copy link">
      {copied ? (
        <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> {copiedLabel}</>
      ) : (
        <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> {label}</>
      )}
    </button>
  )
}

// ── Mini bar chart ────────────────────────────────────────────────────────────
function MiniBar({ data = [], height = 36, days = 14 }) {
  if (!data || data.length === 0) return <div style={{ height, display: 'flex', alignItems: 'center', color: 'var(--text-dim)', fontSize: '0.72rem' }}>No data</div>
  const byDay = {}
  for (const d of data) {
    if (!byDay[d.day]) byDay[d.day] = { view: 0, upload: 0 }
    byDay[d.day][d.action] = (byDay[d.day][d.action] || 0) + d.count
  }
  const pts = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    pts.push({ day: key, ...(byDay[key] || { view: 0, upload: 0 }) })
  }
  const max = Math.max(...pts.map(p => p.view + p.upload), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height }}>
      {pts.map(({ day, view, upload }) => {
        const total = view + upload
        const h = Math.max((total / max) * 100, total > 0 ? 8 : 1)
        return (
          <div key={day} title={`${day}: ${total}`} style={{ flex: 1, height: `${h}%`, borderRadius: 2, background: total > 0 ? 'var(--accent)' : 'var(--border)', opacity: total > 0 ? 0.8 : 0.25, minHeight: 1 }} />
        )
      })}
    </div>
  )
}

// ── QR Code modal ─────────────────────────────────────────────────────────────
function QRModal({ share, onClose }) {
  const [svgContent, setSvgContent] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadQR() {
      setSvgContent(null); setError('')
      try {
        const dark_ = encodeURIComponent('#13161f')
        const light_ = encodeURIComponent('#ffffff')
        const res = await fetch(`/api/shares/${share.id}/qr?size=280&dark=${dark_}&light=${light_}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` }
        })
        if (!res.ok) throw new Error('QR generation failed')
        setSvgContent(await res.text())
      } catch (err) {
        setError(err.message)
      }
    }
    loadQR()
  }, [share.id])

  function downloadSVG() {
    if (!svgContent) return
    const blob = new Blob([svgContent], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${share.name.replace(/[^a-z0-9]/gi, '_')}_qr.svg`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 360 }}>
        <div className="modal-header">
          <h2>QR Code — {share.name}</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 260, height: 260, borderRadius: 12, background: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid var(--border)', overflow: 'hidden',
            boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
          }}>
            {svgContent
              ? <div dangerouslySetInnerHTML={{ __html: svgContent }} style={{ width: 260, height: 260 }} />
              : error
                ? <div style={{ color: 'var(--red)', fontSize: '0.8rem', textAlign: 'center', padding: 20 }}>{error}</div>
                : <span className="loading-spinner" style={{ width: 28, height: 28 }} />
            }
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textAlign: 'center', fontFamily: 'monospace', wordBreak: 'break-all', padding: '0 10px' }}>
            {share.shareUrl}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button className="btn btn-primary btn-sm" onClick={downloadSVG} disabled={!svgContent}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download SVG
            </button>
            <CopyButton text={share.shareUrl} label="Copy Link" copiedLabel="Copied!" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Stats modal ───────────────────────────────────────────────────────────────
function StatsModal({ share, onClose }) {
  const api = useApi()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api(`/shares/${share.id}/stats`).then(setStats).catch(console.error).finally(() => setLoading(false))
  }, [share.id])

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h2>Stats — {share.name}</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
              <span className="loading-spinner" style={{ width: 24, height: 24 }} />
            </div>
          ) : stats ? (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
                {[
                  { label: 'Total Events', value: stats.total, color: 'var(--accent)' },
                  { label: 'Unique Visitors', value: stats.unique, color: 'var(--blue)' },
                  { label: 'Views', value: stats.byAction.find(a => a.action === 'view')?.count || 0, color: 'var(--green)' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color, letterSpacing: '-0.02em' }}>{value}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', fontWeight: 600, marginTop: 3 }}>{label}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                  Activity — Last 14 Days
                </div>
                <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px 14px' }}>
                  <MiniBar data={stats.byDay} height={48} days={14} />
                </div>
              </div>
              {stats.byAction.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>By Action</div>
                  {stats.byAction.map(({ action, count }) => (
                    <div key={action} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <div style={{ width: 60, fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                        {action === 'view' ? '👁 view' : '📤 upload'}
                      </div>
                      <div style={{ flex: 1, height: 6, background: 'var(--bg3)', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(count / stats.total) * 100}%`, background: action === 'view' ? 'var(--accent)' : 'var(--green)', borderRadius: 999, transition: 'width 0.4s ease' }} />
                      </div>
                      <div style={{ width: 32, fontSize: '0.78rem', fontWeight: 700, textAlign: 'right' }}>{count}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 40 }}>No stats available</div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Logs modal ────────────────────────────────────────────────────────────────
function LogsModal({ share, onClose }) {
  const api = useApi()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api(`/shares/${share.id}/logs`).then(setLogs).catch(console.error).finally(() => setLoading(false))
  }, [share.id])

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 700 }}>
        <div className="modal-header">
          <h2>Access Logs — {share.name}</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
              <span className="loading-spinner" style={{ width: 24, height: 24 }} />
            </div>
          ) : logs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>No access logs yet</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>Time</th><th>Action</th><th>IP Address</th><th>User Agent</th></tr></thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id}>
                      <td style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {new Date(log.accessed_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '2px 8px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 700,
                          background: log.action === 'view' ? 'var(--accent-dim)' : 'rgba(74,222,128,0.1)',
                          color: log.action === 'view' ? 'var(--accent)' : 'var(--green)',
                          textTransform: 'uppercase', letterSpacing: '0.04em',
                        }}>
                          {log.action === 'view' ? '👁' : '📤'} {log.action}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{log.ip_address || '—'}</td>
                      <td style={{ color: 'var(--text-dim)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.user_agent || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 10, fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                Showing last {logs.length} entries
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Slug preview ──────────────────────────────────────────────────────────────
function SlugPreview({ slug, externalUrl }) {
  if (!slug) return null
  const clean = slug.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  if (!clean) return null
  return (
    <span style={{ fontSize: '0.75rem', color: 'var(--accent)', fontFamily: 'monospace', marginTop: 4, display: 'block', fontWeight: 600 }}>
      {externalUrl || window.location.origin}/s/{clean}
    </span>
  )
}

// ── Share form modal ──────────────────────────────────────────────────────────
function ShareModal({ onClose, onSaved, editShare }) {
  const api = useApi()
  const [albums, setAlbums] = useState([])
  const [tags, setTags] = useState([])
  const [sourceLoading, setSourceLoading] = useState(false)
  const [externalUrl, setExternalUrl] = useState('')
  const [form, setForm] = useState({
    name: editShare?.name || '',
    description: editShare?.description || '',
    share_type: editShare?.share_type || 'album',
    immich_album_id: editShare?.immich_album_id || '',
    immich_tag_id: editShare?.immich_tag_id || '',
    password: '',
    expires_at: editShare?.expires_at ? editShare.expires_at.slice(0, 16) : '',
    allow_download: editShare?.allow_download !== false,
    allow_upload: editShare?.allow_upload || false,
    show_metadata: editShare?.show_metadata || false,
    slug: editShare?.slug || '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSourceLoading(true)
    Promise.all([
      api('/admin/immich/albums').catch(() => []),
      api('/admin/immich/tags').catch(() => []),
      api('/admin/settings').catch(() => ({})),
    ]).then(([a, t, s]) => {
      setAlbums(Array.isArray(a) ? a : [])
      setTags(Array.isArray(t) ? t : [])
      setExternalUrl((s?.external_url || '').replace(/\/$/, ''))
    }).finally(() => setSourceLoading(false))
  }, [])

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  async function handleSubmit(e) {
    e.preventDefault(); setError(''); setSaving(true)
    try {
      if (editShare) {
        await api(`/shares/${editShare.id}`, {
          method: 'PATCH',
          body: { name: form.name, description: form.description, password: form.password || undefined, expires_at: form.expires_at || null, allow_download: form.allow_download, allow_upload: form.allow_upload, show_metadata: form.show_metadata, slug: form.slug },
        })
      } else {
        if (!form.password) throw new Error('Password is required')
        await api('/shares', {
          method: 'POST',
          body: { name: form.name, description: form.description, share_type: form.share_type, immich_album_id: form.share_type === 'album' ? form.immich_album_id : undefined, immich_tag_id: form.share_type === 'tag' ? form.immich_tag_id : undefined, password: form.password, expires_at: form.expires_at || undefined, allow_download: form.allow_download, allow_upload: form.allow_upload, show_metadata: form.show_metadata, slug: form.slug || undefined },
        })
      }
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const CheckBox = ({ checked, onChange, label }) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500, userSelect: 'none' }}>
      <div style={{
        width: 18, height: 18, borderRadius: 5,
        background: checked ? 'var(--accent)' : 'var(--bg3)',
        border: checked ? '2px solid var(--accent)' : '2px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s', flexShrink: 0,
      }}>
        {checked && <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><polyline points="2 6 5 9 10 3" stroke="#1a1200" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      </div>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ display: 'none' }} />
      {label}
    </label>
  )

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>{editShare ? 'Edit Share' : 'Create New Share'}</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {error && <div className="error-msg">⚠ {error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Share Name *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Summer 2024 Photos" required />
            </div>
            <div className="form-group">
              <label>Description</label>
              <input value={form.description} onChange={e => set('description', e.target.value)} placeholder="Optional description for viewers" />
            </div>
            <div className="form-group">
              <label>Custom URL Slug <span style={{ marginLeft: 6, padding: '1px 7px', borderRadius: 4, fontSize: '0.68rem', background: 'var(--accent-dim)', color: 'var(--accent)', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>optional</span></label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', fontSize: '0.85rem', pointerEvents: 'none', userSelect: 'none', fontWeight: 600 }}>/s/</span>
                <input value={form.slug} onChange={e => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder="my-summer-trip" style={{ paddingLeft: 36 }} minLength={3} maxLength={60} />
              </div>
              <SlugPreview slug={form.slug} externalUrl={externalUrl} />
              <span className="hint">3–60 chars, lowercase letters, numbers and hyphens only.</span>
            </div>
            {!editShare && (
              <>
                <div className="form-group">
                  <label>Share Type</label>
                  <select value={form.share_type} onChange={e => set('share_type', e.target.value)}>
                    <option value="album">Immich Album</option>
                    <option value="tag">Immich Tag</option>
                  </select>
                </div>
                {form.share_type === 'album' && (
                  <div className="form-group">
                    <label>Album {sourceLoading && <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(loading…)</span>}</label>
                    <select value={form.immich_album_id} onChange={e => set('immich_album_id', e.target.value)} required>
                      <option value="">Select an album…</option>
                      {albums.map(a => <option key={a.id} value={a.id}>{a.albumName} ({a.assetCount} assets)</option>)}
                    </select>
                    {albums.length === 0 && !sourceLoading && <span className="hint">No albums found — check Immich connection in Settings.</span>}
                  </div>
                )}
                {form.share_type === 'tag' && (
                  <div className="form-group">
                    <label>Tag {sourceLoading && <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(loading…)</span>}</label>
                    <select value={form.immich_tag_id} onChange={e => set('immich_tag_id', e.target.value)} required>
                      <option value="">Select a tag…</option>
                      {tags.map(tag => <option key={tag.id} value={tag.id}>{tag.value ?? tag.name ?? tag.id}</option>)}
                    </select>
                  </div>
                )}
              </>
            )}
            <div className="form-group">
              <label>{editShare ? 'New Password' : 'Password *'}</label>
              <input type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder={editShare ? 'Leave blank to keep current' : 'Set a share password'} required={!editShare} minLength={4} />
              <span className="hint">Viewers need this to access the share.</span>
            </div>
            <div className="form-group">
              <label>Expiry Date (optional)</label>
              <input type="datetime-local" value={form.expires_at} onChange={e => set('expires_at', e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 22, padding: '12px 14px', background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              <CheckBox checked={form.allow_download} onChange={v => set('allow_download', v)} label="Allow downloads" />
              <CheckBox checked={form.allow_upload} onChange={v => set('allow_upload', v)} label="Allow uploads" />
              <CheckBox checked={form.show_metadata} onChange={v => set('show_metadata', v)} label="Show metadata" />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <span className="loading-spinner" /> : editShare ? 'Save Changes' : 'Create Share'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

// ── Bulk action bar ───────────────────────────────────────────────────────────
function BulkBar({ selected, total, onSelectAll, onClearAll, onDeleteSelected, onToggleSelected, deleting }) {
  if (selected.length === 0) return null
  return (
    <div style={{
      background: 'var(--bg)',
      borderBottom: '1px solid var(--accent)',
      padding: '10px 0',
      display: 'flex', alignItems: 'center', gap: 8,
      flexWrap: 'wrap',
      animation: 'slideUp 0.15s ease',
      marginBottom: 12,
    }}>
      <style>{`@keyframes slideUp { from { opacity:0; transform:translateY(-4px) } }`}</style>
      <div style={{
        background: 'var(--accent-dim)', border: '1px solid var(--accent)',
        borderRadius: 'var(--radius-sm)', padding: '7px 12px',
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent)', flex: 1, minWidth: 0,
      }}>
        <span style={{ background: 'var(--accent)', color: '#1a1200', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800, flexShrink: 0 }}>{selected.length}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.length} selected</span>
        <button onClick={onClearAll} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '0.8rem', padding: '0 2px', marginLeft: 'auto', flexShrink: 0 }}>✕</button>
      </div>
      <button className="btn btn-secondary btn-sm" onClick={() => onToggleSelected(true)}>Enable</button>
      <button className="btn btn-secondary btn-sm" onClick={() => onToggleSelected(false)}>Disable</button>
      <button className="btn btn-danger btn-sm" onClick={onDeleteSelected} disabled={deleting}>
        {deleting ? <span className="loading-spinner" style={{ width: 12, height: 12 }} /> : '🗑 Delete'}
      </button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SharesPage() {
  const api = useApi()
  const [shares, setShares] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editShare, setEditShare] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [logsShare, setLogsShare] = useState(null)
  const [qrShare, setQrShare] = useState(null)
  const [statsShare, setStatsShare] = useState(null)

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const searchTimer = useRef(null)

  const [selected, setSelected] = useState(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

  // Track which share's action menu is open (mobile)
  const [openMenu, setOpenMenu] = useState(null)

  const load = useCallback(async (opts = {}) => {
    try {
      const params = new URLSearchParams()
      if (opts.search ?? search) params.set('search', opts.search ?? search)
      if (opts.type ?? typeFilter) params.set('type', opts.type ?? typeFilter)
      if (opts.status ?? statusFilter) params.set('status', opts.status ?? statusFilter)
      const data = await api(`/shares?${params}`)
      setShares(data)
      setSelected(new Set())
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [api, search, typeFilter, statusFilter])

  useEffect(() => { load() }, [])
  // Close open menu when clicking outside
  useEffect(() => {
    function handleClick() { setOpenMenu(null) }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  function handleSearchChange(val) {
    setSearch(val)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => load({ search: val }), 300)
  }

  function handleFilter(key, val) {
    if (key === 'type') { setTypeFilter(val); load({ type: val }) }
    if (key === 'status') { setStatusFilter(val); load({ status: val }) }
  }

  async function deleteShare(id) {
    try { await api(`/shares/${id}`, { method: 'DELETE' }); setConfirmDelete(null); load() }
    catch (e) { alert(e.message) }
  }

  async function toggleActive(share) {
    try { await api(`/shares/${share.id}`, { method: 'PATCH', body: { is_active: !share.is_active } }); load() }
    catch (e) { alert(e.message) }
  }

  function toggleSelect(id) {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }

  function toggleSelectAll() {
    setSelected(selected.size === shares.length ? new Set() : new Set(shares.map(s => s.id)))
  }

  async function bulkDelete() {
    if (!selected.size) return
    setBulkDeleting(true)
    try {
      const res = await fetch('/api/shares/bulk/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
        body: JSON.stringify({ ids: [...selected] }),
      })
      if (!res.ok) throw new Error('Bulk delete failed')
      setSelected(new Set()); load()
    } catch {
      for (const id of selected) { try { await api(`/shares/${id}`, { method: 'DELETE' }) } catch {} }
      setSelected(new Set()); load()
    } finally { setBulkDeleting(false) }
  }

  async function bulkToggle(is_active) {
    const res = await fetch('/api/shares/bulk/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
      body: JSON.stringify({ ids: [...selected], is_active }),
    })
    if (res.ok) { setSelected(new Set()); load() }
  }

  return (
    <div>
      <style>{`
        .shares-actions-bar {
          display: flex;
          gap: 6px;
          flex-shrink: 0;
          flex-wrap: wrap;
          align-items: flex-start;
        }
        /* On mobile, actions collapse to a "..." menu */
        @media (max-width: 600px) {
          .shares-actions-bar {
            display: none;
          }
          .share-menu-btn {
            display: flex !important;
          }
        }
        .share-menu-btn {
          display: none;
        }
        .share-action-menu {
          position: absolute;
          right: 0;
          top: calc(100% + 4px);
          background: var(--bg2);
          border: 1px solid var(--border-light);
          border-radius: var(--radius-sm);
          box-shadow: var(--shadow);
          z-index: 50;
          min-width: 180px;
          overflow: hidden;
          animation: fadeIn 0.1s ease;
        }
        .share-action-menu button {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 10px 14px;
          background: transparent;
          border: none;
          border-bottom: 1px solid var(--border);
          color: var(--text-muted);
          font-size: 0.82rem;
          font-weight: 500;
          cursor: pointer;
          font-family: inherit;
          text-align: left;
          transition: background 0.1s;
        }
        .share-action-menu button:last-child { border-bottom: none; }
        .share-action-menu button:hover { background: var(--bg-hover); color: var(--text); }
        .share-action-menu button.danger { color: var(--red); }
        .share-action-menu button.danger:hover { background: rgba(248,113,113,0.08); }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.01em' }}>Shares</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 2, fontWeight: 500 }}>
            Password-protected share links
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditShare(null); setShowModal(true) }} style={{ flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New Share
        </button>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 0 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input placeholder="Search…" value={search} onChange={e => handleSearchChange(e.target.value)} style={{ paddingLeft: 30 }} />
        </div>
        <select value={typeFilter} onChange={e => handleFilter('type', e.target.value)} style={{ width: 'auto', minWidth: 100, flex: '0 0 auto' }}>
          <option value="">All types</option>
          <option value="album">Album</option>
          <option value="tag">Tag</option>
        </select>
        <select value={statusFilter} onChange={e => handleFilter('status', e.target.value)} style={{ width: 'auto', minWidth: 110, flex: '0 0 auto' }}>
          <option value="">All status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="expired">Expired</option>
        </select>
        {(search || typeFilter || statusFilter) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setTypeFilter(''); setStatusFilter(''); load({ search: '', type: '', status: '' }) }}>✕</button>
        )}
        <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginLeft: 2, flexShrink: 0 }}>
          {shares.length} share{shares.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Bulk bar */}
      <BulkBar
        selected={[...selected]} total={shares.length}
        onSelectAll={toggleSelectAll} onClearAll={() => setSelected(new Set())}
        onDeleteSelected={bulkDelete} onToggleSelected={bulkToggle}
        deleting={bulkDeleting}
      />

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '80px 0', gap: 12, color: 'var(--text-dim)' }}>
          <span className="loading-spinner" style={{ width: 26, height: 26 }} />
        </div>
      ) : shares.length === 0 ? (
        <div style={{ background: 'var(--bg2)', border: '1.5px dashed var(--border)', borderRadius: 'var(--radius)', textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🔗</div>
          <div style={{ fontWeight: 700, marginBottom: 6, fontSize: '0.95rem' }}>
            {search || typeFilter || statusFilter ? 'No shares match your filters' : 'No shares yet'}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: 20, maxWidth: 320, margin: '0 auto 20px' }}>
            {search || typeFilter || statusFilter
              ? 'Try adjusting your search or filters.'
              : 'Create a share link to give anyone access to your Immich albums.'
            }
          </div>
          {!search && !typeFilter && !statusFilter && (
            <button className="btn btn-primary" onClick={() => { setEditShare(null); setShowModal(true) }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Create Share
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shares.map(share => {
            const isSelected = selected.has(share.id)
            const menuOpen = openMenu === share.id
            return (
              <div key={share.id} style={{
                background: isSelected ? 'rgba(196,164,74,0.05)' : 'var(--bg2)',
                border: `1.5px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 'var(--radius)',
                padding: '14px',
                opacity: share.is_active ? 1 : 0.55,
                transition: 'all 0.15s',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  {/* Checkbox */}
                  <div
                    onClick={() => toggleSelect(share.id)}
                    style={{
                      width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 3, cursor: 'pointer',
                      background: isSelected ? 'var(--accent)' : 'var(--bg3)',
                      border: isSelected ? '2px solid var(--accent)' : '2px solid var(--border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
                    }}
                  >
                    {isSelected && <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><polyline points="2 6 5 9 10 3" stroke="#1a1200" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Title + badges */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, fontSize: '0.9rem', letterSpacing: '-0.01em' }}>{share.name}</span>
                      {!share.is_active && <span className="badge badge-yellow">Disabled</span>}
                      {share.isExpired && share.is_active && <span className="badge badge-red">Expired</span>}
                      {share.is_active && !share.isExpired && <span className="badge badge-green">Active</span>}
                      <span className="badge badge-purple">{share.share_type}</span>
                      {share.slug && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 7px', borderRadius: 99, fontSize: '0.68rem', fontWeight: 700, background: 'rgba(96,165,250,0.1)', color: 'var(--blue)', fontFamily: 'monospace' }}>/s/{share.slug}</span>
                      )}
                    </div>

                    {share.description && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>{share.description}</div>
                    )}

                    {/* Meta */}
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: 10, fontWeight: 600 }}>
                      <span>👁 {share.view_count}</span>
                      {share.expires_at && <span>⏱ {new Date(share.expires_at).toLocaleDateString()}</span>}
                      <span>📅 {new Date(share.created_at).toLocaleDateString()}</span>
                      <span>{share.allow_download ? '⬇ On' : '⬇ Off'}</span>
                    </div>

                    {/* URL */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <div style={{
                        background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)',
                        padding: '4px 10px', fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--accent)', fontWeight: 600,
                        maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 0', minWidth: 0,
                      }}>
                        {share.shareUrl}
                      </div>
                      <CopyButton text={share.shareUrl} />
                      <a href={share.shareUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                      </a>
                    </div>
                  </div>

                  {/* Desktop action buttons */}
                  <div className="shares-actions-bar">
                    <button className="btn btn-secondary btn-sm" onClick={() => setQrShare(share)} title="QR code">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="5" height="5"/><rect x="16" y="3" width="5" height="5"/><rect x="3" y="16" width="5" height="5"/><rect x="4" y="4" width="3" height="3" fill="currentColor" stroke="none"/><rect x="17" y="4" width="3" height="3" fill="currentColor" stroke="none"/><rect x="4" y="17" width="3" height="3" fill="currentColor" stroke="none"/></svg>
                      QR
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setStatsShare(share)}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                      Stats
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setLogsShare(share)}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/></svg>
                      Logs
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => toggleActive(share)}>
                      {share.is_active
                        ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                        : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                      }
                      {share.is_active ? 'Disable' : 'Enable'}
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setEditShare(share); setShowModal(true) }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      Edit
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(share)}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      Delete
                    </button>
                  </div>

                  {/* Mobile "..." menu button */}
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <button
                      className="share-menu-btn btn btn-secondary btn-sm"
                      onClick={e => { e.stopPropagation(); setOpenMenu(menuOpen ? null : share.id) }}
                      style={{ padding: '5px 9px' }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="19" r="1" fill="currentColor"/>
                      </svg>
                    </button>
                    {menuOpen && (
                      <div className="share-action-menu" onClick={e => e.stopPropagation()}>
                        <button onClick={() => { setQrShare(share); setOpenMenu(null) }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="5" height="5"/><rect x="16" y="3" width="5" height="5"/><rect x="3" y="16" width="5" height="5"/></svg>
                          QR Code
                        </button>
                        <button onClick={() => { setStatsShare(share); setOpenMenu(null) }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                          Stats
                        </button>
                        <button onClick={() => { setLogsShare(share); setOpenMenu(null) }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>
                          Logs
                        </button>
                        <button onClick={() => { toggleActive(share); setOpenMenu(null) }}>
                          {share.is_active ? 'Disable Share' : 'Enable Share'}
                        </button>
                        <button onClick={() => { setEditShare(share); setShowModal(true); setOpenMenu(null) }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          Edit
                        </button>
                        <button className="danger" onClick={() => { setConfirmDelete(share); setOpenMenu(null) }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modals */}
      {showModal && <ShareModal editShare={editShare} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load() }} />}
      {logsShare && <LogsModal share={logsShare} onClose={() => setLogsShare(null)} />}
      {qrShare && <QRModal share={qrShare} onClose={() => setQrShare(null)} />}
      {statsShare && <StatsModal share={statsShare} onClose={() => setStatsShare(null)} />}

      {confirmDelete && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmDelete(null)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h2>Delete Share?</h2>
              <button className="close-btn" onClick={() => setConfirmDelete(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 20, color: 'var(--text-muted)', lineHeight: 1.7 }}>
                Are you sure you want to delete <strong style={{ color: 'var(--text)' }}>{confirmDelete.name}</strong>? This cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
                <button className="btn btn-danger" onClick={() => deleteShare(confirmDelete.id)}>Delete Share</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}