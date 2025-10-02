import React, { useEffect, useState } from 'react'

/* =========================
   Types de réponses backend
   ========================= */

type ConvertResponse = {
  markdown: string
  html: string
  engine: string
  stats: Record<string, unknown>
}

type WordpressResponse = {
  success?: boolean
  message?: string
  error?: string
  detail?: string
  link?: string
  url?: string
  permalink?: string
  postId?: number
  status?: string
  username?: string
  displayName?: string
}

type WordpressSubscriptionsResponse = {
  base_url?: string
  baseUrl?: string
  admin_path?: string
  adminPath?: string
  html?: string
  message?: string
  error?: string
  detail?: string
}

type JsonObject = Record<string, unknown>

/* ===============
   Utilitaires TS
   =============== */

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isConvertResponse(data: unknown): data is ConvertResponse {
  return (
    isJsonObject(data) &&
    typeof data.markdown === 'string' &&
    typeof data.html === 'string' &&
    typeof data.engine === 'string' &&
    typeof data.stats === 'object' &&
    data.stats !== null
  )
}

function pickBackendMessage(payload: unknown): string | undefined {
  if (typeof payload === 'string') {
    const trimmed = payload.trim()
    return trimmed ? trimmed : undefined
  }
  if (isJsonObject(payload)) {
    for (const key of ['message', 'error', 'detail']) {
      const candidate = payload[key]
      if (typeof candidate === 'string') {
        const trimmed = candidate.trim()
        if (trimmed) return trimmed
      }
    }
  }
  return undefined
}

async function readJsonPayload(res: Response): Promise<{ data: unknown; raw: string }> {
  const raw = await res.text()
  if (!raw) return { data: null, raw: '' }
  try {
    return { data: JSON.parse(raw) as unknown, raw }
  } catch {
    return { data: null, raw }
  }
}

function normaliseErrorMessage(payload: unknown, raw: string, fallback: string): string {
  return pickBackendMessage(payload) || raw.trim() || fallback
}

function resolveUnknownError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.trim()) return error.trim()
  return fallback
}

function extractTitle(markdown: string) {
  const lines = markdown.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('#')) return trimmed.replace(/^#+\s*/, '').trim()
    return trimmed
  }
  return ''
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/* =================
   Composant principal
   ================= */

export default function App() {
  // Conversion DOCX -> MD/HTML
  const [md, setMd] = useState('')
  const [html, setHtml] = useState('')
  const [engine, setEngine] = useState('')
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<'md'|'html'>('md')
  const [error, setError] = useState('')

  // Connexion & publication WP
  const [wpUrl, setWpUrl] = useState('')
  const [wpUsername, setWpUsername] = useState('')
  const [wpAppPassword, setWpAppPassword] = useState('')      // pour /wordpress/connect & publish
  const [wpAdminPassword, setWpAdminPassword] = useState('')  // pour Selenium export
  const [wpTesting, setWpTesting] = useState(false)
  const [wpConnected, setWpConnected] = useState(false)
  const [wpMessage, setWpMessage] = useState('')
  const [wpError, setWpError] = useState('')
  const [postTitle, setPostTitle] = useState('')
  const [postSlug, setPostSlug] = useState('')
  const [postStatus, setPostStatus] = useState<'draft' | 'publish'>('draft')
  const [publishBusy, setPublishBusy] = useState(false)
  const [publishMessage, setPublishMessage] = useState('')
  const [publishError, setPublishError] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)

  // Export Woo (via WebSocket)
  const [exportBusy, setExportBusy] = useState(false)
  const [exportMessage, setExportMessage] = useState('')
  const [exportError, setExportError] = useState('')
  const [exportLogs, setExportLogs] = useState<string[]>([])
  const [exportProgress, setExportProgress] = useState<number>(0)
  const [wsRef, setWsRef] = useState<WebSocket | null>(null)

  // Aperçu abonnements (optionnel si backend le propose)
  const [subscriptionsBusy, setSubscriptionsBusy] = useState(false)
  const [subscriptionsMessage, setSubscriptionsMessage] = useState('')
  const [subscriptionsError, setSubscriptionsError] = useState('')
  const [subscriptionsUrl, setSubscriptionsUrl] = useState('')
  const [subscriptionsHtml, setSubscriptionsHtml] = useState('')

  // Backend URL
  const backend = import.meta.env.VITE_API_URL || 'http://localhost:8000'
  const normalisedWpUrl = wpUrl.trim()

  /* ======================
     Helpers front communs
     ====================== */

  function buildWordpressApiPayload() {
    const password = wpAppPassword || wpAdminPassword
    return {
      siteUrl: normalisedWpUrl,
      url: normalisedWpUrl,
      baseUrl: normalisedWpUrl,
      username: wpUsername,
      user: wpUsername,
      applicationPassword: wpAppPassword || undefined,
      password: password || undefined,
    }
  }

  function downloadBase64File(base64Data: string, filename: string, contentType?: string) {
    const byteCharacters = atob(base64Data)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const byteArray = new Uint8Array(byteNumbers)
    const blob = new Blob([byteArray], { type: contentType || 'application/octet-stream' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(link.href)
  }

  function toWsUrl(httpBase: string, path: string) {
    const u = new URL(httpBase)
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
    let p = path.startsWith('/') ? path : '/' + path
    const basePath = u.pathname.endsWith('/') ? u.pathname.slice(0, -1) : u.pathname
    u.pathname = `${basePath}${p}`
    return u.toString()
  }

  function appendLog(line: string) {
    setExportLogs(prev => [...prev, line])
  }

  /* =====================
     Conversion DOCX → MD
     ===================== */

  async function handleFileInput(file: File) {
    setBusy(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)

      const res = await fetch(`${backend}/convert`, { method: 'POST', body: form })
      const { data, raw } = await readJsonPayload(res)

      if (!res.ok || !isConvertResponse(data)) {
        const message = normaliseErrorMessage(data, raw, 'Erreur de conversion')
        throw new Error(message)
      }

      setMd(data.markdown)
      setHtml(data.html)
      setEngine(data.engine)
      setTab('md')

      const detectedTitle = extractTitle(data.markdown)
      setPostTitle(detectedTitle)
      setPublishMessage('')
      setPublishError('')
      setSlugTouched(false)
      setPostSlug(detectedTitle ? slugify(detectedTitle) : '')
    } catch (err) {
      setError(resolveUnknownError(err, 'Erreur de conversion'))
    } finally {
      setBusy(false)
    }
  }

  function onChoose(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0]
    if (f) handleFileInput(f)
  }

  async function copyCurrent() {
    const text = tab === 'md' ? md : html
    try {
      await navigator.clipboard.writeText(text)
      window.alert('Copié !')
    } catch (error) {
      console.error('Impossible de copier le contenu', error)
    }
  }

  function downloadMd() {
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = 'article.md'; a.click()
    URL.revokeObjectURL(a.href)
  }

  useEffect(() => {
    if (!slugTouched) {
      setPostSlug(postTitle ? slugify(postTitle) : '')
    }
  }, [postTitle, slugTouched])

  useEffect(() => {
    setWpConnected(false)
    setWpMessage('')
    setWpError('')
    setExportMessage('')
    setExportError('')
    setExportLogs([])
    setExportProgress(0)
    setSubscriptionsMessage('')
    setSubscriptionsError('')
    setSubscriptionsHtml('')
    setSubscriptionsUrl('')
  }, [wpUrl, wpUsername, wpAppPassword, wpAdminPassword])

  useEffect(() => {
    return () => { try { wsRef?.close() } catch {} }
  }, [wsRef])

  /* ======================
     Connexion & Publication
     ====================== */

  async function testWordpressConnection() {
    if (!wpUrl || !wpUsername || (!wpAppPassword && !wpAdminPassword)) {
      setWpError('Veuillez renseigner l\'URL, l\'identifiant et un mot de passe ou application password.')
      setWpMessage('')
      return
    }

    setWpTesting(true)
    setWpConnected(false)
    setWpMessage('')
    setWpError('')

    try {
      const payload = buildWordpressApiPayload()

      const res = await fetch(`${backend}/wordpress/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const { data, raw } = await readJsonPayload(res)
      const parsed = isJsonObject(data) ? (data as WordpressResponse) : null

      if (!res.ok || parsed?.success === false) {
        const message = normaliseErrorMessage(parsed, raw, 'Connexion échouée')
        throw new Error(message)
      }

      setWpConnected(true)
      setWpMessage(parsed?.message || 'Connexion à WordPress réussie.')
    } catch (error) {
      setWpError(resolveUnknownError(error, 'Impossible de se connecter à WordPress.'))
    } finally {
      setWpTesting(false)
    }
  }

  async function publishToWordpress() {
    if (!md && !html) {
      setPublishError('Convertissez un document avant de publier sur WordPress.')
      setPublishMessage('')
      return
    }

    if (!wpUrl || !wpUsername || (!wpAppPassword && !wpAdminPassword)) {
      setPublishError('Veuillez renseigner les informations de connexion WordPress (identifiant + mot de passe ou application password).')
      setPublishMessage('')
      return
    }

    setPublishBusy(true)
    setPublishMessage('')
    setPublishError('')

    try {
      const payload: Record<string, unknown> = {
        ...buildWordpressApiPayload(),
        title: postTitle,
        status: postStatus,
        markdown: md,
        html,
        content: html,
      }
      if (postSlug) payload.slug = postSlug

      const res = await fetch(`${backend}/wordpress/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const { data, raw } = await readJsonPayload(res)
      const parsed = isJsonObject(data) ? (data as WordpressResponse) : null

      if (!res.ok || parsed?.success === false) {
        const message = normaliseErrorMessage(parsed, raw, 'Publication échouée')
        throw new Error(message)
      }

      const link = parsed?.link || parsed?.url || parsed?.permalink
      if (link) {
        setPublishMessage(`Article publié : ${link}`)
      } else {
        setPublishMessage(parsed?.message || 'Article publié avec succès sur WordPress.')
      }
    } catch (error) {
      setPublishError(resolveUnknownError(error, 'Impossible de publier sur WordPress.'))
    } finally {
      setPublishBusy(false)
    }
  }

  /* ===========================
     Export Woo via WebSocket
     =========================== */

  async function exportSubscriptions() {
    if (!wpUrl || !wpUsername || !wpAdminPassword) {
      setExportError('Veuillez renseigner l\'URL, l\'identifiant et votre mot de passe WordPress (non application password).')
      setExportMessage('')
      return
    }

    setExportBusy(true)
    setExportMessage('')
    setExportError('')
    setExportLogs([])
    setExportProgress(0)

    try {
      const wsUrl = toWsUrl(backend, '/ws/wordpress/subscriptions/export')
      const ws = new WebSocket(wsUrl)
      setWsRef(ws)

      ws.onopen = () => {
        appendLog('✅ Connecté au serveur, démarrage de l’export…')
        ws.send(JSON.stringify({
          baseUrl: normalisedWpUrl,
          username: wpUsername,
          password: wpAdminPassword,
          browser: 'firefox', // backend Fly: Firefox/Gecko
          headless: true
        }))
      }

      ws.onmessage = (ev) => {
        let msg: any = null
        try { msg = JSON.parse(ev.data) } catch { /* texte brut éventuel */ }

        if (msg && typeof msg === 'object') {
          if (msg.type === 'progress' || msg.type === 'step') {
            if (typeof msg.message === 'string' && msg.message.trim()) {
              appendLog(`• ${msg.message}`)
            }
            if (typeof msg.pct === 'number') {
              setExportProgress(Math.max(0, Math.min(100, msg.pct)))
            }
            return
          }
          if (msg.type === 'error') {
            setExportError(typeof msg.message === 'string' ? msg.message : 'Erreur pendant l’export.')
            appendLog('❌ ' + (msg.message || 'Erreur'))
            setExportBusy(false)
            try { ws.close() } catch {}
            return
          }
          if (msg.type === 'done') {
            const filename = msg.filename || 'woocommerce-subscriptions.csv'
            const contentType = msg.contentType || 'text/csv'
            if (typeof msg.data === 'string' && msg.data) {
              downloadBase64File(msg.data, filename, contentType)
              setExportMessage(`Export téléchargé : ${filename}`)
              appendLog('✅ Export terminé et téléchargé.')
            } else {
              setExportError('Réponse finale invalide (pas de données).')
              appendLog('❌ Réponse finale invalide.')
            }
            setExportProgress(100)
            setExportBusy(false)
            try { ws.close() } catch {}
            return
          }
        }

        if (typeof ev.data === 'string' && ev.data.trim()) {
          appendLog(ev.data.trim())
        }
      }

      ws.onerror = () => {
        appendLog('❌ WebSocket error')
        setExportError('Erreur de communication WebSocket.')
        setExportBusy(false)
        try { ws.close() } catch {}
      }

      ws.onclose = () => {
        appendLog('ℹ️ Connexion WebSocket fermée.')
      }

    } catch (err) {
      setExportError(resolveUnknownError(err, 'Impossible de démarrer l’export en WebSocket.'))
      setExportBusy(false)
    }
  }

  /* ===========================
     Aperçu page abonnements (optionnel si route HTTP dispo)
     =========================== */

  async function fetchSubscriptionsPreview() {
    if (!wpUrl || !wpUsername || !wpAdminPassword) {
      setSubscriptionsError('Veuillez renseigner l\'URL, l\'identifiant et votre mot de passe WordPress (non application password).')
      setSubscriptionsMessage('')
      setSubscriptionsHtml('')
      setSubscriptionsUrl('')
      return
    }

    setSubscriptionsBusy(true)
    setSubscriptionsMessage('')
    setSubscriptionsError('')
    setSubscriptionsHtml('')
    setSubscriptionsUrl('')

    try {
      const res = await fetch(`${backend}/wordpress/subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base_url: normalisedWpUrl,
          username: wpUsername,
          password: wpAdminPassword,
        }),
      })

      const { data, raw } = await readJsonPayload(res)
      const parsed = isJsonObject(data) ? (data as WordpressSubscriptionsResponse) : null

      if (!res.ok || !parsed) {
        const message = normaliseErrorMessage(parsed, raw, 'Récupération échouée')
        throw new Error(message)
      }

      const base = parsed.base_url || parsed.baseUrl || normalisedWpUrl
      const adminPath = parsed.admin_path || parsed.adminPath
      let targetUrl = base
      if (adminPath) {
        try {
          targetUrl = new URL(adminPath, base).toString()
        } catch {
          const separator = base.endsWith('/') ? '' : '/'
          targetUrl = `${base}${separator}${adminPath}`
        }
      }
      setSubscriptionsUrl(targetUrl)
      setSubscriptionsHtml(parsed.html || '')
      setSubscriptionsMessage('Page d\'abonnements récupérée avec succès.')
    } catch (error) {
      setSubscriptionsError(resolveUnknownError(error, 'Impossible de récupérer la page des abonnements WooCommerce.'))
    } finally {
      setSubscriptionsBusy(false)
    }
  }

  /* ==========
     Rendu UI
     ========== */

  return (
    <>
      <header className="header">
        <div className="brand">Lava<span className="dot">●</span>Tools</div>
        <label className="button" style={{cursor: busy ? 'not-allowed' : 'pointer'}}>
          {busy ? 'Conversion…' : 'Importer .docx'}
          <input type="file" accept=".docx" style={{display:'none'}} onChange={onChoose} disabled={busy} />
        </label>
      </header>

      <main className="container">
        {/* Conversion */}
        <div className="card">
          <p style={{marginTop:0}}>Transformez un <code>.docx</code> en Markdown + HTML pour WordPress.</p>
          {engine && <p style={{opacity:.7, marginTop: '-8px'}}>Moteur utilisé : <strong>{engine}</strong></p>}
          {error && <p style={{color:'#b91c1c'}}>{error}</p>}

          <div className="tabs">
            <button className={`tab ${tab==='md'?'active':''}`} onClick={()=>setTab('md')}>Markdown</button>
            <button className={`tab ${tab==='html'?'active':''}`} onClick={()=>setTab('html')}>HTML</button>
            <button className="button" onClick={copyCurrent} style={{marginLeft:'auto'}}>Copier</button>
            <button className="button" onClick={downloadMd}>Télécharger .md</button>
          </div>

          {tab==='md' ? (
            <textarea value={md} onChange={(e)=>setMd(e.target.value)} spellCheck={false}/>
          ) : (
            <div style={{border:'1px solid #e5e7eb', borderRadius:12, padding:12, minHeight:300}}
                 dangerouslySetInnerHTML={{__html: html}} />
          )}
        </div>

        {/* Connexion & Publication */}
        <div className="card" style={{marginTop: 24}}>
          <h2 className="section-title">Connexion &amp; publication WordPress</h2>
          <p style={{marginTop:0}}>Renseignez votre site WordPress puis publiez directement le contenu converti.</p>

          <div className="form-grid">
            <label className="field">
              <span>URL du site</span>
              <input
                type="url"
                placeholder="https://monsite.com"
                value={wpUrl}
                onChange={(e) => setWpUrl(e.target.value)}
                autoComplete="url"
              />
            </label>
            <label className="field">
              <span>Identifiant</span>
              <input
                type="text"
                placeholder="admin"
                value={wpUsername}
                onChange={(e) => setWpUsername(e.target.value)}
                autoComplete="username"
              />
            </label>
            <label className="field">
              <span>Application password (API)</span>
              <input
                type="password"
                placeholder="xxxx xxxx xxxx xxxx"
                value={wpAppPassword}
                onChange={(e) => setWpAppPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>
            <label className="field">
              <span>Mot de passe admin WordPress</span>
              <input
                type="password"
                placeholder="Mot de passe WordPress"
                value={wpAdminPassword}
                onChange={(e) => setWpAdminPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>
          </div>

          <div className="actions-row">
            <button
              className="button outline"
              onClick={testWordpressConnection}
              disabled={wpTesting}
            >
              {wpTesting ? 'Connexion…' : 'Tester la connexion'}
            </button>
            {wpConnected && !wpTesting && <span className="status success">Connecté</span>}
          </div>
          {wpMessage && <p className="status success">{wpMessage}</p>}
          {wpError && <p className="status error">{wpError}</p>}

          <hr className="divider" />

          {/* Publication */}
          <h3 className="section-subtitle">Publication sur WordPress</h3>
          <div className="form-grid">
            <label className="field">
              <span>Titre de l&apos;article</span>
              <input
                type="text"
                placeholder="Titre de l'article"
                value={postTitle}
                onChange={(e) => setPostTitle(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Slug (optionnel)</span>
              <input
                type="text"
                placeholder="titre-de-l-article"
                value={postSlug}
                onChange={(e) => {
                  setPostSlug(e.target.value)
                  setSlugTouched(true)
                }}
              />
            </label>
            <label className="field">
              <span>Statut WordPress</span>
              <select value={postStatus} onChange={(e) => setPostStatus(e.target.value as 'draft' | 'publish')}>
                <option value="draft">Brouillon</option>
                <option value="publish">Publié</option>
              </select>
            </label>
          </div>

          <button
            className="button"
            onClick={publishToWordpress}
            disabled={publishBusy}
            style={{marginTop: 16}}
          >
            {publishBusy ? 'Publication…' : 'Publier sur WordPress'}
          </button>

          {publishMessage && <p className="status success" style={{marginTop:12}}>{publishMessage}</p>}
          {publishError && <p className="status error" style={{marginTop:12}}>{publishError}</p>}

          <hr className="divider" />

          {/* Export Woo (WebSocket) */}
          <h3 className="section-subtitle">Export des abonnements WooCommerce</h3>
          <p style={{marginTop:0}}>Lancez l’export : progression en direct, CSV téléchargé à la fin.</p>

          <button
            className="button outline"
            onClick={exportSubscriptions}
            disabled={exportBusy}
            style={{marginTop: 12}}
          >
            {exportBusy ? 'Export en cours…' : 'Exporter les abonnements'}
          </button>

          {exportMessage && <p className="status success" style={{marginTop:12}}>{exportMessage}</p>}
          {exportError && <p className="status error" style={{marginTop:12}}>{exportError}</p>}

          {exportBusy && (
            <div style={{marginTop:12}}>
              <div style={{height:8, background:'#eee', borderRadius:8, overflow:'hidden'}}>
                <div style={{width:`${exportProgress}%`, height:'100%', background:'#2563eb', transition:'width .3s'}} />
              </div>
              <p style={{marginTop:8, opacity:.8}}>Progression : {Math.round(exportProgress)}%</p>
            </div>
          )}

          {exportLogs.length > 0 && (
            <details open style={{marginTop:12}}>
              <summary>Journal d’exécution</summary>
              <pre style={{
                background:'#0b1020', color:'#e2e8f0', padding:12, borderRadius:8,
                maxHeight:220, overflow:'auto', fontSize:12, lineHeight:1.4
              }}>{exportLogs.join('\n')}</pre>
            </details>
          )}

          {/* Aperçu abonnements (si route HTTP dispo côté backend) */}
          <button
            className="button outline"
            onClick={fetchSubscriptionsPreview}
            disabled={subscriptionsBusy}
            style={{marginTop: 24}}
          >
            {subscriptionsBusy ? 'Chargement…' : 'Voir la page des abonnements'}
          </button>

          {subscriptionsMessage && <p className="status success" style={{marginTop:12}}>{subscriptionsMessage}</p>}
          {subscriptionsError && <p className="status error" style={{marginTop:12}}>{subscriptionsError}</p>}

          {subscriptionsUrl && (
            <p className="status" style={{marginTop:12}}>
              <a href={subscriptionsUrl} target="_blank" rel="noreferrer">Ouvrir la page dans WordPress</a>
            </p>
          )}

          {subscriptionsHtml && (
            <details className="subscriptions-preview" style={{marginTop:12}}>
              <summary>Aperçu HTML de la page</summary>
              <div dangerouslySetInnerHTML={{ __html: subscriptionsHtml }} />
            </details>
          )}
        </div>
      </main>
    </>
  )
}
