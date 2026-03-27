import React, { useEffect, useState } from 'react'
import { useApi } from '../hooks/useAuth.jsx'

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

function SectionCard({ title, children, style }) {
  return (
    <div style={{
      background: 'var(--bg2)',
      border: '1.5px solid var(--border)',
      borderRadius: 'var(--radius)',
      marginBottom: 18,
      overflow: 'hidden',
      ...style,
    }}>
      <div style={{
        padding: '14px 24px',
        borderBottom: '1.5px solid var(--border)',
        background: 'var(--bg3)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <h2 style={{ fontSize: '0.9rem', fontWeight: 700, letterSpacing: '-0.01em' }}>{title}</h2>
      </div>
      <div style={{ padding: '24px' }}>
        {children}
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const api = useApi()
  const [settings, setSettings] = useState({
    immich_url: '', immich_api_key: '', external_url: '', app_name: '', allowed_origins: '',
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
        const [s, key] = await Promise.all([api('/admin/settings'), api('/admin/settings/api-key')])
        setSettings(s); setApiKeyRaw(key.value || '')
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    load()
  }, [])

  async function saveSettings(e) {
    e?.preventDefault()
    setSaving(true); setSettingsMsg(null); setTestResult(null)
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
    } finally { setSaving(false) }
  }

  async function testConnection() {
    setTesting(true); setTestResult(null)
    try {
      await api('/admin/settings', { method: 'PUT', body: { immich_url: settings.immich_url, immich_api_key: apiKeyRaw } })
      const result = await api('/admin/immich/test')
      setTestResult(result)
    } catch (err) {
      setTestResult({ ok: false, error: err.message })
    } finally { setTesting(false) }
  }

  async function changePassword(e) {
    e.preventDefault(); setPwMsg(null)
    if (pwForm.newPassword !== pwForm.confirmPassword) { setPwMsg({ type: 'error', text: 'New passwords do not match.' }); return }
    if (pwForm.newPassword.length < 8) { setPwMsg({ type: 'error', text: 'Password must be at least 8 characters.' }); return }
    setPwSaving(true)
    try {
      await api('/auth/change-password', { method: 'POST', body: { currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword } })
      setPwMsg({ type: 'success', text: 'Password changed successfully.' })
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err) {
      setPwMsg({ type: 'error', text: err.message })
    } finally { setPwSaving(false) }
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '100px 0', gap: 14, color: 'var(--text-dim)' }}>
      <span className="loading-spinner" style={{ width: 26, height: 26 }} />
      <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Loading settings…</span>
    </div>
  )

  const originsCount = settings.allowed_origins
    ? settings.allowed_origins.split('\n').map(u => u.trim()).filter(Boolean).length
    : 0

  return (
    <div style={{ maxWidth: 660 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Settings</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: 4, fontWeight: 500 }}>
          Configure your Immich connection and sharing preferences
        </p>
      </div>

      {/* Immich Connection */}
      <SectionCard title="Immich Connection">
        {settingsMsg && (
          <div className={settingsMsg.type === 'success' ? 'success-msg' : 'error-msg'}>
            {settingsMsg.type === 'success' ? '✓ ' : '⚠ '}{settingsMsg.text}
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
            <span className="hint">Base URL of your Immich instance (no trailing slash).</span>
          </div>
          <div className="form-group">
            <label>API Key</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKeyRaw}
                onChange={e => setApiKeyRaw(e.target.value)}
                placeholder="Your Immich API key"
                style={{ flex: 1, fontFamily: showApiKey ? 'monospace' : 'inherit' }}
              />
              <button type="button" className="btn btn-secondary" onClick={() => setShowApiKey(v => !v)} style={{ flexShrink: 0, minWidth: 42 }}>
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
            <span className="hint">The public URL of this app — used in share links.</span>
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
            <div className={testResult.ok ? 'success-msg' : 'error-msg'}>
              {testResult.ok ? '✓ Connected to Immich successfully!' : `✗ ${testResult.error}`}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="loading-spinner" /> : 'Save Settings'}
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

      {/* CORS Origins */}
      <SectionCard title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          Allowed Origins
          {originsCount > 0 && (
            <span style={{
              padding: '1px 8px', borderRadius: 99, fontSize: '0.68rem',
              background: 'var(--accent-dim)', color: 'var(--accent)', fontWeight: 700,
            }}>
              {originsCount} configured
            </span>
          )}
        </span>
      }>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.7 }}>
          Control which origins can make cross-origin requests (CORS). Leave empty to allow all. Add{' '}
          <code style={{ color: 'var(--yellow)', background: 'var(--bg3)', padding: '1px 5px', borderRadius: 3, fontSize: '0.85em' }}>*</code>
          {' '}to explicitly allow all origins.
        </p>

        {originsCount === 0 && (
          <div style={{
            padding: '10px 14px', borderRadius: 'var(--radius-sm)', marginBottom: 14,
            background: 'rgba(251,191,36,0.07)', border: '1.5px solid rgba(251,191,36,0.22)',
            fontSize: '0.8rem', color: 'var(--yellow)', fontWeight: 500,
          }}>
            ⚠ No origins configured — all origins are currently allowed.
          </div>
        )}

        <UrlListEditor
          value={settings.allowed_origins}
          onChange={val => setSettings(s => ({ ...s, allowed_origins: val }))}
        />

        <div style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={saveSettings}>
            {saving ? <span className="loading-spinner" /> : 'Save Origins'}
          </button>
        </div>
      </SectionCard>

      {/* Change Password */}
      <SectionCard title="Change Admin Password">
        {pwMsg && (
          <div className={pwMsg.type === 'success' ? 'success-msg' : 'error-msg'}>
            {pwMsg.type === 'success' ? '✓ ' : '⚠ '}{pwMsg.text}
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
    </div>
  )
}