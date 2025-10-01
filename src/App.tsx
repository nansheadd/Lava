import React, { useEffect, useState } from 'react'

type ConvertResponse = {
  markdown: string
  html: string
  engine: string
  stats: Record<string, any>
}

type WordpressResponse = {
  success?: boolean
  message?: string
  error?: string
  link?: string
  url?: string
  permalink?: string
  postId?: number
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

export default function App() {
  const [md, setMd] = useState('')
  const [html, setHtml] = useState('')
  const [engine, setEngine] = useState('')
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<'md'|'html'>('md')
  const [error, setError] = useState('')
  const [wpUrl, setWpUrl] = useState('')
  const [wpUsername, setWpUsername] = useState('')
  const [wpPassword, setWpPassword] = useState('')
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

  const backend = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  async function handleFileInput(file: File) {
    setBusy(true); setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`${backend}/convert`, { method: 'POST', body: form })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json() as ConvertResponse
      setMd(data.markdown); setHtml(data.html); setEngine(data.engine); setTab('md')
      const detectedTitle = extractTitle(data.markdown)
      setPostTitle(detectedTitle)
      setPublishMessage('')
      setPublishError('')
      setSlugTouched(false)
      setPostSlug(detectedTitle ? slugify(detectedTitle) : '')
    } catch (e: any) {
      setError(e?.message || 'Erreur de conversion')
    } finally { setBusy(false) }
  }

  function onChoose(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0]
    if (f) handleFileInput(f)
  }

  async function copyCurrent() {
    const text = tab === 'md' ? md : html
    try { await navigator.clipboard.writeText(text); alert('Copié !') } catch {}
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
  }, [wpUrl, wpUsername, wpPassword])

  async function testWordpressConnection() {
    if (!wpUrl || !wpUsername || !wpPassword) {
      setWpError('Veuillez renseigner l\'URL, l\'identifiant et le mot de passe.')
      setWpMessage('')
      return
    }

    setWpTesting(true)
    setWpConnected(false)
    setWpMessage('')
    setWpError('')

    try {
      const payload = {
        siteUrl: wpUrl,
        url: wpUrl,
        baseUrl: wpUrl,
        username: wpUsername,
        user: wpUsername,
        applicationPassword: wpPassword,
        password: wpPassword,
      }

      const res = await fetch(`${backend}/wordpress/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      let data: WordpressResponse | null = null
      try {
        data = await res.json()
      } catch {}

      if (!res.ok || data?.success === false) {
        throw new Error(data?.message || data?.error || 'Connexion échouée')
      }

      setWpConnected(true)
      setWpMessage(data?.message || 'Connexion à WordPress réussie.')
    } catch (e: any) {
      setWpError(e?.message || 'Impossible de se connecter à WordPress.')
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

    if (!wpUrl || !wpUsername || !wpPassword) {
      setPublishError('Veuillez renseigner les informations de connexion WordPress.')
      setPublishMessage('')
      return
    }

    setPublishBusy(true)
    setPublishMessage('')
    setPublishError('')

    try {
      const payload: Record<string, unknown> = {
        siteUrl: wpUrl,
        url: wpUrl,
        baseUrl: wpUrl,
        username: wpUsername,
        user: wpUsername,
        applicationPassword: wpPassword,
        password: wpPassword,
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

      let data: WordpressResponse | null = null
      try {
        data = await res.json()
      } catch {}

      if (!res.ok || data?.success === false) {
        throw new Error(data?.message || data?.error || 'Publication échouée')
      }

      const link = data?.link || data?.url || data?.permalink
      if (link) {
        setPublishMessage(`Article publié : ${link}`)
      } else {
        const message = data?.message || 'Article publié avec succès sur WordPress.'
        setPublishMessage(message)
      }
    } catch (e: any) {
      setPublishError(e?.message || 'Impossible de publier sur WordPress.')
    } finally {
      setPublishBusy(false)
    }
  }

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
              <span>Mot de passe / Application password</span>
              <input
                type="password"
                placeholder="Mot de passe application"
                value={wpPassword}
                onChange={(e) => setWpPassword(e.target.value)}
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
        </div>
      </main>
    </>
  )
}
