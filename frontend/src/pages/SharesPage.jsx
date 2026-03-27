import React, { useEffect, useState, useCallback } from 'react'
import { useApi } from '../hooks/useAuth.jsx'

function CopyButton({ text }) {
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
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          Copy
        </>
      )}
    </button>
  )
}

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
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
              No access logs yet
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Time</th><th>Action</th><th>IP Address</th><th>User Agent</th>
                  </tr>
                </thead>
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
                      <td style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {log.ip_address || '—'}
                      </td>
                      <td style={{
                        color: 'var(--text-dim)', maxWidth: 240,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {log.user_agent || '—'}
                      </td>
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
          body: {
            name: form.name, description: form.description,
            password: form.password || undefined,
            expires_at: form.expires_at || null,
            allow_download: form.allow_download,
            allow_upload: form.allow_upload,
            show_metadata: form.show_metadata,
            slug: form.slug,
          },
        })
      } else {
        if (!form.password) throw new Error('Password is required')
        await api('/shares', {
          method: 'POST',
          body: {
            name: form.name, description: form.description,
            share_type: form.share_type,
            immich_album_id: form.share_type === 'album' ? form.immich_album_id : undefined,
            immich_tag_id: form.share_type === 'tag' ? form.immich_tag_id : undefined,
            password: form.password,
            expires_at: form.expires_at || undefined,
            allow_download: form.allow_download,
            allow_upload: form.allow_upload,
            show_metadata: form.show_metadata,
            slug: form.slug || undefined,
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

  const CheckBox = ({ checked, onChange, label }) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500, userSelect: 'none' }}>
      <div style={{
        width: 18, height: 18, borderRadius: 5,
        background: checked ? 'var(--accent)' : 'var(--bg3)',
        border: checked ? '2px solid var(--accent)' : '2px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s',
        flexShrink: 0,
      }}>
        {checked && (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <polyline points="2 6 5 9 10 3" stroke="#1a1200" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
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
              <label>
                Custom URL Slug
                <span style={{ marginLeft: 8, padding: '1px 7px', borderRadius: 4, fontSize: '0.68rem', background: 'var(--accent-dim)', color: 'var(--accent)', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  optional
                </span>
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', fontSize: '0.85rem', pointerEvents: 'none', userSelect: 'none', fontWeight: 600 }}>
                  /s/
                </span>
                <input
                  value={form.slug}
                  onChange={e => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="my-summer-trip"
                  style={{ paddingLeft: 36 }}
                  minLength={3} maxLength={60}
                />
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
                      {albums.map(a => (
                        <option key={a.id} value={a.id}>{a.albumName} ({a.assetCount} assets)</option>
                      ))}
                    </select>
                    {albums.length === 0 && !sourceLoading && (
                      <span className="hint">No albums found — check your Immich connection in Settings.</span>
                    )}
                  </div>
                )}
                {form.share_type === 'tag' && (
                  <div className="form-group">
                    <label>Tag {sourceLoading && <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(loading…)</span>}</label>
                    <select value={form.immich_tag_id} onChange={e => set('immich_tag_id', e.target.value)} required>
                      <option value="">Select a tag…</option>
                      {tags.map(tag => (
                        <option key={tag.id} value={tag.id}>{tag.value ?? tag.name ?? tag.id}</option>
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
              <input type="datetime-local" value={form.expires_at} onChange={e => set('expires_at', e.target.value)} />
            </div>

            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 22, padding: '14px 16px', background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
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

export default function SharesPage() {
  const api = useApi()
  const [shares, setShares] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editShare, setEditShare] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [logsShare, setLogsShare] = useState(null)

  const load = useCallback(async () => {
    try { setShares(await api('/shares')) }
    catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [api])

  useEffect(() => { load() }, [load])

  async function deleteShare(id) {
    try { await api(`/shares/${id}`, { method: 'DELETE' }); setConfirmDelete(null); load() }
    catch (e) { alert(e.message) }
  }

  async function toggleActive(share) {
    try { await api(`/shares/${share.id}`, { method: 'PATCH', body: { is_active: !share.is_active } }); load() }
    catch (e) { alert(e.message) }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Shares</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: 4, fontWeight: 500 }}>
            Manage password-protected share links
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditShare(null); setShowModal(true) }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New Share
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '80px 0', gap: 12, color: 'var(--text-dim)' }}>
          <span className="loading-spinner" style={{ width: 26, height: 26 }} />
        </div>
      ) : shares.length === 0 ? (
        <div style={{
          background: 'var(--bg2)', border: '1.5px dashed var(--border)',
          borderRadius: 'var(--radius)', textAlign: 'center', padding: '70px 20px',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: 14 }}>🔗</div>
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: '1rem' }}>No shares yet</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: 22, maxWidth: 360, margin: '0 auto 22px' }}>
            Create a share link to give anyone access to your Immich albums or photos.
          </div>
          <button className="btn btn-primary" onClick={() => { setEditShare(null); setShowModal(true) }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Create Share
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shares.map(share => (
            <div key={share.id} style={{
              background: 'var(--bg2)',
              border: '1.5px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '16px 20px',
              opacity: share.is_active ? 1 : 0.5,
              transition: 'opacity 0.2s, border-color 0.15s',
            }}
              onMouseEnter={e => share.is_active && (e.currentTarget.style.borderColor = 'var(--border-light)')}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Title row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, fontSize: '0.95rem', letterSpacing: '-0.01em' }}>
                      {share.name}
                    </span>
                    {!share.is_active && <span className="badge badge-yellow">Disabled</span>}
                    {share.isExpired && share.is_active && <span className="badge badge-red">Expired</span>}
                    {share.is_active && !share.isExpired && <span className="badge badge-green">Active</span>}
                    <span className="badge badge-purple">{share.share_type}</span>
                    {share.slug && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center',
                        padding: '2px 8px', borderRadius: 99,
                        fontSize: '0.7rem', fontWeight: 700,
                        background: 'rgba(96,165,250,0.1)', color: 'var(--blue)',
                        fontFamily: 'monospace', letterSpacing: '0.02em',
                      }}>
                        /s/{share.slug}
                      </span>
                    )}
                    {share.allow_upload === 1 && <span className="badge badge-purple">uploads on</span>}
                  </div>

                  {share.description && (
                    <div style={{ fontSize: '0.83rem', color: 'var(--text-muted)', marginBottom: 8, fontWeight: 500 }}>
                      {share.description}
                    </div>
                  )}

                  {/* Meta strip */}
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: 10, fontWeight: 600 }}>
                    <span>👁 {share.view_count} views</span>
                    {share.expires_at && (
                      <span>⏱ Expires {new Date(share.expires_at).toLocaleDateString()}</span>
                    )}
                    <span>📅 Created {new Date(share.created_at).toLocaleDateString()}</span>
                    {share.allow_download ? <span>⬇ Downloads on</span> : <span style={{ color: 'var(--text-dim)' }}>⬇ Downloads off</span>}
                  </div>

                  {/* Share URL */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{
                      background: 'var(--bg3)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-xs)',
                      padding: '5px 12px',
                      fontFamily: 'monospace',
                      fontSize: '0.78rem',
                      color: 'var(--accent)',
                      fontWeight: 600,
                      maxWidth: 400,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {share.shareUrl}
                    </div>
                    <CopyButton text={share.shareUrl} />
                    <a
                      href={share.shareUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary btn-sm"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                        <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                      </svg>
                      Open
                    </a>
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setLogsShare(share)} title="View logs">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                      <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                    </svg>
                    Logs
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => toggleActive(share)}
                    title={share.is_active ? 'Disable share' : 'Enable share'}
                  >
                    {share.is_active ? (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
                      </svg>
                    ) : (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                      </svg>
                    )}
                    {share.is_active ? 'Disable' : 'Enable'}
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => { setEditShare(share); setShowModal(true) }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    Edit
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(share)}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                    Delete
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

      {logsShare && <LogsModal share={logsShare} onClose={() => setLogsShare(null)} />}

      {confirmDelete && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmDelete(null)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h2>Delete Share?</h2>
              <button className="close-btn" onClick={() => setConfirmDelete(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 20, color: 'var(--text-muted)', lineHeight: 1.7 }}>
                Are you sure you want to delete{' '}
                <strong style={{ color: 'var(--text)' }}>{confirmDelete.name}</strong>?
                This cannot be undone and the share link will stop working immediately.
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
                <button className="btn btn-danger" onClick={() => deleteShare(confirmDelete.id)}>
                  Delete Share
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}