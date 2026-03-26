import React, { useEffect, useState } from 'react'
import { useApi } from '../hooks/useAuth.jsx'

// ── small multi-URL editor ────────────────────────────────────────────────────
function UrlListEditor({ value, onChange }) {
  // value is a newline-separated string
  const urls = value
    ? value.split('\n').map(u => u.trim()).filter(Boolean)
    : []

  const [draft, setDraft] = useState('')
  const [error, setError]  = useState('')

  function validate(raw) {
    const u = raw.trim()
    if (!u) return null
    if (u === '*') return u
    try {
      const parsed = new URL(u)
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error()
      return parsed.origin // normalise (strips trailing slash etc.)
    } catch {
      return null
    }
  }

  function add() {
    const cleaned = validate(draft)
    if (!cleaned) {
      setError('Enter a valid URL (e.g. https://share.example.com) or * to allow all.')
      return
    }
    if (urls.includes(cleaned)) {
      setError('That URL is already in the list.')
      return
    }
    setError('')
    setDraft('')
    onChange([...urls, cleaned].join('\n'))
  }

  function remove(idx) {
    const next = urls.filter((_, i) => i !== idx)
    onChange(next.join('\n'))
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); add() }
  }

  return (
    <div>
      {/* Existing URLs */}
      {urls.length > 0 && (
        <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {urls.map((u, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--bg3)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', padding: '7px 12px',
            }}>
              <span style={{
                flex: 1, fontFamily: 'monospace', fontSize: '0.82rem',
                color: u === '*' ? 'var(--yellow)' : 'var(--accent)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {u === '*' ? '* — allow all origins' : u}
              </span>
              <button
                type="button"
                onClick={() => remove(i)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-dim)', fontSize: '1rem', padding: '0 2px', flexShrink: 0,
                }}
                title="Remove"
              >✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Add new */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={draft}
          onChange={e => { setDraft(e.target.value); setError('') }}
          onKeyDown={handleKeyDown}
          placeholder="https://share.yourdomain.com  or  *"
          style={{ flex: 1 }}
        />
        <button
          type="button"
          className="btn btn-secondary"
          onClick={add}
          style={{ flexShrink: 0 }}
        >
          ＋ Add
        </button>
      </div>
      {error && (
        <div style={{ fontSize: '0.78rem', color: 'var(--red)', marginTop: 5 }}>{error}</div>
      )}
    </div>
  )
}

// ── main settings page ────────────────────────────────────────────────────────
export default function SettingsPage() {
  const api = useApi()
  const [settings, setSettings] = useState({
    immich_url: '',
    immich_api_key: '',
    external_url: '',
    app_name: '',
    allowed_origins: '',
  })
  const [apiKeyRaw, setApiKeyRaw] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [settingsMsg, setSettingsMsg] = useState(null)

  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [pwMsg, setPwMsg] = useState(null)
  const [pwSaving, setPwSaving] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const [s, key] = await Promise.all([
          api('/admin/settings'),
          api('/admin/settings/api-key'),
        ])
        setSettings(s)
        setApiKeyRaw(key.value || '')
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function saveSettings(e) {
    e.preventDefault()
    setSaving(true)
    setSettingsMsg(null)
    setTestResult(null)
    try {
      await api('/admin/settings', {
        method: 'PUT',
        body: {
          immich_url: settings.immich_url,
          immich_api_key: apiKeyRaw,
          external_url: settings.external_url,
          app_name: settings.app_name,
          allowed_origins: settings.allowed_origins,
        },
      })
      setSettingsMsg({ type: 'success', text: 'Settings saved successfully.' })
    } catch (err) {
      setSettingsMsg({ type: 'error', text: err.message })
    } finally {
      setSaving(false)
    }
  }

  async function testConnection() {
    setTesting(true)
    setTestResult(null)
    try {
      await api('/admin/settings', {
        method: 'PUT',
        body: { immich_url: settings.immich_url, immich_api_key: apiKeyRaw },
      })
      const result = await api('/admin/immich/test')
      setTestResult(result)
    } catch (err) {
      setTestResult({ ok: false, error: err.message })
    } finally {
      setTesting(false)
    }
  }

  async function changePassword(e) {
    e.preventDefault()
    setPwMsg(null)
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwMsg({ type: 'error', text: 'New passwords do not match.' })
      return
    }
    if (pwForm.newPassword.length < 8) {
      setPwMsg({ type: 'error', text: 'Password must be at least 8 characters.' })
      return
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
    } finally {
      setPwSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
        <span className="loading-spinner" style={{ width: 28, height: 28 }} />
      </div>
    )
  }

  const originsCount = settings.allowed_origins
    ? settings.allowed_origins.split('\n').map(u => u.trim()).filter(Boolean).length
    : 0

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Settings</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: 4 }}>
          Configure your Immich connection and sharing preferences
        </p>
      </div>

      {/* ── Immich & App Settings ──────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
          Immich Connection
        </h2>

        {settingsMsg && (
          <div className={settingsMsg.type === 'success' ? 'success-msg' : 'error-msg'}>
            {settingsMsg.text}
          </div>
        )}

        <form onSubmit={saveSettings}>
          <div className="form-group">
            <label>Immich URL</label>
            <input
              type="url"
              value={settings.immich_url}
              onChange={e => setSettings(s => ({ ...s, immich_url: e.target.value }))}
              placeholder="http://192.168.1.100:2283"
            />
            <span className="hint">The base URL of your Immich instance (no trailing slash).</span>
          </div>

          <div className="form-group">
            <label>API Key</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKeyRaw}
                onChange={e => setApiKeyRaw(e.target.value)}
                placeholder="Your Immich API key"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowApiKey(v => !v)}
                style={{ flexShrink: 0 }}
              >
                {showApiKey ? '🙈' : '👁'}
              </button>
            </div>
            <span className="hint">Generate in Immich → Account Settings → API Keys.</span>
          </div>

          <div className="form-group">
            <label>External URL</label>
            <input
              type="url"
              value={settings.external_url}
              onChange={e => setSettings(s => ({ ...s, external_url: e.target.value }))}
              placeholder="https://share.yourdomain.com"
            />
            <span className="hint">
              The public URL this app is accessible at — used to build share links.
            </span>
          </div>

          <div className="form-group">
            <label>App Name</label>
            <input
              value={settings.app_name}
              onChange={e => setSettings(s => ({ ...s, app_name: e.target.value }))}
              placeholder="Immich Share"
            />
          </div>

          {testResult && (
            <div className={testResult.ok ? 'success-msg' : 'error-msg'} style={{ marginBottom: 16 }}>
              {testResult.ok ? '✓ Connected to Immich successfully!' : `✗ ${testResult.error}`}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="loading-spinner" /> : 'Save Settings'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={testConnection}
              disabled={testing}
            >
              {testing ? <span className="loading-spinner" /> : '⚡ Test Connection'}
            </button>
          </div>
        </form>
      </div>

      {/* ── Allowed Origins ───────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>
            Allowed Origins
            {originsCount > 0 && (
              <span style={{
                marginLeft: 10,
                padding: '2px 8px',
                borderRadius: 99,
                fontSize: '0.72rem',
                background: 'var(--accent-glow)',
                color: 'var(--accent)',
                fontWeight: 500,
              }}>
                {originsCount} configured
              </span>
            )}
          </h2>
        </div>

        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 14 }}>
          Control which origins are permitted to make cross-origin requests to this app (CORS).
          Leave empty to allow all origins. Add <code style={{ color: 'var(--yellow)', background: 'var(--bg3)', padding: '1px 5px', borderRadius: 3 }}>*</code> to explicitly allow all.
        </p>

        {originsCount === 0 && (
          <div style={{
            padding: '10px 14px', borderRadius: 'var(--radius-sm)',
            background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)',
            fontSize: '0.8rem', color: 'var(--yellow)', marginBottom: 14,
          }}>
            ⚠ No origins configured — all origins are currently allowed.
          </div>
        )}

        <UrlListEditor
          value={settings.allowed_origins}
          onChange={val => setSettings(s => ({ ...s, allowed_origins: val }))}
        />

        <div style={{ marginTop: 14 }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving}
            onClick={saveSettings}
          >
            {saving ? <span className="loading-spinner" /> : 'Save Origins'}
          </button>
        </div>
      </div>

      {/* ── Change Password ───────────────────────────────────────────────── */}
      <div className="card">
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
          Change Admin Password
        </h2>

        {pwMsg && (
          <div className={pwMsg.type === 'success' ? 'success-msg' : 'error-msg'}>
            {pwMsg.text}
          </div>
        )}

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
                required
                minLength={8}
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
            {pwSaving ? <span className="loading-spinner" /> : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  )
}