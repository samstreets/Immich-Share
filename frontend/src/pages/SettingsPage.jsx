import React, { useEffect, useState } from 'react'
import { useApi } from '../hooks/useAuth.jsx'

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

function Msg({ msg }) {
  if (!msg) return null
  return <div className={msg.type === 'success' ? 'success-msg' : 'error-msg'} style={{ marginBottom: 12 }}>{msg.text}</div>
}

const ConnIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
const GlobeIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
const LockIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
const KeyIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
const InfoIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
const EyeIcon = ({ visible }) => visible
  ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
  : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>

export default function SettingsPage() {
  const api = useApi()
  const [loading, setLoading] = useState(true)

  const [immichUrl, setImmichUrl] = useState('')
  const [apiKeyRaw, setApiKeyRaw] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [testing, setTesting] = useState(false)
  const [immichMsg, setImmichMsg] = useState(null)
  const [immichSaving, setImmichSaving] = useState(false)

  const [externalUrl, setExternalUrl] = useState('')
  const [appName, setAppName] = useState('')
  const [appMsg, setAppMsg] = useState(null)
  const [appSaving, setAppSaving] = useState(false)

  const [allowedOrigins, setAllowedOrigins] = useState('')
  const [corsMsg, setCorsMsg] = useState(null)
  const [corsSaving, setCorsSaving] = useState(false)

  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [pwMsg, setPwMsg] = useState(null)
  const [pwSaving, setPwSaving] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const [s, key] = await Promise.all([api('/admin/settings'), api('/admin/settings/api-key')])
        setImmichUrl(s.immich_url || ''); setApiKeyRaw(key.value || '')
        setExternalUrl(s.external_url || ''); setAppName(s.app_name || '')
        setAllowedOrigins(s.allowed_origins || '')
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    load()
  }, [])

  async function saveImmich(e) {
    e?.preventDefault(); setImmichSaving(true); setImmichMsg(null); setTestResult(null)
    try { await api('/admin/settings', { method: 'PUT', body: { immich_url: immichUrl, immich_api_key: apiKeyRaw } }); setImmichMsg({ type: 'success', text: 'Immich settings saved.' }) }
    catch (err) { setImmichMsg({ type: 'error', text: err.message }) }
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
    try { await api('/admin/settings', { method: 'PUT', body: { external_url: externalUrl, app_name: appName } }); setAppMsg({ type: 'success', text: 'App settings saved.' }) }
    catch (err) { setAppMsg({ type: 'error', text: err.message }) }
    finally { setAppSaving(false) }
  }

  async function saveCors() {
    setCorsSaving(true); setCorsMsg(null)
    try { await api('/admin/settings', { method: 'PUT', body: { allowed_origins: allowedOrigins } }); setCorsMsg({ type: 'success', text: 'CORS origins saved.' }) }
    catch (err) { setCorsMsg({ type: 'error', text: err.message }) }
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
          .settings-grid {
            grid-template-columns: 1fr 1fr;
          }
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
            Configure your Immich connection and app preferences
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
                <span className="hint">Base URL, no trailing slash.</span>
              </div>
              <div className="form-group">
                <label>API Key</label>
                <div style={{ display: 'flex', gap: 7 }}>
                  <input type={showApiKey ? 'text' : 'password'} value={apiKeyRaw} onChange={e => setApiKeyRaw(e.target.value)} placeholder="Paste your Immich API key" style={{ flex: 1, fontFamily: showApiKey ? 'monospace' : 'inherit', fontSize: showApiKey ? '0.72rem' : '0.875rem' }} />
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowApiKey(v => !v)} style={{ flexShrink: 0 }} title={showApiKey ? 'Hide' : 'Show'}><EyeIcon visible={showApiKey} /></button>
                </div>
                <span className="hint">Account Settings → API Keys in Immich.</span>
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
                <span className="hint">Used to build share links.</span>
              </div>
              <div className="form-group">
                <label>App Name</label>
                <input value={appName} onChange={e => setAppName(e.target.value)} placeholder="Immich Share" />
                <span className="hint">Shown on share and login pages.</span>
              </div>
              <button type="submit" className="btn btn-primary btn-sm" disabled={appSaving}>
                {appSaving ? <span className="loading-spinner" /> : 'Save'}
              </button>
            </form>
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
                {['JWT_SECRET', 'PORT', 'DB_PATH', 'NODE_ENV'].map(k => (
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