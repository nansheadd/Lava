import React, { useState } from 'react'

type ConvertResponse = {
  markdown: string
  html: string
  engine: string
  stats: Record<string, any>
}

export default function App() {
  const [md, setMd] = useState('')
  const [html, setHtml] = useState('')
  const [engine, setEngine] = useState('')
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<'md'|'html'>('md')
  const [error, setError] = useState('')

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
      </main>
    </>
  )
}
