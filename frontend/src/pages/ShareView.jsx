import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useParams } from 'react-router-dom'

async function safeFetch(url, options = {}) {
  const res = await fetch(url, options)
  const text = await res.text()
  let data
  try { data = JSON.parse(text) }
  catch { data = { error: text || `HTTP ${res.status}` } }
  return { ok: res.ok, status: res.status, data }
}

function useViewerTheme() {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('viewer_theme') !== 'light' }
    catch { return true }
  })
  function toggle() {
    const next = !dark
    setDark(next)
    try { localStorage.setItem('viewer_theme', next ? 'dark' : 'light') } catch {}
  }
  return { dark, toggle }
}

function PasswordGate({ shareInfo, onUnlock, dark }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { ok, data } = await safeFetch(`/api/public/verify/${shareInfo.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!ok) throw new Error(data.error || 'Verification failed')
      onUnlock(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const bg = dark ? '#13161f' : '#f5f5f7'
  const cardBg = dark ? '#1c2032' : '#ffffff'
  const cardBorder = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)'
  const textColor = dark ? '#e2e4f0' : '#1a1a2e'
  const textMuted = dark ? '#8b90aa' : '#6b7280'
  const inputBg = dark ? '#242840' : '#f9fafb'
  const inputBorder = dark ? 'rgba(255,255,255,0.08)' : '#d1d5db'
  const inputColor = dark ? '#e2e4f0' : '#1a1a2e'

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', background: bg, position: 'relative', overflow: 'hidden', transition: 'background 0.3s' }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse 60% 40% at 50% 0%, ${dark ? 'rgba(212,168,67,0.07)' : 'rgba(212,168,67,0.12)'} 0%, transparent 70%)`, pointerEvents: 'none' }} />
      <div style={{ width: '100%', maxWidth: '380px', position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 62, height: 62, borderRadius: 18, background: 'linear-gradient(135deg, #d4a843, #f5cc6c)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', fontSize: '1.8rem', boxShadow: '0 10px 32px rgba(212,168,67,0.4)' }}>🔒</div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 6, color: textColor }}>{shareInfo.name}</h1>
          {shareInfo.description && <p style={{ color: textMuted, fontSize: '0.875rem', marginBottom: 6 }}>{shareInfo.description}</p>}
          <p style={{ color: textMuted, fontSize: '0.78rem', fontWeight: 500 }}>Shared via {shareInfo.appName}</p>
        </div>
        <div style={{ background: cardBg, border: `1.5px solid ${cardBorder}`, borderRadius: 12, padding: '26px', boxShadow: dark ? '0 24px 60px rgba(0,0,0,0.5)' : '0 8px 32px rgba(0,0,0,0.12)', transition: 'all 0.3s' }}>
          {error && <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', padding: '9px 13px', borderRadius: 8, fontSize: '0.82rem', marginBottom: 14 }}>⚠ {error}</div>}
          <form onSubmit={submit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: textMuted, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 5 }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter share password"
                autoFocus required
                style={{ width: '100%', padding: '9px 13px', background: inputBg, border: `1px solid ${inputBorder}`, color: inputColor, borderRadius: 8, fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', transition: 'all 0.15s' }}
              />
            </div>
            <button
              type="submit"
              style={{ width: '100%', padding: '11px 18px', background: '#c4a44a', color: '#0d0a00', border: 'none', borderRadius: 999, fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit', transition: 'all 0.15s' }}
              disabled={loading}
            >
              {loading ? <span style={{ width: 16, height: 16, border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#0d0a00', borderRadius: '50%', animation: 'spin 0.6s linear infinite', display: 'inline-block' }} /> : 'View Photos →'}
            </button>
          </form>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function DownloadZipButton({ shareId, sessionToken, assetCount, shareName, selectedIds = null }) {
  const [state, setState] = useState('idle')
  const [progress, setProgress] = useState(0)
  const [received, setReceived] = useState(0)
  const [total, setTotal] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const abortRef = useRef(null)

  const count = selectedIds ? selectedIds.length : assetCount
  const label = selectedIds ? `Download Selected (${count})` : `Download All (${count})`

  function formatBytes(b) {
    if (b < 1024) return `${b} B`
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
    return `${(b / 1024 / 1024).toFixed(1)} MB`
  }

  async function handleDownload() {
    if (state === 'downloading') {
      abortRef.current?.abort()
      setState('idle'); setProgress(0); setReceived(0); setTotal(0)
      return
    }

    setState('downloading'); setProgress(0); setReceived(0); setTotal(0); setErrorMsg('')
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const t = encodeURIComponent(sessionToken)
      let url = `/api/public/zip/${shareId}?t=${t}`
      if (selectedIds && selectedIds.length > 0) {
        url += `&ids=${encodeURIComponent(selectedIds.join(','))}`
      }
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) { const text = await res.text(); throw new Error(text || `HTTP ${res.status}`) }

      const contentLength = parseInt(res.headers.get('content-length') || '0', 10)
      setTotal(contentLength)
      const reader = res.body.getReader()
      const chunks = []
      let loaded = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value); loaded += value.length; setReceived(loaded)
        if (contentLength > 0) setProgress(Math.min(Math.round((loaded / contentLength) * 100), 99))
        else setProgress(prev => (prev >= 95 ? 10 : prev + 1))
      }

      setProgress(100)
      const blob = new Blob(chunks, { type: 'application/zip' })
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      const safe = (shareName || 'share').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60)
      a.download = selectedIds ? `${safe}_selection.zip` : `${safe}.zip`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
      setState('done')
      setTimeout(() => { setState('idle'); setProgress(0); setReceived(0); setTotal(0) }, 3000)
    } catch (err) {
      if (err.name === 'AbortError') return
      setErrorMsg(err.message); setState('error')
      setTimeout(() => { setState('idle'); setProgress(0) }, 4000)
    }
  }

  const isDownloading = state === 'downloading'
  const isDone = state === 'done'
  const isError = state === 'error'
  const btnBg = isError ? 'rgba(248,113,113,0.15)' : isDone ? 'rgba(74,222,128,0.15)' : isDownloading ? 'rgba(196,164,74,0.2)' : 'rgba(255,255,255,0.1)'
  const btnColor = isError ? '#f87171' : isDone ? '#4ade80' : isDownloading ? '#c4a44a' : 'rgba(255,255,255,0.8)'
  const btnBorder = isError ? '1px solid rgba(248,113,113,0.3)' : isDone ? '1px solid rgba(74,222,128,0.3)' : isDownloading ? '1px solid rgba(196,164,74,0.4)' : '1px solid rgba(255,255,255,0.15)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <button
        onClick={handleDownload}
        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 600, background: btnBg, color: btnColor, border: btnBorder, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', minWidth: 140, justifyContent: 'center' }}
      >
        {isDownloading ? (
          <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>Cancel</>
        ) : isDone ? <>✓ Downloaded!</> : isError ? <>✗ {errorMsg.slice(0, 28)}{errorMsg.length > 28 ? '…' : ''}</> : (
          <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>{label}</>
        )}
      </button>
      {isDownloading && (
        <div style={{ width: '100%', minWidth: 140 }}>
          <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: total > 0 ? `${progress}%` : undefined, background: 'linear-gradient(90deg, #c4a44a, #f5cc6c)', borderRadius: 2, transition: total > 0 ? 'width 0.3s ease' : undefined, animation: total === 0 ? 'zipPulse 1.4s ease-in-out infinite' : undefined }} />
          </div>
          <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', marginTop: 3, textAlign: 'right', fontWeight: 600 }}>
            {total > 0 ? `${formatBytes(received)} / ${formatBytes(total)} · ${progress}%` : `${formatBytes(received)} received…`}
          </div>
        </div>
      )}
      <style>{`@keyframes zipPulse { 0% { width: 5%; margin-left: 0; } 50% { width: 40%; margin-left: 30%; } 100% { width: 5%; margin-left: 95%; } }`}</style>
    </div>
  )
}

const CHUNK_SIZE = 50 * 1024 * 1024

function generateUploadId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

async function uploadFileChunked(file, shareId, sessionToken, onProgress) {
  const uploadId = generateUploadId()
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE)
  const t = encodeURIComponent(sessionToken)

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE
    const end = Math.min(start + CHUNK_SIZE, file.size)
    const chunkBlob = file.slice(start, end)
    const formData = new FormData()
    formData.append('chunkData', chunkBlob, file.name)
    formData.append('uploadId', uploadId)
    formData.append('chunkIndex', String(i))
    formData.append('totalChunks', String(totalChunks))
    formData.append('filename', file.name)
    let attempt = 0
    while (attempt < 3) {
      const res = await fetch(`/api/public/upload-chunk/${shareId}?t=${t}`, { method: 'POST', body: formData })
      if (res.ok) break
      attempt++
      if (attempt >= 3) {
        const text = await res.text().catch(() => `HTTP ${res.status}`)
        await fetch(`/api/public/upload-chunk/${shareId}/${uploadId}?t=${t}`, { method: 'DELETE' }).catch(() => {})
        return { success: false, error: `Chunk ${i + 1}/${totalChunks} failed after 3 attempts: ${text}` }
      }
      await new Promise(r => setTimeout(r, 500 * 2 ** attempt))
    }
    onProgress(Math.round(((i + 1) / totalChunks) * 85))
  }

  onProgress(90)
  const assembleRes = await fetch(`/api/public/upload-assemble/${shareId}?t=${t}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uploadId, filename: file.name, deviceAssetId: `${file.name}-${file.size}-${file.lastModified}`, fileCreatedAt: new Date(file.lastModified).toISOString(), fileModifiedAt: new Date(file.lastModified).toISOString() }),
  })
  const assembleData = await assembleRes.json().catch(() => ({ error: `HTTP ${assembleRes.status}` }))
  onProgress(100)
  if (!assembleRes.ok) return { success: false, error: assembleData.error || 'Assembly failed' }
  return { success: true, assetId: assembleData.assetId }
}

function UploadPanel({ shareId, sessionToken, onUploaded }) {
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState({})
  const [results, setResults] = useState([])
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef()

  function addFiles(incoming) {
    const arr = Array.from(incoming).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'))
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name + f.size))
      return [...prev, ...arr.filter(f => !existing.has(f.name + f.size))]
    })
    setResults([])
  }

  function removeFile(idx) { setFiles(prev => prev.filter((_, i) => i !== idx)) }

  async function uploadAll() {
    if (!files.length) return
    setUploading(true); setResults([]); setProgress({})
    const out = []
    for (const file of files) {
      setProgress(prev => ({ ...prev, [file.name]: 0 }))
      const result = await uploadFileChunked(file, shareId, sessionToken, pct => setProgress(prev => ({ ...prev, [file.name]: pct })))
      out.push({ name: file.name, ...result })
    }
    setResults(out); setUploading(false)
    if (out.some(r => r.success)) { setFiles([]); setTimeout(onUploaded, 800) }
  }

  const successCount = results.filter(r => r.success).length
  const failCount = results.filter(r => !r.success).length

  return (
    <div style={{ background: 'rgba(255,255,255,0.05)', border: '1.5px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
      <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.9)' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        Upload Photos &amp; Videos
        <span style={{ marginLeft: 'auto', fontSize: '0.68rem', color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>chunked · no file size limit</span>
      </h3>
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
        style={{ border: `2px dashed ${dragOver ? '#c4a44a' : 'rgba(255,255,255,0.2)'}`, borderRadius: 8, padding: '28px 16px', textAlign: 'center', cursor: 'pointer', background: dragOver ? 'rgba(196,164,74,0.08)' : 'rgba(255,255,255,0.03)', transition: 'all 0.15s', marginBottom: 12 }}
      >
        <div style={{ fontSize: '2rem', marginBottom: 8 }}>📷</div>
        <div style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>Drop photos &amp; videos or <span style={{ color: '#c4a44a', fontWeight: 700 }}>browse</span></div>
        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', marginTop: 5 }}>JPG, PNG, HEIC, MP4, MOV and more · large files split automatically</div>
        <input ref={inputRef} type="file" multiple accept="image/*,video/*" style={{ display: 'none' }} onChange={e => addFiles(e.target.files)} />
      </div>
      {files.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)', marginBottom: 6, fontWeight: 600 }}>
            {files.length} file{files.length !== 1 ? 's' : ''} queued
            <span style={{ marginLeft: 8, color: 'rgba(255,255,255,0.25)' }}>({(files.reduce((a, f) => a + f.size, 0) / 1024 / 1024).toFixed(1)} MB total)</span>
          </div>
          <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {files.map((f, i) => {
              const pct = progress[f.name]
              const isUploading = uploading && pct !== undefined && pct < 100
              const isDone = uploading && pct === 100
              return (
                <div key={i} style={{ padding: '6px 10px', background: 'rgba(255,255,255,0.05)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', fontSize: '0.8rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'rgba(255,255,255,0.8)' }}>{f.type.startsWith('video/') ? '🎬 ' : '📷 '}{f.name}</span>
                    <span style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0, fontSize: '0.72rem' }}>{(f.size / 1024 / 1024).toFixed(1)} MB{f.size > CHUNK_SIZE && <span style={{ marginLeft: 4, color: 'rgba(196,164,74,0.6)', fontSize: '0.68rem' }}>({Math.ceil(f.size / CHUNK_SIZE)} chunks)</span>}</span>
                    {!uploading && <button onClick={e => { e.stopPropagation(); removeFile(i) }} style={{ background: 'none', color: 'rgba(255,255,255,0.3)', fontSize: '0.9rem', padding: '0 2px', border: 'none', cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}>✕</button>}
                    {isDone && <span style={{ color: '#4ade80', fontSize: '0.8rem', flexShrink: 0 }}>✓</span>}
                  </div>
                  {isUploading && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, #c4a44a, #f5cc6c)', borderRadius: 2, transition: 'width 0.2s ease' }} />
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{pct < 86 ? `Uploading… ${pct}%` : pct < 95 ? 'Assembling…' : 'Finalising…'}</div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
      {results.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {successCount > 0 && <div style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)', color: '#4ade80', padding: '9px 13px', borderRadius: 8, fontSize: '0.82rem', marginBottom: 6 }}>✓ {successCount} file{successCount !== 1 ? 's' : ''} uploaded successfully</div>}
          {failCount > 0 && <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', color: '#f87171', padding: '9px 13px', borderRadius: 8, fontSize: '0.82rem' }}>{results.filter(r => !r.success).map((r, i) => <div key={i}>✗ {r.name}: {r.error}</div>)}</div>}
        </div>
      )}
      <button
        onClick={uploadAll}
        disabled={uploading || files.length === 0}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: files.length > 0 && !uploading ? '#c4a44a' : 'rgba(255,255,255,0.1)', color: files.length > 0 && !uploading ? '#0d0a00' : 'rgba(255,255,255,0.5)', border: 'none', borderRadius: 999, fontSize: '0.8rem', fontWeight: 700, cursor: uploading || files.length === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
      >
        {uploading ? <><span style={{ width: 13, height: 13, border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#0d0a00', borderRadius: '50%', animation: 'spin 0.6s linear infinite', display: 'inline-block' }} /> Uploading…</> : `Upload${files.length > 0 ? ` ${files.length} file${files.length !== 1 ? 's' : ''}` : ''}`}
      </button>
    </div>
  )
}

function LightBox({ asset, token, onClose, onPrev, onNext, total, index }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') onPrev()
      if (e.key === 'ArrowRight') onNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onPrev, onNext])

  const t = encodeURIComponent(token)
  const isVideo = asset.type === 'VIDEO'

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(6,8,16,0.97)', zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', background: 'linear-gradient(to bottom, rgba(6,8,16,0.8), transparent)', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>📷</div>
          <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.82rem', fontWeight: 600 }}>{index + 1} / {total}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {asset.originalUrl && (
            <a href={`${asset.originalUrl}?t=${t}`} download className="btn btn-secondary btn-sm" style={{ color: 'rgba(255,255,255,0.8)', background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.15)' }} onClick={e => e.stopPropagation()}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download
            </a>
          )}
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 7, padding: '6px 13px', cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'inherit', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Close
          </button>
        </div>
      </div>
      {total > 1 && (
        <>
          {[{ onClick: onPrev, style: { left: 14 }, icon: '‹' }, { onClick: onNext, style: { right: 14 }, icon: '›' }].map(({ onClick, style: s, icon }) => (
            <button key={icon} onClick={onClick} style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '50%', width: 48, height: 48, fontSize: '1.6rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, fontFamily: 'inherit', transition: 'background 0.15s', ...s }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(212,168,67,0.2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
            >{icon}</button>
          ))}
        </>
      )}
      <div style={{ maxWidth: '92vw', maxHeight: '82vh' }}>
        {isVideo
          ? <video key={asset.id} src={`${asset.videoUrl}?t=${t}`} controls autoPlay style={{ maxWidth: '92vw', maxHeight: '82vh', borderRadius: 8, outline: 'none' }} />
          : <img key={asset.id} src={`${asset.previewUrl}?t=${t}`} alt={asset.originalFileName || ''} style={{ maxWidth: '92vw', maxHeight: '82vh', borderRadius: 8, objectFit: 'contain', display: 'block' }} />
        }
      </div>
      {(asset.originalFileName || asset.fileCreatedAt) && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '14px 20px', background: 'linear-gradient(to top, rgba(6,8,16,0.8), transparent)', color: 'rgba(255,255,255,0.45)', fontSize: '0.78rem', display: 'flex', gap: 20, fontWeight: 500 }}>
          {asset.originalFileName && <span>{asset.originalFileName}</span>}
          {asset.fileCreatedAt && <span>{new Date(asset.fileCreatedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>}
        </div>
      )}
    </div>
  )
}

function GalleryControls({ viewMode, setViewMode, sortOrder, setSortOrder, typeFilter, setTypeFilter, total, filteredTotal, dark, onThemeToggle, selectMode, setSelectMode, selectedCount, onSelectAll, onClearSelection }) {
  const btnStyle = (active) => ({
    padding: '5px 10px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600,
    background: active ? 'rgba(196,164,74,0.2)' : 'rgba(255,255,255,0.08)',
    color: active ? '#c4a44a' : 'rgba(255,255,255,0.6)',
    border: active ? '1px solid rgba(196,164,74,0.4)' : '1px solid rgba(255,255,255,0.1)',
    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', fontWeight: 600, marginRight: 4 }}>
        {filteredTotal < total ? `${filteredTotal} of ${total}` : total} items
      </span>
      <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
        {[['all', 'All'], ['IMAGE', '🖼 Photos'], ['VIDEO', '🎬 Videos']].map(([val, label]) => (
          <button key={val} style={btnStyle(typeFilter === val)} onClick={() => setTypeFilter(val)}>{label}</button>
        ))}
      </div>
      <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />
      <div style={{ display: 'flex', gap: 4 }}>
        {[['newest', '↓ Newest'], ['oldest', '↑ Oldest']].map(([val, label]) => (
          <button key={val} style={btnStyle(sortOrder === val)} onClick={() => setSortOrder(val)}>{label}</button>
        ))}
      </div>
      <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />
      <div style={{ display: 'flex', gap: 4 }}>
        <button style={btnStyle(viewMode === 'grid')} onClick={() => setViewMode('grid')} title="Grid view">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><rect x="0" y="0" width="6" height="6" rx="1"/><rect x="10" y="0" width="6" height="6" rx="1"/><rect x="0" y="10" width="6" height="6" rx="1"/><rect x="10" y="10" width="6" height="6" rx="1"/></svg>
        </button>
        <button style={btnStyle(viewMode === 'list')} onClick={() => setViewMode('list')} title="List view">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="3" x2="16" y2="3"/><line x1="4" y1="8" x2="16" y2="8"/><line x1="4" y1="13" x2="16" y2="13"/><circle cx="1" cy="3" r="1" fill="currentColor"/><circle cx="1" cy="8" r="1" fill="currentColor"/><circle cx="1" cy="13" r="1" fill="currentColor"/></svg>
        </button>
      </div>
      <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />
      {/* Select mode toggle */}
      <button
        style={{
          ...btnStyle(selectMode),
          display: 'flex', alignItems: 'center', gap: 4,
        }}
        onClick={() => { setSelectMode(v => !v); if (selectMode) onClearSelection() }}
        title="Select items to download"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
        </svg>
        {selectMode ? (selectedCount > 0 ? `${selectedCount} selected` : 'Selecting') : 'Select'}
      </button>
      {selectMode && (
        <button style={{ ...btnStyle(false), fontSize: '0.7rem', padding: '4px 8px' }} onClick={onSelectAll}>All</button>
      )}
      <button onClick={onThemeToggle} style={btnStyle(false)} title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
        {dark ? '☀️' : '🌙'}
      </button>
    </div>
  )
}

// Selection bar shown when items are selected
function SelectionBar({ selectedCount, totalCount, allowDownload, shareId, sessionToken, shareName, onClearSelection, dark }) {
  const borderColor = dark ? 'rgba(196,164,74,0.4)' : 'rgba(196,164,74,0.5)'
  const bg = dark ? 'rgba(196,164,74,0.08)' : 'rgba(196,164,74,0.1)'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px',
      background: bg, borderBottom: `1px solid ${borderColor}`,
      flexWrap: 'wrap',
      animation: 'selBarIn 0.15s ease',
    }}>
      <style>{`@keyframes selBarIn { from { opacity:0; transform:translateY(-4px) } }`}</style>
      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#c4a44a' }}>
        {selectedCount} of {totalCount} selected
      </span>
      <button
        onClick={onClearSelection}
        style={{ fontSize: '0.75rem', fontWeight: 600, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.6)', borderRadius: 999, padding: '3px 10px', cursor: 'pointer', fontFamily: 'inherit' }}
      >
        Clear
      </button>
      {allowDownload && selectedCount > 0 && (
        <div style={{ marginLeft: 'auto' }}>
          <DownloadZipButton
            shareId={shareId}
            sessionToken={sessionToken}
            assetCount={selectedCount}
            shareName={shareName}
            selectedIds={null /* passed via props below */}
          />
        </div>
      )}
    </div>
  )
}

function ListItem({ asset, token, onClick, selectMode, selected, onToggleSelect }) {
  const t = encodeURIComponent(token)
  return (
    <div
      onClick={selectMode ? onToggleSelect : onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.1s', background: selected ? 'rgba(196,164,74,0.08)' : 'transparent' }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
    >
      {selectMode && (
        <div style={{
          width: 18, height: 18, borderRadius: 5, flexShrink: 0,
          background: selected ? '#c4a44a' : 'rgba(255,255,255,0.1)',
          border: selected ? '2px solid #c4a44a' : '2px solid rgba(255,255,255,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.12s',
        }}>
          {selected && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><polyline points="2 6 5 9 10 3" stroke="#1a1200" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        </div>
      )}
      <div style={{ width: 48, height: 48, borderRadius: 6, overflow: 'hidden', background: 'rgba(255,255,255,0.08)', flexShrink: 0 }}>
        <img src={`${asset.thumbnailUrl}?t=${t}`} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.originalFileName || asset.id}</div>
        {asset.fileCreatedAt && <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{new Date(asset.fileCreatedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}</div>}
      </div>
      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'rgba(255,255,255,0.3)', padding: '2px 8px', borderRadius: 99, background: 'rgba(255,255,255,0.07)' }}>{asset.type === 'VIDEO' ? '🎬 video' : '🖼 photo'}</div>
    </div>
  )
}

export default function ShareView() {
  const { shareId } = useParams()
  const { dark, toggle: toggleTheme } = useViewerTheme()

  const [shareInfo, setShareInfo] = useState(null)
  const [infoLoading, setInfoLoading] = useState(true)
  const [infoError, setIntoError] = useState('')
  const [shareData, setShareData] = useState(null)
  const [assets, setAssets] = useState([])
  const [assetsLoading, setAssetsLoading] = useState(false)
  const [assetsError, setAssetsError] = useState('')
  const [lightbox, setLightbox] = useState(null)
  const [showUpload, setShowUpload] = useState(false)

  const [viewMode, setViewMode] = useState('grid')
  const [sortOrder, setSortOrder] = useState('newest')
  const [typeFilter, setTypeFilter] = useState('all')

  // Selection state
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())

  const displayedAssets = useMemo(() => {
    let list = [...assets]
    if (typeFilter !== 'all') list = list.filter(a => a.type === typeFilter)
    if (sortOrder === 'oldest') list = list.reverse()
    return list
  }, [assets, sortOrder, typeFilter])

  function toggleSelectItem(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelectedIds(new Set(displayedAssets.map(a => a.id)))
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  const openLightbox = useCallback((index) => {
    if (selectMode) return // don't open lightbox in select mode
    setLightbox(index)
    window.history.pushState({ lightbox: true }, '')
  }, [selectMode])

  const closeLightbox = useCallback(() => {
    setLightbox(prev => {
      if (prev !== null && window.history.state?.lightbox) window.history.back()
      return null
    })
  }, [])

  useEffect(() => {
    function onPopState() { setLightbox(prev => prev !== null ? null : prev) }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const bg = dark ? '#13161f' : '#f5f5f7'
  const headerBg = dark ? 'rgba(28,32,50,0.95)' : 'rgba(245,245,247,0.95)'
  const borderColor = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)'
  const textColor = dark ? '#e2e4f0' : '#1a1a2e'
  const textMuted = dark ? 'rgba(255,255,255,0.45)' : '#6b7280'
  const tileBg = dark ? '#242840' : '#e5e7eb'
  const scrollbarThumb = dark ? 'rgba(196,164,74,0.5)' : 'rgba(0,0,0,0.3)'
  const scrollbarTrack = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)'

  useEffect(() => {
    safeFetch(`/api/public/info/${shareId}`)
      .then(({ ok, data }) => {
        if (!ok || data.error) throw new Error(data.error || 'Share not found')
        setShareInfo(data)
      })
      .catch(e => setIntoError(e.message))
      .finally(() => setInfoLoading(false))
  }, [shareId])

  const loadAssets = useCallback(async (sessionToken, shareUuid) => {
    setAssetsLoading(true); setAssetsError('')
    try {
      const { ok, data } = await safeFetch(`/api/public/content/${shareUuid || shareId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionToken }),
      })
      if (!ok) throw new Error(data.error || 'Failed to load content')
      setAssets(data.assets)
    } catch (err) { setAssetsError(err.message) }
    finally { setAssetsLoading(false) }
  }, [shareId])

  const handleUnlock = useCallback(async (data) => {
    setShareData(data)
    await loadAssets(data.sessionToken, data.id)
  }, [loadAssets])

  const handleUploaded = useCallback(() => {
    if (shareData?.sessionToken) loadAssets(shareData.sessionToken, shareData.id)
  }, [shareData, loadAssets])

  const token = shareData?.sessionToken || ''
  const t = encodeURIComponent(token)

  const Spinner = ({ size = 32 }) => (
    <div style={{ width: size, height: size, border: `${size / 10}px solid rgba(196,164,74,0.2)`, borderTopColor: '#c4a44a', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
  )

  if (infoLoading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, background: bg, transition: 'background 0.3s' }}>
      <Spinner />
      <span style={{ color: textMuted, fontSize: '0.875rem', fontWeight: 500 }}>Loading share…</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  if (infoError || !shareInfo) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: bg }}>
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <div style={{ fontSize: '3.5rem', marginBottom: 16 }}>🔗</div>
        <h1 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: 10, color: textColor }}>Share Not Found</h1>
        <p style={{ color: textMuted, fontSize: '0.875rem' }}>{infoError || 'This share link is invalid or has been removed.'}</p>
      </div>
    </div>
  )

  if (shareInfo.isExpired || !shareInfo.isActive) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: bg }}>
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <div style={{ fontSize: '3.5rem', marginBottom: 16 }}>⏱</div>
        <h1 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: 10, color: textColor }}>{shareInfo.isExpired ? 'Share Expired' : 'Share Unavailable'}</h1>
        <p style={{ color: textMuted, fontSize: '0.875rem' }}>This share link is no longer active.</p>
      </div>
    </div>
  )

  if (!shareData) return <PasswordGate shareInfo={shareInfo} onUnlock={handleUnlock} dark={dark} />

  const selectedIdsArray = [...selectedIds]

  return (
    <div
      className="share-view-root"
      style={{ height: '100vh', overflowY: 'scroll', overflowX: 'hidden', background: bg, transition: 'background 0.3s', color: textColor }}
    >
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        .share-view-root::-webkit-scrollbar { width: 8px; }
        .share-view-root::-webkit-scrollbar-track { background: ${scrollbarTrack}; }
        .share-view-root::-webkit-scrollbar-thumb { background: ${scrollbarThumb}; border-radius: 4px; }
        .share-view-root::-webkit-scrollbar-thumb:hover { background: ${dark ? 'rgba(196,164,74,0.75)' : 'rgba(0,0,0,0.45)'}; }
        .share-view-root { scrollbar-width: thin; scrollbar-color: ${scrollbarThumb} ${scrollbarTrack}; }
        .grid-tile-checkbox {
          position: absolute; top: 6px; left: 6px; z-index: 2;
          width: 22px; height: 22px; border-radius: 6px;
          background: rgba(0,0,0,0.55); backdrop-filter: blur(4px);
          border: 2px solid rgba(255,255,255,0.35);
          display: flex; align-items: center; justify-content: center;
          transition: all 0.12s; cursor: pointer;
        }
        .grid-tile-checkbox.checked {
          background: #c4a44a; border-color: #c4a44a;
        }
        .grid-tile:hover .grid-tile-checkbox-hint { opacity: 1 !important; }
      `}</style>

      {/* Header */}
      <div style={{
        padding: '0 16px', height: 56,
        borderBottom: `1px solid ${borderColor}`,
        background: headerBg, backdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, fontSize: '0.85rem', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>📷</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: textColor }}>{shareData.name}</div>
            {shareData.description && <div style={{ color: textMuted, fontSize: '0.75rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shareData.description}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          {/* Download selected button — shown in header when items are selected and downloads allowed */}
          {shareData.allow_download && selectedIds.size > 0 && (
            <DownloadZipButton
              shareId={shareData.id}
              sessionToken={token}
              assetCount={selectedIds.size}
              shareName={shareData.name}
              selectedIds={selectedIdsArray}
            />
          )}
          {/* Download all — shown when nothing selected */}
          {shareData.allow_download && assets.length > 0 && selectedIds.size === 0 && (
            <DownloadZipButton shareId={shareData.id} sessionToken={token} assetCount={assets.length} shareName={shareData.name} />
          )}
          {shareData.allow_upload && (
            <button onClick={() => setShowUpload(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 600, background: showUpload ? 'rgba(196,164,74,0.2)' : 'rgba(255,255,255,0.1)', color: showUpload ? '#c4a44a' : textMuted, border: showUpload ? '1px solid rgba(196,164,74,0.4)' : `1px solid ${borderColor}`, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              {showUpload ? 'Hide Upload' : 'Upload'}
            </button>
          )}
        </div>
      </div>

      {/* Upload panel */}
      {shareData.allow_upload && showUpload && (
        <div style={{ maxWidth: 620, margin: '20px auto 0', padding: '0 16px' }}>
          <UploadPanel shareId={shareId} sessionToken={token} onUploaded={handleUploaded} />
        </div>
      )}

      {/* Gallery controls */}
      {!assetsLoading && assets.length > 0 && (
        <GalleryControls
          viewMode={viewMode} setViewMode={setViewMode}
          sortOrder={sortOrder} setSortOrder={setSortOrder}
          typeFilter={typeFilter} setTypeFilter={setTypeFilter}
          total={assets.length} filteredTotal={displayedAssets.length}
          dark={dark} onThemeToggle={toggleTheme}
          selectMode={selectMode} setSelectMode={setSelectMode}
          selectedCount={selectedIds.size}
          onSelectAll={selectAll}
          onClearSelection={clearSelection}
        />
      )}

      {/* Selection info bar */}
      {selectMode && selectedIds.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px',
          background: 'rgba(196,164,74,0.08)', borderBottom: '1px solid rgba(196,164,74,0.25)',
          flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#c4a44a' }}>
            {selectedIds.size} item{selectedIds.size !== 1 ? 's' : ''} selected
          </span>
          <button onClick={clearSelection} style={{ fontSize: '0.72rem', fontWeight: 600, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.55)', borderRadius: 999, padding: '2px 9px', cursor: 'pointer', fontFamily: 'inherit' }}>
            Clear
          </button>
          <button onClick={selectAll} style={{ fontSize: '0.72rem', fontWeight: 600, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.55)', borderRadius: 999, padding: '2px 9px', cursor: 'pointer', fontFamily: 'inherit' }}>
            Select all {displayedAssets.length}
          </button>
        </div>
      )}

      {/* Gallery */}
      {assetsLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '100px 0', gap: 14, color: textMuted }}>
          <Spinner />
          <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Loading photos…</span>
        </div>
      ) : assetsError ? (
        <div style={{ maxWidth: 460, margin: '60px auto', padding: '0 20px' }}>
          <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', color: '#f87171', padding: '9px 13px', borderRadius: 8, fontSize: '0.82rem' }}>{assetsError}</div>
        </div>
      ) : displayedAssets.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: textMuted }}>
          <div style={{ fontSize: '3rem', marginBottom: 14 }}>{typeFilter === 'VIDEO' ? '🎬' : typeFilter === 'IMAGE' ? '🖼' : '📷'}</div>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: textColor }}>
            {typeFilter !== 'all' ? `No ${typeFilter === 'VIDEO' ? 'videos' : 'photos'} in this share` : shareData.allow_upload ? 'No photos yet — be the first to upload!' : 'No photos in this share.'}
          </div>
          {typeFilter !== 'all' && <button onClick={() => setTypeFilter('all')} style={{ marginTop: 14, padding: '6px 16px', background: 'rgba(196,164,74,0.15)', color: '#c4a44a', border: '1px solid rgba(196,164,74,0.3)', borderRadius: 999, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit' }}>Show all items</button>}
        </div>
      ) : viewMode === 'list' ? (
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          {displayedAssets.map((asset, i) => (
            <ListItem
              key={asset.id} asset={asset} token={token}
              onClick={() => openLightbox(i)}
              selectMode={selectMode}
              selected={selectedIds.has(asset.id)}
              onToggleSelect={() => toggleSelectItem(asset.id)}
            />
          ))}
        </div>
      ) : (
        <div style={{ padding: '4px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 3 }}>
          {displayedAssets.map((asset, i) => {
            const isSelected = selectedIds.has(asset.id)
            return (
              <div
                key={asset.id}
                className="grid-tile"
                onClick={() => selectMode ? toggleSelectItem(asset.id) : openLightbox(i)}
                style={{ aspectRatio: '1', overflow: 'hidden', cursor: 'pointer', background: tileBg, position: 'relative', borderRadius: 3, outline: isSelected ? '2.5px solid #c4a44a' : 'none', outlineOffset: '-2px' }}
              >
                <img
                  src={`${asset.thumbnailUrl}?t=${t}`}
                  loading="lazy" alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.25s ease, opacity 0.3s', opacity: 0, display: 'block' }}
                  onLoad={e => { e.target.style.opacity = 1 }}
                  onMouseEnter={e => { if (!selectMode) e.target.style.transform = 'scale(1.06)' }}
                  onMouseLeave={e => { e.target.style.transform = 'scale(1)' }}
                />
                {/* Checkbox overlay */}
                {(selectMode || isSelected) && (
                  <div
                    className={`grid-tile-checkbox${isSelected ? ' checked' : ''}`}
                    onClick={e => { e.stopPropagation(); toggleSelectItem(asset.id) }}
                  >
                    {isSelected && (
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                        <polyline points="2 6 5 9 10 3" stroke="#1a1200" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                )}
                {/* Subtle checkbox hint on hover when not in select mode */}
                {!selectMode && !isSelected && (
                  <div
                    className="grid-tile-checkbox-hint"
                    style={{ opacity: 0, transition: 'opacity 0.15s', position: 'absolute', top: 6, left: 6, width: 22, height: 22, borderRadius: 6, background: 'rgba(0,0,0,0.45)', border: '2px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 2 }}
                    onClick={e => { e.stopPropagation(); setSelectMode(true); toggleSelectItem(asset.id) }}
                  />
                )}
                {asset.type === 'VIDEO' && (
                  <div style={{ position: 'absolute', bottom: 7, right: 7, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', borderRadius: 5, padding: '2px 8px', fontSize: '0.7rem', color: '#fff', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                    ▶ {asset.duration || 'video'}
                  </div>
                )}
                {/* Dim overlay for selected items */}
                {isSelected && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(196,164,74,0.15)', pointerEvents: 'none' }} />
                )}
              </div>
            )
          })}
        </div>
      )}

      {lightbox !== null && (
        <LightBox
          asset={displayedAssets[lightbox]}
          token={token}
          index={lightbox}
          total={displayedAssets.length}
          onClose={closeLightbox}
          onPrev={() => setLightbox(i => (i - 1 + displayedAssets.length) % displayedAssets.length)}
          onNext={() => setLightbox(i => (i + 1) % displayedAssets.length)}
        />
      )}

      <div style={{ textAlign: 'center', padding: '32px 20px 40px', color: textMuted, fontSize: '0.75rem', fontWeight: 500 }}>
        Shared via {shareInfo.appName}
      </div>
    </div>
  )
}