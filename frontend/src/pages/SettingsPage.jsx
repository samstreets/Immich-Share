import React, { useEffect, useState, useCallback } from 'react'
import { useApi, useAuth } from '../hooks/useAuth.jsx'

// ── Shared UI primitives ──────────────────────────────────────────────────────

function SectionCard({ title, subtitle, icon, children, style, accent }) {
  return (
    <div style={{
      background: 'var(--bg2)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
      transition: 'border-color 0.2s',
      ...style,
    }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-light)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      <div style={{
        padding: '13px 16px',
        display: 'flex', alignItems: 'center', gap: 11,
        borderBottom: '1px solid var(--border)',
        background: 'rgba(255,255,255,0.015)',
      }}>
        {icon && (
          <div style={{
            width: 30, height: 30, borderRadius: 7, flexShrink: 0,
            background: accent ? `${accent}18` : 'var(--bg3)',
            border: accent ? `1px solid ${accent}30` : '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: accent || 'var(--text-muted)',
          }}>
            {icon}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: accent || 'var(--text)', letterSpacing: '-0.01em' }}>
            {title}
          </div>
          {subtitle && <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: 1, fontWeight: 500 }}>{subtitle}</div>}
        </div>
      </div>
      <div style={{ padding: '16px' }}>{children}</div>
    </div>
  )
}

function StatusPill({ ok, label }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 700,
      background: ok ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)',
      color: ok ? 'var(--green)' : 'var(--red)',
      border: `1px solid ${ok ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}`,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: ok ? 'var(--green)' : 'var(--red)' }} />
      {label}
    </span>
  )
}

function Msg({ msg }) {
  if (!msg) return null
  return <div className={msg.type === 'success' ? 'success-msg' : 'error-msg'} style={{ marginBottom: 12 }}>{msg.text}</div>
}

function UrlListEditor({ value, onChange }) {
  const urls = value ? value.split('\n').map(u => u.trim()).filter(Boolean) : []
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')

  function validate(raw) {
    const u = raw.trim()
    if (!u) return null
    if (u === '*') return u
    try {
      const parsed = new URL(u)
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error()
      return parsed.origin
    } catch { return null }
  }

  function add() {
    const cleaned = validate(draft)
    if (!cleaned) { setError('Enter a valid URL or * to allow all.'); return }
    if (urls.includes(cleaned)) { setError('Already in list.'); return }
    setError(''); setDraft('')
    onChange([...urls, cleaned].join('\n'))
  }

  function remove(idx) { onChange(urls.filter((_, i) => i !== idx).join('\n')) }

  return (
    <div>
      {urls.length > 0 && (
        <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {urls.map((u, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '5px 10px' }}>
              <span style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.75rem', color: u === '*' ? 'var(--yellow)' : 'var(--accent)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {u === '*' ? '* — all origins' : u}
              </span>
              <button type="button" onClick={() => remove(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: '0.9rem', padding: '0 2px', flexShrink: 0 }}>✕</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 7 }}>
        <input type="text" value={draft} onChange={e => { setDraft(e.target.value); setError('') }} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())} placeholder="https://share.yourdomain.com  or  *" style={{ flex: 1 }} />
        <button type="button" className="btn btn-secondary btn-sm" onClick={add} style={{ flexShrink: 0 }}>Add</button>
      </div>
      {error && <div style={{ fontSize: '0.72rem', color: 'var(--red)', marginTop: 4 }}>{error}</div>}
    </div>
  )
}

// ── TOTP setup panel ──────────────────────────────────────────────────────────
// Uses raw fetch (not useApi) so a 401 shows an error message instead of
// silently logging the user out mid-flow.
function TotpPanel() {
  const { token } = useAuth()
  const [status, setStatus] = useState(null)
  const [enrollData, setEnrollData] = useState(null)
  const [confirmCode, setConfirmCode] = useState('')
  const [disablePassword, setDisablePassword] = useState('')
  const [msg, setMsg] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showDisable, setShowDisable] = useState(false)

  // Raw fetch that never triggers global logout
  async function totpFetch(path, options = {}) {
    const res = await fetch(`/api${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
    return data
  }

  const loadStatus = useCallback(async () => {
    try {
      const d = await totpFetch('/auth/totp-status')
      setStatus(d)
    } catch (err) {
      setMsg({ type: 'error', text: `Could not load 2FA status: ${err.message}` })
    }
  }, [token])

  useEffect(() => { loadStatus() }, [loadStatus])

  async function startEnroll() {
    setLoading(true); setMsg(null); setEnrollData(null)
    try {
      const d = await totpFetch('/auth/totp-enroll', { method: 'POST' })
      setEnrollData(d)
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    } finally { setLoading(false) }
  }

  async function confirmEnroll(e) {
    e.preventDefault()
    setLoading(true); setMsg(null)
    try {
      await totpFetch('/auth/totp-confirm', { method: 'POST', body: { code: confirmCode } })
      setMsg({ type: 'success', text: '✅ Two-factor authentication enabled! You will need your authenticator app on next login.' })
      setEnrollData(null); setConfirmCode('')
      loadStatus()
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    } finally { setLoading(false) }
  }

  async function disable(e) {
    e.preventDefault()
    setLoading(true); setMsg(null)
    try {
      await totpFetch('/auth/totp-disable', { method: 'POST', body: { password: disablePassword } })
      setMsg({ type: 'success', text: 'Two-factor authentication disabled.' })
      setShowDisable(false); setDisablePassword('')
      loadStatus()
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    } finally { setLoading(false) }
  }

  if (status === null && !msg) {
    return <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-dim)', fontSize: '0.82rem' }}><span className="loading-spinner" style={{ width: 14, height: 14 }} /> Loading…</div>
  }

  return (
    <div>
      <Msg msg={msg} />

      {status && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, padding: '10px 12px', background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
          <StatusPill ok={status.enabled} label={status.enabled ? '2FA Enabled' : '2FA Disabled'} />
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', flex: 1 }}>
            {status.enabled
              ? 'Your account is protected with TOTP authentication.'
              : 'Add an extra layer of security to your admin account.'}
          </span>
        </div>
      )}

      {/* Not enrolled */}
      {status && !status.enabled && !enrollData && (
        <button className="btn btn-primary btn-sm" onClick={startEnroll} disabled={loading}>
          {loading ? <span className="loading-spinner" style={{ width: 12, height: 12 }} /> : '🔐 Set up authenticator app'}
        </button>
      )}

      {/* QR code step */}
      {enrollData && (
        <div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.6 }}>
            Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.), then enter the 6-digit code below to confirm.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            <img src={enrollData.qrDataUrl} alt="TOTP QR code" style={{ width: 200, height: 200, borderRadius: 8, background: '#fff', padding: 8 }} />
          </div>
          <details style={{ marginBottom: 14 }}>
            <summary style={{ fontSize: '0.75rem', color: 'var(--text-dim)', cursor: 'pointer' }}>Manual entry key</summary>
            <code style={{ display: 'block', marginTop: 6, padding: '6px 10px', background: 'var(--bg3)', borderRadius: 6, fontSize: '0.78rem', letterSpacing: '0.08em', wordBreak: 'break-all', color: 'var(--accent)' }}>
              {enrollData.secret}
            </code>
          </details>
          <form onSubmit={confirmEnroll}>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>Confirmation Code</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9 ]*"
                maxLength={7}
                value={confirmCode}
                onChange={e => setConfirmCode(e.target.value.replace(/[^0-9 ]/g, ''))}
                placeholder="000 000"
                autoFocus
                required
                style={{ textAlign: 'center', fontSize: '1.2rem', letterSpacing: '0.2em', fontWeight: 700 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary btn-sm" disabled={loading || confirmCode.replace(/\s/g, '').length < 6}>
                {loading ? <span className="loading-spinner" style={{ width: 12, height: 12 }} /> : 'Confirm & Enable'}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEnrollData(null); setConfirmCode('') }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Disable */}
      {status && status.enabled && (
        <div>
          {!showDisable ? (
            <button className="btn btn-danger btn-sm" onClick={() => setShowDisable(true)}>
              Disable 2FA
            </button>
          ) : (
            <form onSubmit={disable}>
              <div className="form-group" style={{ marginBottom: 10 }}>
                <label>Current Password (required to disable 2FA)</label>
                <input type="password" value={disablePassword} onChange={e => setDisablePassword(e.target.value)} placeholder="Your admin password" required autoFocus />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-danger btn-sm" disabled={loading}>
                  {loading ? <span className="loading-spinner" style={{ width: 12, height: 12 }} /> : 'Confirm Disable'}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setShowDisable(false); setDisablePassword('') }}>Cancel</button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}

// ── Log export panel ──────────────────────────────────────────────────────────
function LogExportPanel() {
  const [format, setFormat] = useState('csv')
  const [days, setDays] = useState('0')
  const [action, setAction] = useState('')
  const [loading, setLoading] = useState(false)

  async function doExport() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ format })
      if (days !== '0') params.set('days', days)
      if (action) params.set('action', action)
      const token = localStorage.getItem('admin_token')
      const res = await fetch(`/api/admin/logs/export?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `access_logs.${format}`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      alert(err.message)
    } finally { setLoading(false) }
  }

  return (
    <div>
      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.6 }}>
        Download access log data as a CSV or JSON file for analysis in spreadsheet tools or SIEM systems.
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Format</label>
          <select value={format} onChange={e => setFormat(e.target.value)} style={{ width: 'auto', minWidth: 90 }}>
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Time Range</label>
          <select value={days} onChange={e => setDays(e.target.value)} style={{ width: 'auto', minWidth: 120 }}>
            <option value="0">All time</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Action</label>
          <select value={action} onChange={e => setAction(e.target.value)} style={{ width: 'auto', minWidth: 100 }}>
            <option value="">All</option>
            <option value="view">Views only</option>
            <option value="upload">Uploads only</option>
          </select>
        </div>
      </div>
      <button className="btn btn-primary btn-sm" onClick={doExport} disabled={loading}>
        {loading
          ? <><span className="loading-spinner" style={{ width: 12, height: 12 }} /> Exporting…</>
          : <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Export {format.toUpperCase()}</>
        }
      </button>
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const ConnIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
const GlobeIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
const LockIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
const KeyIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
const MailIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
const WebhookIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>
const CleanupIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
const ShieldIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
const ExportIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
const InfoIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
const EyeIcon = ({ visible }) => visible
  ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
  : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const api = useApi()
  const [loading, setLoading] = useState(true)

  // Immich
  const [immichUrl, setImmichUrl] = useState('')
  const [apiKeyMasked, setApiKeyMasked] = useState('')
  const [apiKeyRaw, setApiKeyRaw] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [testing, setTesting] = useState(false)
  const [immichMsg, setImmichMsg] = useState(null)
  const [immichSaving, setImmichSaving] = useState(false)

  // App
  const [externalUrl, setExternalUrl] = useState('')
  const [appName, setAppName] = useState('')
  const [appMsg, setAppMsg] = useState(null)
  const [appSaving, setAppSaving] = useState(false)

  // CORS
  const [allowedOrigins, setAllowedOrigins] = useState('')
  const [corsMsg, setCorsMsg] = useState(null)
  const [corsSaving, setCorsSaving] = useState(false)

  // Password
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [pwMsg, setPwMsg] = useState(null)
  const [pwSaving, setPwSaving] = useState(false)

  // SMTP
  const [smtp, setSmtp] = useState({ smtp_host: '', smtp_port: '587', smtp_user: '', smtp_pass: '', smtp_from: '', smtp_secure: '0' })
  const [smtpMsg, setSmtpMsg] = useState(null)
  const [smtpSaving, setSmtpSaving] = useState(false)
  const [testEmailTo, setTestEmailTo] = useState('')
  const [emailTesting, setEmailTesting] = useState(false)

  // Webhook
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [showWebhookSecret, setShowWebhookSecret] = useState(false)
  const [webhookMsg, setWebhookMsg] = useState(null)
  const [webhookSaving, setWebhookSaving] = useState(false)
  const [webhookTesting, setWebhookTesting] = useState(false)

  // Cleanup
  const [cleanupExpired, setCleanupExpired] = useState('0')
  const [chunkMaxAge, setChunkMaxAge] = useState('24')
  const [cleanupMsg, setCleanupMsg] = useState(null)
  const [cleanupSaving, setCleanupSaving] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const s = await api('/admin/settings')
        setImmichUrl(s.immich_url || '')
        setApiKeyMasked(s.immich_api_key || '')
        setExternalUrl(s.external_url || '')
        setAppName(s.app_name || '')
        setAllowedOrigins(s.allowed_origins || '')
        setSmtp({
          smtp_host: s.smtp_host || '',
          smtp_port: s.smtp_port || '587',
          smtp_user: s.smtp_user || '',
          smtp_pass: s.smtp_pass || '',
          smtp_from: s.smtp_from || '',
          smtp_secure: s.smtp_secure || '0',
        })
        setWebhookUrl(s.global_webhook_url || '')
        setWebhookSecret(s.global_webhook_secret || '')
        setCleanupExpired(s.cleanup_expired_shares || '0')
        setChunkMaxAge(s.cleanup_chunk_max_age_hours || '24')
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    load()
  }, [])

  async function saveImmich(e) {
    e?.preventDefault(); setImmichSaving(true); setImmichMsg(null); setTestResult(null)
    try {
      await api('/admin/settings', { method: 'PUT', body: { immich_url: immichUrl, immich_api_key: apiKeyRaw } })
      setImmichMsg({ type: 'success', text: 'Immich settings saved.' })
    } catch (err) { setImmichMsg({ type: 'error', text: err.message }) }
    finally { setImmichSaving(false) }
  }

  async function testConnection() {
    setTesting(true); setTestResult(null)
    try {
      await api('/admin/settings', { method: 'PUT', body: { immich_url: immichUrl, immich_api_key: apiKeyRaw } })
      setTestResult(await api('/admin/immich/test'))
    } catch (err) { setTestResult({ ok: false, error: err.message }) }
    finally { setTesting(false) }
  }

  async function saveApp(e) {
    e?.preventDefault(); setAppSaving(true); setAppMsg(null)
    try {
      await api('/admin/settings', { method: 'PUT', body: { external_url: externalUrl, app_name: appName } })
      setAppMsg({ type: 'success', text: 'App settings saved.' })
    } catch (err) { setAppMsg({ type: 'error', text: err.message }) }
    finally { setAppSaving(false) }
  }

  async function saveCors() {
    setCorsSaving(true); setCorsMsg(null)
    try {
      await api('/admin/settings', { method: 'PUT', body: { allowed_origins: allowedOrigins } })
      setCorsMsg({ type: 'success', text: 'CORS origins saved.' })
    } catch (err) { setCorsMsg({ type: 'error', text: err.message }) }
    finally { setCorsSaving(false) }
  }

  async function changePassword(e) {
    e.preventDefault(); setPwMsg(null)
    if (pwForm.newPassword !== pwForm.confirmPassword) { setPwMsg({ type: 'error', text: 'Passwords do not match.' }); return }
    if (pwForm.newPassword.length < 8) { setPwMsg({ type: 'error', text: 'Password must be at least 8 characters.' }); return }
    setPwSaving(true)
    try {
      await api('/auth/change-password', { method: 'POST', body: { currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword } })
      setPwMsg({ type: 'success', text: 'Password changed successfully.' })
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err) { setPwMsg({ type: 'error', text: err.message }) }
    finally { setPwSaving(false) }
  }

  async function saveSmtp() {
    setSmtpSaving(true); setSmtpMsg(null)
    try {
      await api('/admin/settings', { method: 'PUT', body: smtp })
      setSmtpMsg({ type: 'success', text: 'SMTP settings saved.' })
    } catch (err) { setSmtpMsg({ type: 'error', text: err.message }) }
    finally { setSmtpSaving(false) }
  }

  async function testEmail() {
    if (!testEmailTo) return
    setEmailTesting(true); setSmtpMsg(null)
    try {
      await api('/admin/settings', { method: 'PUT', body: smtp })
      const res = await api('/admin/notifications/test-email', { method: 'POST', body: { to: testEmailTo } })
      setSmtpMsg({ type: 'success', text: res.message })
    } catch (err) { setSmtpMsg({ type: 'error', text: err.message }) }
    finally { setEmailTesting(false) }
  }

  async function saveWebhook() {
    setWebhookSaving(true); setWebhookMsg(null)
    try {
      await api('/admin/settings', { method: 'PUT', body: { global_webhook_url: webhookUrl, global_webhook_secret: webhookSecret } })
      setWebhookMsg({ type: 'success', text: 'Webhook settings saved.' })
    } catch (err) { setWebhookMsg({ type: 'error', text: err.message }) }
    finally { setWebhookSaving(false) }
  }

  async function testWebhook() {
    if (!webhookUrl) return
    setWebhookTesting(true); setWebhookMsg(null)
    try {
      await api('/admin/settings', { method: 'PUT', body: { global_webhook_url: webhookUrl, global_webhook_secret: webhookSecret } })
      const res = await api('/admin/notifications/test-webhook', { method: 'POST', body: { url: webhookUrl, secret: webhookSecret } })
      setWebhookMsg({ type: 'success', text: res.message })
    } catch (err) { setWebhookMsg({ type: 'error', text: err.message }) }
    finally { setWebhookTesting(false) }
  }

  async function saveCleanup() {
    setCleanupSaving(true); setCleanupMsg(null)
    try {
      await api('/admin/settings', { method: 'PUT', body: { cleanup_expired_shares: cleanupExpired, cleanup_chunk_max_age_hours: chunkMaxAge } })
      setCleanupMsg({ type: 'success', text: 'Cleanup settings saved.' })
    } catch (err) { setCleanupMsg({ type: 'error', text: err.message }) }
    finally { setCleanupSaving(false) }
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '100px 0', gap: 12, color: 'var(--text-dim)' }}>
      <span className="loading-spinner" style={{ width: 22, height: 22 }} />
      <span style={{ fontSize: '0.82rem' }}>Loading settings…</span>
    </div>
  )

  return (
    <>
      <style>{`
        .settings-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
        }
        @media (min-width: 860px) {
          .settings-grid { grid-template-columns: 1fr 1fr; }
          .settings-col-full { grid-column: 1 / -1; }
        }
        .pw-fields-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        @media (max-width: 480px) {
          .pw-fields-row { grid-template-columns: 1fr; }
        }
      `}</style>

      <div>
        <div style={{ marginBottom: 18 }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.01em' }}>Settings</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 2, fontWeight: 500 }}>
            Configure your Immich connection, security, and notifications
          </p>
        </div>

        <div className="settings-grid">

          {/* Immich Connection */}
          <SectionCard icon={<ConnIcon />} title="Immich Connection" subtitle="Server URL and API key" accent="var(--blue)">
            <Msg msg={immichMsg} />
            {testResult && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: testResult.ok ? 'rgba(74,222,128,0.05)' : 'rgba(248,113,113,0.05)', border: `1px solid ${testResult.ok ? 'rgba(74,222,128,0.18)' : 'rgba(248,113,113,0.18)'}`, marginBottom: 12, flexWrap: 'wrap' }}>
                <StatusPill ok={testResult.ok} label={testResult.ok ? 'Connected' : 'Failed'} />
                <span style={{ fontSize: '0.76rem', color: testResult.ok ? 'var(--green)' : 'var(--red)', fontWeight: 500 }}>
                  {testResult.ok ? 'Successfully connected to Immich.' : testResult.error}
                </span>
              </div>
            )}
            <form onSubmit={saveImmich}>
              <div className="form-group">
                <label>Server URL</label>
                <input type="url" value={immichUrl} onChange={e => setImmichUrl(e.target.value)} placeholder="http://192.168.1.100:2283" />
              </div>
              <div className="form-group">
                <label>API Key</label>
                <div style={{ display: 'flex', gap: 7 }}>
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKeyRaw}
                    onChange={e => setApiKeyRaw(e.target.value)}
                    placeholder={apiKeyMasked || 'Paste your Immich API key'}
                    style={{ flex: 1 }}
                  />
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowApiKey(v => !v)}><EyeIcon visible={showApiKey} /></button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="submit" className="btn btn-primary btn-sm" disabled={immichSaving}>
                  {immichSaving ? <span className="loading-spinner" /> : 'Save'}
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={testConnection} disabled={testing}>
                  {testing ? <><span className="loading-spinner" style={{ width: 11, height: 11 }} /> Testing…</> : 'Test Connection'}
                </button>
              </div>
            </form>
          </SectionCard>

          {/* App Settings */}
          <SectionCard icon={<GlobeIcon />} title="App Settings" subtitle="Public URL and branding" accent="var(--accent)">
            <Msg msg={appMsg} />
            <form onSubmit={saveApp}>
              <div className="form-group">
                <label>External / Public URL</label>
                <input type="url" value={externalUrl} onChange={e => setExternalUrl(e.target.value)} placeholder="https://share.yourdomain.com" />
                <span className="hint">Used to build share links and notification emails.</span>
              </div>
              <div className="form-group">
                <label>App Name</label>
                <input value={appName} onChange={e => setAppName(e.target.value)} placeholder="Immich Share" />
              </div>
              <button type="submit" className="btn btn-primary btn-sm" disabled={appSaving}>
                {appSaving ? <span className="loading-spinner" /> : 'Save'}
              </button>
            </form>
          </SectionCard>

          {/* SMTP / Email */}
          <SectionCard icon={<MailIcon />} title="Email Notifications" subtitle="SMTP settings for upload alerts" accent="var(--green)">
            <Msg msg={smtpMsg} />
            <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.6 }}>
              Configure SMTP to receive an email when someone uploads to a share. Set per-share recipient addresses on each share's Edit screen.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginBottom: 8 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>SMTP Host</label>
                <input value={smtp.smtp_host} onChange={e => setSmtp(s => ({ ...s, smtp_host: e.target.value }))} placeholder="smtp.gmail.com" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Port</label>
                <input type="number" value={smtp.smtp_port} onChange={e => setSmtp(s => ({ ...s, smtp_port: e.target.value }))} style={{ width: 80 }} />
              </div>
            </div>
            <div className="form-group">
              <label>Username</label>
              <input value={smtp.smtp_user} onChange={e => setSmtp(s => ({ ...s, smtp_user: e.target.value }))} placeholder="you@gmail.com" autoComplete="off" />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input type="password" value={smtp.smtp_pass} onChange={e => setSmtp(s => ({ ...s, smtp_pass: e.target.value }))} placeholder={smtp.smtp_pass === '••••••••' ? '(saved)' : 'App password'} autoComplete="off" />
            </div>
            <div className="form-group">
              <label>From address</label>
              <input value={smtp.smtp_from} onChange={e => setSmtp(s => ({ ...s, smtp_from: e.target.value }))} placeholder="Immich Share <noreply@yourdomain.com>" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: '0.82rem', userSelect: 'none' }}>
                <div
                  onClick={() => setSmtp(s => ({ ...s, smtp_secure: s.smtp_secure === '1' ? '0' : '1' }))}
                  style={{ width: 32, height: 18, borderRadius: 999, background: smtp.smtp_secure === '1' ? 'var(--accent)' : 'var(--bg4)', border: smtp.smtp_secure === '1' ? '1px solid var(--accent)' : '1px solid var(--border)', position: 'relative', cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0 }}
                >
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: smtp.smtp_secure === '1' ? 16 : 2, transition: 'left 0.15s' }} />
                </div>
                TLS/SSL (port 465)
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={saveSmtp} disabled={smtpSaving}>
                {smtpSaving ? <span className="loading-spinner" /> : 'Save SMTP'}
              </button>
              <input value={testEmailTo} onChange={e => setTestEmailTo(e.target.value)} placeholder="Test recipient email" style={{ flex: '1 1 160px', minWidth: 0 }} />
              <button type="button" className="btn btn-secondary btn-sm" onClick={testEmail} disabled={emailTesting || !testEmailTo}>
                {emailTesting ? <span className="loading-spinner" style={{ width: 12, height: 12 }} /> : 'Send Test'}
              </button>
            </div>
          </SectionCard>

          {/* Webhook */}
          <SectionCard icon={<WebhookIcon />} title="Global Webhook" subtitle="POST to a URL on every upload" accent="var(--blue)">
            <Msg msg={webhookMsg} />
            <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.6 }}>
              Fired for every upload across all shares. You can also set per-share webhooks in the share Edit screen. Payload is signed with HMAC-SHA256 if a secret is set.
            </p>
            <div className="form-group">
              <label>Webhook URL</label>
              <input value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} placeholder="https://hooks.yourservice.com/upload" />
            </div>
            <div className="form-group">
              <label>Signing Secret (optional)</label>
              <div style={{ display: 'flex', gap: 7 }}>
                <input type={showWebhookSecret ? 'text' : 'password'} value={webhookSecret} onChange={e => setWebhookSecret(e.target.value)} placeholder="random secret for X-ImmichShare-Signature" style={{ flex: 1 }} />
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowWebhookSecret(v => !v)}><EyeIcon visible={showWebhookSecret} /></button>
              </div>
              <span className="hint">Verify the <code>X-ImmichShare-Signature: sha256=…</code> header in your endpoint.</span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={saveWebhook} disabled={webhookSaving}>
                {webhookSaving ? <span className="loading-spinner" /> : 'Save'}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={testWebhook} disabled={webhookTesting || !webhookUrl}>
                {webhookTesting ? <span className="loading-spinner" style={{ width: 12, height: 12 }} /> : 'Send Test'}
              </button>
            </div>
          </SectionCard>

          {/* Cleanup */}
          <SectionCard icon={<CleanupIcon />} title="Scheduled Cleanup" subtitle="Auto-purge expired shares and orphaned chunks" accent="var(--yellow)">
            <Msg msg={cleanupMsg} />
            <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.6 }}>
              The cleanup job runs every 30 minutes. It always disables shares that have reached their max view limit. Optionally it can also delete expired shares and clean up leftover upload chunks.
            </p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500, userSelect: 'none', marginBottom: 14 }}>
              <div
                onClick={() => setCleanupExpired(v => v === '1' ? '0' : '1')}
                style={{ width: 32, height: 18, borderRadius: 999, background: cleanupExpired === '1' ? 'var(--accent)' : 'var(--bg4, var(--bg3))', border: cleanupExpired === '1' ? '1px solid var(--accent)' : '1px solid var(--border)', position: 'relative', cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0 }}
              >
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: cleanupExpired === '1' ? 16 : 2, transition: 'left 0.15s' }} />
              </div>
              Auto-delete expired shares
            </label>
            <div className="form-group">
              <label>Orphaned Chunk Max Age (hours)</label>
              <input type="number" min="1" max="720" value={chunkMaxAge} onChange={e => setChunkMaxAge(e.target.value)} style={{ width: 100 }} />
              <span className="hint">Upload chunks older than this are deleted. Default: 24h.</span>
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={saveCleanup} disabled={cleanupSaving}>
              {cleanupSaving ? <span className="loading-spinner" /> : 'Save'}
            </button>
          </SectionCard>

          {/* 2FA */}
          <SectionCard icon={<ShieldIcon />} title="Two-Factor Authentication" subtitle="TOTP authenticator app for admin login" accent="var(--green)">
            <TotpPanel />
          </SectionCard>

          {/* Log Export */}
          <SectionCard icon={<ExportIcon />} title="Export Access Logs" subtitle="Download CSV or JSON for analysis" accent="var(--accent)">
            <LogExportPanel />
          </SectionCard>

          {/* CORS */}
          <SectionCard icon={<LockIcon />} title="Allowed Origins" subtitle="CORS — restrict cross-origin API access" accent="var(--yellow)">
            <Msg msg={corsMsg} />
            <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.6 }}>
              Leave empty to allow all. Use <code style={{ color: 'var(--yellow)', background: 'var(--bg3)', padding: '1px 5px', borderRadius: 3 }}>*</code> to explicitly allow all origins.
            </p>
            <UrlListEditor value={allowedOrigins} onChange={setAllowedOrigins} />
            <div style={{ marginTop: 12 }}>
              <button type="button" className="btn btn-primary btn-sm" disabled={corsSaving} onClick={saveCors}>
                {corsSaving ? <span className="loading-spinner" /> : 'Save Origins'}
              </button>
            </div>
          </SectionCard>

          {/* Admin Password */}
          <SectionCard icon={<KeyIcon />} title="Admin Password" subtitle="Update your login credentials" accent="var(--red)">
            <Msg msg={pwMsg} />
            <form onSubmit={changePassword}>
              <div className="form-group">
                <label>Current Password</label>
                <input type="password" value={pwForm.currentPassword} onChange={e => setPwForm(f => ({ ...f, currentPassword: e.target.value }))} placeholder="Current password" required />
              </div>
              <div className="pw-fields-row">
                <div className="form-group">
                  <label>New Password</label>
                  <input type="password" value={pwForm.newPassword} onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))} placeholder="Min 8 chars" required minLength={8} />
                </div>
                <div className="form-group">
                  <label>Confirm</label>
                  <input type="password" value={pwForm.confirmPassword} onChange={e => setPwForm(f => ({ ...f, confirmPassword: e.target.value }))} placeholder="Repeat" required />
                </div>
              </div>
              <button type="submit" className="btn btn-primary btn-sm" disabled={pwSaving}>
                {pwSaving ? <span className="loading-spinner" /> : 'Update Password'}
              </button>
            </form>
          </SectionCard>

          {/* Infrastructure info */}
          <div className="settings-col-full" style={{ padding: '11px 14px', borderRadius: 'var(--radius)', background: 'var(--bg2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ color: 'var(--text-dim)', flexShrink: 0, marginTop: 1 }}><InfoIcon /></div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Infrastructure settings — environment variables only</strong>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {['JWT_SECRET', 'PORT', 'DB_PATH', 'NODE_ENV', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'GLOBAL_WEBHOOK_URL', 'CLEANUP_INTERVAL_MS'].map(k => (
                  <code key={k} style={{ color: 'var(--text-muted)', background: 'var(--bg3)', padding: '1px 6px', borderRadius: 3, fontSize: '0.85em', border: '1px solid var(--border)' }}>{k}</code>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}