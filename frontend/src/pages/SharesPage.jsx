import React, { useEffect, useState, useCallback } from 'react'
import { useApi } from '../hooks/useAuth.jsx'

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }
  return (
    <button onClick={copy} className="btn btn-secondary btn-sm" title="Copy link">
      {copied ? '✓ Copied' : '⎘ Copy'}
    </button>
  )
}

// ── Access Logs Modal ─────────────────────────────────────────────────────────
function LogsModal({ share, onClose }) {
  const api = useApi()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api(`/shares/${share.id}/logs`)
      .then(setLogs)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [share.id])

  const actionColors = {
    view: 'var(--accent)',
    upload: 'var(--green)',
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 680 }}>
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
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
              No access logs yet
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Time', 'Action', 'IP Address', 'User Agent'].map(h => (
                      <th key={h} style={{
                        padding: '8px 12px', textAlign: 'left',
                        color: 'var(--text-dim)', fontWeight: 500, whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {new Date(log.accessed_at).toLocaleString(undefined, {
                          dateStyle: 'short', timeStyle: 'short'
                        })}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '2px 8px', borderRadius: 99, fontSize: '0.75rem',
                          background: `${actionColors[log.action] || 'var(--text-dim)'}18`,
                          color: actionColors[log.action] || 'var(--text-dim)',
                          fontWeight: 500,
                        }}>
                          {log.action === 'view' ? '👁' : log.action === 'upload' ? '📤' : '·'} {log.action}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontFamily: 'var(--mono, monospace)', fontSize: '0.78rem' }}>
                        {log.ip_address || '—'}
                      </td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-dim)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {log.user_agent || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 12, fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                Showing last {logs.length} entries
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Share Create/Edit Modal ───────────────────────────────────────────────────
function ShareModal({ onClose, onSaved, editShare }) {
  const api = useApi()
  const [albums, setAlbums] = useState([])
  const [tags, setTags] = useState([])
  const [sourceLoading, setSourceLoading] = useState(false)
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
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSourceLoading(true)
    Promise.all([
      api('/admin/immich/albums').catch(() => []),
      api('/admin/immich/tags').catch(() => []),
    ]).then(([a, t]) => {
      setAlbums(Array.isArray(a) ? a : [])
      setTags(Array.isArray(t) ? t : [])
    }).finally(() => setSourceLoading(false))
  }, [])

  function set(key, val) {
    setForm(f => ({ ...f, [key]: val }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      if (editShare) {
        await api(`/shares/${editShare.id}`, {
          method: 'PATCH',
          body: {
            name: form.name,
            description: form.description,
            password: form.password || undefined,
            expires_at: form.expires_at || null,
            allow_download: form.allow_download,
            allow_upload: form.allow_upload,
            show_metadata: form.show_metadata,
          },
        })
      } else {
        if (!form.password) throw new Error('Password is required')
        await api('/shares', {
          method: 'POST',
          body: {
            name: form.name,
            description: form.description,
            share_type: form.share_type,
            immich_album_id: form.share_type === 'album' ? form.immich_album_id : undefined,
            immich_tag_id: form.share_type === 'tag' ? form.immich_tag_id : undefined,
            password: form.password,
            expires_at: form.expires_at || undefined,
            allow_download: form.allow_download,
            allow_upload: form.allow_upload,
            show_metadata: form.show_metadata,
          },
        })
      }
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>{editShare ? 'Edit Share' : 'Create Share'}</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {error && <div className="error-msg">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Share Name *</label>
              <input
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="Summer 2024 Photos"
                required
              />
            </div>

            <div className="form-group">
              <label>Description</label>
              <input
                value={form.description}
                onChange={e => set('description', e.target.value)}
                placeholder="Optional description shown to viewers"
              />
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
                    <label>
                      Album{' '}
                      {sourceLoading && <span style={{ color: 'var(--text-dim)' }}>(loading…)</span>}
                    </label>
                    <select
                      value={form.immich_album_id}
                      onChange={e => set('immich_album_id', e.target.value)}
                      required
                    >
                      <option value="">Select an album…</option>
                      {albums.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.albumName} ({a.assetCount} assets)
                        </option>
                      ))}
                    </select>
                    {albums.length === 0 && !sourceLoading && (
                      <span className="hint">No albums found — check your Immich connection in Settings.</span>
                    )}
                  </div>
                )}

                {form.share_type === 'tag' && (
                  <div className="form-group">
                    <label>
                      Tag{' '}
                      {sourceLoading && <span style={{ color: 'var(--text-dim)' }}>(loading…)</span>}
                    </label>
                    <select
                      value={form.immich_tag_id}
                      onChange={e => set('immich_tag_id', e.target.value)}
                      required
                    >
                      <option value="">Select a tag…</option>
                      {tags.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.value ?? t.name ?? t.id}
                        </option>
                      ))}
                    </select>
                    {tags.length === 0 && !sourceLoading && (
                      <span className="hint">No tags found — check your Immich connection in Settings.</span>
                    )}
                  </div>
                )}
              </>
            )}

            <div className="form-group">
              <label>{editShare ? 'New Password' : 'Password *'}</label>
              <input
                type="password"
                value={form.password}
                onChange={e => set('password', e.target.value)}
                placeholder={editShare ? 'Leave blank to keep current' : 'Set a share password'}
                required={!editShare}
                minLength={4}
              />
              <span className="hint">Viewers need this to access the share.</span>
            </div>

            <div className="form-group">
              <label>Expiry Date (optional)</label>
              <input
                type="datetime-local"
                value={form.expires_at}
                onChange={e => set('expires_at', e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 20 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.875rem' }}>
                <input
                  type="checkbox"
                  checked={form.allow_download}
                  onChange={e => set('allow_download', e.target.checked)}
                  style={{ width: 'auto' }}
                />
                Allow downloads
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.875rem' }}>
                <input
                  type="checkbox"
                  checked={form.allow_upload}
                  onChange={e => set('allow_upload', e.target.checked)}
                  style={{ width: 'auto' }}
                />
                Allow uploads
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.875rem' }}>
                <input
                  type="checkbox"
                  checked={form.show_metadata}
                  onChange={e => set('show_metadata', e.target.checked)}
                  style={{ width: 'auto' }}
                />
                Show metadata
              </label>
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

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SharesPage() {
  const api = useApi()
  const [shares, setShares] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editShare, setEditShare] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [logsShare, setLogsShare] = useState(null)

  const load = useCallback(async () => {
    try {
      const data = await api('/shares')
      setShares(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { load() }, [load])

  async function deleteShare(id) {
    try {
      await api(`/shares/${id}`, { method: 'DELETE' })
      setConfirmDelete(null)
      load()
    } catch (e) {
      alert(e.message)
    }
  }

  async function toggleActive(share) {
    try {
      await api(`/shares/${share.id}`, {
        method: 'PATCH',
        body: { is_active: !share.is_active },
      })
      load()
    } catch (e) {
      alert(e.message)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Shares</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: 4 }}>
            Manage password-protected share links
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => { setEditShare(null); setShowModal(true) }}
        >
          ＋ New Share
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <span className="loading-spinner" style={{ width: 28, height: 28 }} />
        </div>
      ) : shares.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>⬡</div>
          <div style={{ fontWeight: 500, marginBottom: 8 }}>No shares yet</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: 20 }}>
            Create your first share to give people access to your Immich photos.
          </div>
          <button
            className="btn btn-primary"
            onClick={() => { setEditShare(null); setShowModal(true) }}
          >
            ＋ Create Share
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {shares.map(share => (
            <div key={share.id} className="card" style={{
              opacity: share.is_active ? 1 : 0.55,
              transition: 'opacity 0.2s',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{share.name}</span>
                    {!share.is_active && <span className="badge badge-yellow">Disabled</span>}
                    {share.isExpired && share.is_active && <span className="badge badge-red">Expired</span>}
                    {share.is_active && !share.isExpired && <span className="badge badge-green">Active</span>}
                    <span className="badge badge-purple">{share.share_type}</span>
                    {share.allow_upload === 1 && <span className="badge badge-purple">📤 uploads</span>}
                  </div>
                  {share.description && (
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                      {share.description}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                    <span>👁 {share.view_count} views</span>
                    {share.expires_at && (
                      <span>⏱ Expires {new Date(share.expires_at).toLocaleDateString()}</span>
                    )}
                    <span>📅 {new Date(share.created_at).toLocaleDateString()}</span>
                    {share.allow_download && <span>⬇ Downloads on</span>}
                  </div>
                  <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <code style={{
                      fontSize: '0.78rem',
                      background: 'var(--bg3)',
                      padding: '4px 10px',
                      borderRadius: 5,
                      color: 'var(--accent)',
                      border: '1px solid var(--border)',
                      maxWidth: '100%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {share.shareUrl}
                    </code>
                    <CopyButton text={share.shareUrl} />
                    <a
                      href={share.shareUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary btn-sm"
                    >
                      ↗ Open
                    </a>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setLogsShare(share)}
                    title="View access logs"
                  >
                    📋 Logs
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => toggleActive(share)}
                    title={share.is_active ? 'Disable share' : 'Enable share'}
                  >
                    {share.is_active ? '⏸' : '▶'}
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => { setEditShare(share); setShowModal(true) }}
                  >
                    ✎ Edit
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => setConfirmDelete(share)}
                  >
                    🗑
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <ShareModal
          editShare={editShare}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load() }}
        />
      )}

      {logsShare && (
        <LogsModal share={logsShare} onClose={() => setLogsShare(null)} />
      )}

      {confirmDelete && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmDelete(null)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h2>Delete Share?</h2>
              <button className="close-btn" onClick={() => setConfirmDelete(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 20, color: 'var(--text-muted)' }}>
                Are you sure you want to delete <strong style={{ color: 'var(--text)' }}>{confirmDelete.name}</strong>?
                This cannot be undone and the share link will stop working immediately.
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
                <button className="btn btn-danger" onClick={() => deleteShare(confirmDelete.id)}>Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}