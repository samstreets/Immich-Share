import React, { useEffect, useState, useCallback } from 'react'
import { useApi } from '../hooks/useAuth.jsx'

// ── helpers ───────────────────────────────────────────────────────────────────

function SectionCard({ title, subtitle, icon, children, style }) {
  return (
    <div style={{
      background: 'var(--bg2)',
      border: '1.5px solid var(--border)',
      borderRadius: 'var(--radius)',
      marginBottom: 20,
      overflow: 'hidden',
      ...style,
    }}>
      <div style={{
        padding: '14px 24px',
        borderBottom: '1.5px solid var(--border)',
        background: 'var(--bg3)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        {icon && <span style={{ fontSize: '1rem' }}>{icon}</span>}
        <div>
          <h2 style={{ fontSize: '0.9rem', fontWeight: 700, letterSpacing: '-0.01em' }}>{title}</h2>
          {subtitle && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: 1, fontWeight: 500 }}>
              {subtitle}
            </div>
          )}
        </div>
      </div>
      <div style={{ padding: '24px' }}>
        {children}
      </div>
    </div>
  )
}

function StatusPill({ ok, label }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 700,
      background: ok ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
      color: ok ? 'var(--green)' : 'var(--red)',
      border: `1px solid ${ok ? 'rgba(74,222,128,0.25)' : 'rgba(248,113,113,0.25)'}`,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: ok ? 'var(--green)' : 'var(--red)',
        flexShrink: 0,
      }} />
      {label}
    </span>
  )
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
    if (!cleaned) { setError('Enter a valid URL (e.g. https://share.example.com) or * to allow all.'); return }
    if (urls.includes(cleaned)) { setError('That URL is already in the list.'); return }
    setError(''); setDraft('')
    onChange([...urls, cleaned].join('\n'))
  }

  function remove(idx) { onChange(urls.filter((_, i) => i !== idx).join('\n')) }

  return (
    <div>
      {urls.length > 0 && (
        <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {urls.map((u, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--bg3)', border: '1.5px solid var(--border)',
              borderRadius: 'var(--radius-sm)', padding: '7px 12px',
            }}>
              <span style={{
                flex: 1, fontFamily: 'monospace', fontSize: '0.82rem',
                color: u === '*' ? 'var(--yellow)' : 'var(--accent)',
                fontWeight: 600,
              }}>
                {u === '*' ? '* — allow all origins' : u}
              </span>
              <button type="button" onClick={() => remove(i)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-dim)', fontSize: '0.9rem', padding: '0 2px', flexShrink: 0,
              }} title="Remove">✕</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text" value={draft}
          onChange={e => { setDraft(e.target.value); setError('') }}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())}
          placeholder="https://share.yourdomain.com  or  *"
          style={{ flex: 1 }}
        />
        <button type="button" className="btn btn-secondary" onClick={add} style={{ flexShrink: 0 }}>
          + Add
        </button>
      </div>
      {error && <div style={{ fontSize: '0.78rem', color: 'var(--red)', marginTop: 6, fontWeight: 500 }}>{error}</div>}
    </div>
  )
}

function Msg({ msg }) {
  if (!msg) return null
  return (
    <div className={msg.type === 'success' ? 'success-msg' : 'error-msg'} style={{ marginBottom: 16 }}>
      {msg.type === 'success' ? '✓ ' : '⚠ '}{msg.text}
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const api = useApi()

  const [loading, setLoading] = useState(true)

  // Immich settings
  const [immichUrl, setImmichUrl] = useState('')
  const [apiKeyRaw, setApiKeyRaw] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [testing, setTesting] = useState(false)
  const [immichMsg, setImmichMsg] = useState(null)
  const [immichSaving, setImmichSaving] = useState(false)

  // App settings
  const [externalUrl, setExternalUrl] = useState('')
  const [appName, setAppName] = useState('')
  const [appMsg, setAppMsg] = useState(null)
  const [appSaving, setAppSaving] = useState(false)

  // CORS
  const [allowedOrigins, setAllowedOrigins] = useState('')
  const [corsMsg, setCorsMsg] = useState(null)
  const [corsSaving, setCorsSaving] = useState(false)

  // Admin password
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [pwMsg, setPwMsg] = useState(null)
  const [pwSaving, setPwSaving] = useState(false)

  // Load all settings
  useEffect(() => {
    async function load() {
      try {
        const [s, key] = await Promise.all([
          api('/admin/settings'),
          api('/admin/settings/api-key'),
        ])
        setImmichUrl(s.immich_url || '')
        setApiKeyRaw(key.value || '')
        setExternalUrl(s.external_url || '')
        setAppName(s.app_name || '')
        setAllowedOrigins(s.allowed_origins || '')
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    load()
  }, [])

  // ── Save handlers ─────────────────────────────────────────────────────────

  async function saveImmich(e) {
    e?.preventDefault()
    setImmichSaving(true); setImmichMsg(null); setTestResult(null)
    try {
      await api('/admin/settings', {
        method: 'PUT',
        body: { immich_url: immichUrl, immich_api_key: apiKeyRaw },
      })
      setImmichMsg({ type: 'success', text: 'Immich connection settings saved.' })
    } catch (err) {
      setImmichMsg({ type: 'error', text: err.message })
    } finally { setImmichSaving(false) }
  }

  async function testConnection() {
    setTesting(true); setTestResult(null)
    try {
      // Save first so the test uses the current form values
      await api('/admin/settings', {
        method: 'PUT',
        body: { immich_url: immichUrl, immich_api_key: apiKeyRaw },
      })
      const result = await api('/admin/immich/test')
      setTestResult(result)
    } catch (err) {
      setTestResult({ ok: false, error: err.message })
    } finally { setTesting(false) }
  }

  async function saveApp(e) {
    e?.preventDefault()
    setAppSaving(true); setAppMsg(null)
    try {
      await api('/admin/settings', {
        method: 'PUT',
        body: { external_url: externalUrl, app_name: appName },
      })
      setAppMsg({ type: 'success', text: 'App settings saved.' })
    } catch (err) {
      setAppMsg({ type: 'error', text: err.message })
    } finally { setAppSaving(false) }
  }

  async function saveCors() {
    setCorsSaving(true); setCorsMsg(null)
    try {
      await api('/admin/settings', {
        method: 'PUT',
        body: { allowed_origins: allowedOrigins },
      })
      setCorsMsg({ type: 'success', text: 'CORS origins saved.' })
    } catch (err) {
      setCorsMsg({ type: 'error', text: err.message })
    } finally { setCorsSaving(false) }
  }

  async function changePassword(e) {
    e.preventDefault(); setPwMsg(null)
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwMsg({ type: 'error', text: 'New passwords do not match.' }); return
    }
    if (pwForm.newPassword.length < 8) {
      setPwMsg({ type: 'error', text: 'Password must be at least 8 characters.' }); return
    }
    setPwSaving(true)
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: { currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword },
      })
      setPwMsg({ type: 'success', text: 'Password changed successfully.' })
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err) {
      setPwMsg({ type: 'error', text: err.message })
    } finally { setPwSaving(false) }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '100px 0', gap: 14, color: 'var(--text-dim)' }}>
      <span className="loading-spinner" style={{ width: 26, height: 26 }} />
      <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Loading settings…</span>
    </div>
  )

  const originsCount = allowedOrigins
    ? allowedOrigins.split('\n').map(u => u.trim()).filter(Boolean).length
    : 0

  return (
    <div style={{ maxWidth: 680 }}>
      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Settings</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: 4, fontWeight: 500 }}>
          All configuration lives here — no environment file needed after first boot.
        </p>
      </div>

      {/* ── Immich Connection ─────────────────────────────────────────────── */}
      <SectionCard
        icon="🔌"
        title="Immich Connection"
        subtitle="URL and API key for your Immich instance"
      >
        <Msg msg={immichMsg} />

        {/* Connection status inline */}
        {testResult && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', borderRadius: 'var(--radius-sm)',
            background: testResult.ok ? 'rgba(74,222,128,0.06)' : 'rgba(248,113,113,0.06)',
            border: `1.5px solid ${testResult.ok ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}`,
            marginBottom: 16,
          }}>
            <StatusPill ok={testResult.ok} label={testResult.ok ? 'Connected' : 'Failed'} />
            <span style={{ fontSize: '0.82rem', color: testResult.ok ? 'var(--green)' : 'var(--red)', fontWeight: 500 }}>
              {testResult.ok ? 'Successfully connected to Immich.' : testResult.error}
            </span>
          </div>
        )}

        <form onSubmit={saveImmich}>
          <div className="form-group">
            <label>Immich Server URL</label>
            <input
              type="url"
              value={immichUrl}
              onChange={e => setImmichUrl(e.target.value)}
              placeholder="http://192.168.1.100:2283"
            />
            <span className="hint">Base URL of your Immich instance, no trailing slash.</span>
          </div>

          <div className="form-group">
            <label>API Key</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKeyRaw}
                onChange={e => setApiKeyRaw(e.target.value)}
                placeholder="Paste your Immich API key"
                style={{ flex: 1, fontFamily: showApiKey ? 'monospace' : 'inherit' }}
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowApiKey(v => !v)}
                style={{ flexShrink: 0, minWidth: 42 }}
                title={showApiKey ? 'Hide key' : 'Show key'}
              >
                {showApiKey ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
            <span className="hint">
              Generate in Immich → Account Settings → API Keys. Stored encrypted in your local database.
            </span>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="submit" className="btn btn-primary" disabled={immichSaving}>
              {immichSaving ? <span className="loading-spinner" /> : 'Save Connection'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={testConnection} disabled={testing}>
              {testing ? <span className="loading-spinner" /> : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="13 2 13 9 20 9"/><path d="M11 2H4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-7"/>
                  </svg>
                  Test Connection
                </>
              )}
            </button>
          </div>
        </form>
      </SectionCard>

      {/* ── App Settings ─────────────────────────────────────────────────── */}
      <SectionCard
        icon="🌐"
        title="App Settings"
        subtitle="Public URL and branding"
      >
        <Msg msg={appMsg} />
        <form onSubmit={saveApp}>
          <div className="form-group">
            <label>External / Public URL</label>
            <input
              type="url"
              value={externalUrl}
              onChange={e => setExternalUrl(e.target.value)}
              placeholder="https://share.yourdomain.com"
            />
            <span className="hint">
              The publicly reachable URL of this app. Used to build share links shown to viewers.
            </span>
          </div>

          <div className="form-group">
            <label>App Name</label>
            <input
              value={appName}
              onChange={e => setAppName(e.target.value)}
              placeholder="Immich Share"
            />
            <span className="hint">Shown to viewers on the password gate and share pages.</span>
          </div>

          <button type="submit" className="btn btn-primary" disabled={appSaving}>
            {appSaving ? <span className="loading-spinner" /> : 'Save App Settings'}
          </button>
        </form>
      </SectionCard>

      {/* ── CORS Origins ─────────────────────────────────────────────────── */}
      <SectionCard
        icon="🔒"
        title="Allowed Origins (CORS)"
        subtitle={originsCount > 0 ? `${originsCount} origin${originsCount !== 1 ? 's' : ''} configured` : 'All origins allowed (open)'}
      >
        <Msg msg={corsMsg} />

        {originsCount === 0 && (
          <div style={{
            padding: '10px 14px', borderRadius: 'var(--radius-sm)', marginBottom: 14,
            background: 'rgba(251,191,36,0.07)', border: '1.5px solid rgba(251,191,36,0.22)',
            fontSize: '0.8rem', color: 'var(--yellow)', fontWeight: 500,
          }}>
            ⚠ No origins configured — all cross-origin requests are currently allowed.
          </div>
        )}

        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.7 }}>
          Restrict which origins can make cross-origin API requests. Leave empty to allow all.
          Use{' '}
          <code style={{ color: 'var(--yellow)', background: 'var(--bg3)', padding: '1px 5px', borderRadius: 3, fontSize: '0.85em' }}>*</code>
          {' '}to explicitly allow all origins.
        </p>

        <UrlListEditor
          value={allowedOrigins}
          onChange={setAllowedOrigins}
        />

        <div style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-primary" disabled={corsSaving} onClick={saveCors}>
            {corsSaving ? <span className="loading-spinner" /> : 'Save Origins'}
          </button>
        </div>
      </SectionCard>

      {/* ── Admin Password ────────────────────────────────────────────────── */}
      <SectionCard
        icon="🔑"
        title="Change Admin Password"
        subtitle="Update your login credentials"
      >
        <Msg msg={pwMsg} />
        <form onSubmit={changePassword}>
          <div className="form-group">
            <label>Current Password</label>
            <input
              type="password"
              value={pwForm.currentPassword}
              onChange={e => setPwForm(f => ({ ...f, currentPassword: e.target.value }))}
              placeholder="••••••••"
              required
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>New Password</label>
              <input
                type="password"
                value={pwForm.newPassword}
                onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))}
                placeholder="Min 8 characters"
                required minLength={8}
              />
            </div>
            <div className="form-group">
              <label>Confirm New Password</label>
              <input
                type="password"
                value={pwForm.confirmPassword}
                onChange={e => setPwForm(f => ({ ...f, confirmPassword: e.target.value }))}
                placeholder="Repeat password"
                required
              />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={pwSaving}>
            {pwSaving ? <span className="loading-spinner" /> : 'Update Password'}
          </button>
        </form>
      </SectionCard>

      {/* ── Info banner ───────────────────────────────────────────────────── */}
      <div style={{
        padding: '14px 18px',
        borderRadius: 'var(--radius)',
        background: 'var(--bg2)',
        border: '1.5px solid var(--border)',
        fontSize: '0.8rem',
        color: 'var(--text-dim)',
        lineHeight: 1.7,
      }}>
        <strong style={{ color: 'var(--text-muted)' }}>ℹ Infrastructure settings</strong> — the following are
        set via environment variables and cannot be changed here:{' '}
        <code style={{ color: 'var(--text-muted)', fontSize: '0.85em' }}>JWT_SECRET</code>,{' '}
        <code style={{ color: 'var(--text-muted)', fontSize: '0.85em' }}>PORT</code>,{' '}
        <code style={{ color: 'var(--text-muted)', fontSize: '0.85em' }}>DB_PATH</code>,{' '}
        <code style={{ color: 'var(--text-muted)', fontSize: '0.85em' }}>NODE_ENV</code>.
        Everything else is managed here.
      </div>
    </div>
  )
}