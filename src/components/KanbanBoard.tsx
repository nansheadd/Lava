import React, { useEffect, useMemo, useRef, useState } from 'react'

type KanbanColumnId = 'facile' | 'moyen' | 'difficile' | 'non-classe'

type KanbanRow = {
  ID?: string
  Titre?: string
  Labels?: string
  Description?: string
  ExplicationNonTech?: string
  CriteresAcceptation?: string
  Dependances?: string
  WPFeature?: string
  PluginsExtensionsWP?: string
  Difficulte?: string
  Couche?: string
}

type KanbanItem = {
  id: string
  title: string
  labels: string[]
  description: string
  explanation: string
  acceptance: string
  dependencies: string
  feature: string
  plugins: string
  difficulty: string
  layer: string
  status: KanbanColumnId
}

type KanbanBoardProps = {
  csvUrl: string
  title: string
}

type CsvRow = string[]

function parseCsv(text: string): CsvRow[] {
  const rows: CsvRow[] = []
  let current: string[] = []
  let value = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        const next = text[i + 1]
        if (next === '"') {
          value += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        value += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === ',') {
        current.push(value)
        value = ''
      } else if (char === '\r') {
        continue
      } else if (char === '\n') {
        current.push(value)
        rows.push(current)
        current = []
        value = ''
      } else {
        value += char
      }
    }
  }

  current.push(value)
  rows.push(current)

  return rows.filter(row => row.length > 1 || (row[0] && row[0].trim() !== ''))
}

function parseCsvWithHeader(text: string): KanbanRow[] {
  const rows = parseCsv(text)
  if (!rows.length) return []
  const headers = rows[0].map(header => header.trim())
  const items: KanbanRow[] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const record: KanbanRow = {}
    headers.forEach((header, index) => {
      const value = row[index] ?? ''
      ;(record as Record<string, string>)[header] = value.trim()
    })
    items.push(record)
  }
  return items
}

const columns: { id: KanbanColumnId; title: string; accent: string }[] = [
  { id: 'facile', title: 'Facile', accent: '#22c55e' },
  { id: 'moyen', title: 'Moyen', accent: '#eab308' },
  { id: 'difficile', title: 'Difficile', accent: '#f97316' },
  { id: 'non-classe', title: 'À trier', accent: '#94a3b8' },
]

function normaliseDifficulty(value: string | undefined): KanbanColumnId {
  if (!value) return 'non-classe'
  const lower = value.trim().toLowerCase()
  if (lower.startsWith('fac')) return 'facile'
  if (lower.startsWith('moy')) return 'moyen'
  if (lower.startsWith('dif')) return 'difficile'
  return 'non-classe'
}

function parseLabels(raw?: string): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map(label => label.replace(/\[|\]|"|'/g, '').trim())
    .filter(Boolean)
}

function parseDependencies(raw?: string): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map(dep => dep.trim())
    .filter(Boolean)
}

function buildItem(row: KanbanRow): KanbanItem | null {
  const id = row.ID?.trim()
  const title = row.Titre?.trim()
  if (!id || !title) return null
  const status = normaliseDifficulty(row.Difficulte)

  return {
    id,
    title,
    labels: parseLabels(row.Labels),
    description: row.Description?.trim() || '',
    explanation: row.ExplicationNonTech?.trim() || '',
    acceptance: row.CriteresAcceptation?.trim() || '',
    dependencies: parseDependencies(row.Dependances).join(', '),
    feature: row.WPFeature?.trim() || '',
    plugins: row.PluginsExtensionsWP?.trim() || '',
    difficulty: row.Difficulte?.trim() || '',
    layer: row.Couche?.trim() || '',
    status,
  }
}

export default function KanbanBoard({ csvUrl, title }: KanbanBoardProps) {
  const [items, setItems] = useState<KanbanItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [activeColumn, setActiveColumn] = useState<KanbanColumnId | null>(null)
  const initialItemsRef = useRef<KanbanItem[]>([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const res = await fetch(csvUrl)
        if (!res.ok) throw new Error(`Impossible de charger le CSV (${res.status})`)
        const text = await res.text()
        if (cancelled) return
        const parsed = parseCsvWithHeader(text)
        const mapped = parsed
          .map(buildItem)
          .filter((item): item is KanbanItem => Boolean(item))

        initialItemsRef.current = mapped.map(item => ({ ...item }))
        setItems(mapped)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erreur inconnue lors du chargement du CSV.'
        setError(message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [csvUrl])

  const grouped = useMemo(() => {
    return columns.map(column => ({
      ...column,
      items: items.filter(item => item.status === column.id),
    }))
  }, [items])

  function handleDrop(ev: React.DragEvent<HTMLDivElement>, columnId: KanbanColumnId) {
    ev.preventDefault()
    const droppedId = ev.dataTransfer.getData('text/plain')
    if (!droppedId) return
    setItems(prev =>
      prev.map(item =>
        item.id === droppedId
          ? {
              ...item,
              status: columnId,
            }
          : item,
      ),
    )
    setActiveColumn(null)
  }

  function handleDragOver(ev: React.DragEvent<HTMLDivElement>, columnId: KanbanColumnId) {
    ev.preventDefault()
    if (activeColumn !== columnId) setActiveColumn(columnId)
  }

  function handleDragLeave() {
    setActiveColumn(null)
  }

  function handleDragStart(ev: React.DragEvent<HTMLElement>, itemId: string) {
    ev.dataTransfer.setData('text/plain', itemId)
    ev.dataTransfer.effectAllowed = 'move'
    setDraggingId(itemId)
  }

  function handleDragEnd() {
    setDraggingId(null)
    setActiveColumn(null)
  }

  function resetBoard() {
    setItems(initialItemsRef.current.map(item => ({ ...item })))
  }

  return (
    <div className="kanban-board">
      <div className="kanban-board__header">
        <div>
          <h3 className="kanban-board__title">{title}</h3>
          {loading && <p className="kanban-board__status">Chargement…</p>}
          {error && <p className="kanban-board__status error">{error}</p>}
        </div>
        <button className="button outline" onClick={resetBoard} disabled={loading}>
          Réinitialiser
        </button>
      </div>

      <div className="kanban-columns">
        {grouped.map(column => (
          <div
            key={column.id}
            className={`kanban-column${activeColumn === column.id ? ' drag-over' : ''}`}
            onDragOver={ev => handleDragOver(ev, column.id)}
            onDrop={ev => handleDrop(ev, column.id)}
            onDragLeave={handleDragLeave}
            aria-label={`Colonne ${column.title}`}
          >
            <header className="kanban-column__header" style={{ borderBottomColor: column.accent }}>
              <span>{column.title}</span>
              <span className="kanban-column__count">{column.items.length}</span>
            </header>
            <div className="kanban-column__body">
              {column.items.map(item => (
                <article
                  key={item.id}
                  className={`kanban-card${draggingId === item.id ? ' dragging' : ''}`}
                  draggable
                  onDragStart={ev => handleDragStart(ev, item.id)}
                  onDragEnd={handleDragEnd}
                >
                  <div className="kanban-card__id">{item.id}</div>
                  <h4 className="kanban-card__title">{item.title}</h4>
                  <div className="kanban-card__meta">
                    {item.difficulty && <span className="kanban-tag">{item.difficulty}</span>}
                    {item.layer && <span className="kanban-tag">{item.layer}</span>}
                  </div>
                  {item.labels.length > 0 && (
                    <div className="kanban-card__labels">
                      {item.labels.map(label => (
                        <span key={label} className="kanban-label">
                          {label}
                        </span>
                      ))}
                    </div>
                  )}
                  {item.description && <p className="kanban-card__text">{item.description}</p>}
                  {item.explanation && (
                    <details className="kanban-card__details">
                      <summary>Explication</summary>
                      <p>{item.explanation}</p>
                    </details>
                  )}
                  {item.acceptance && (
                    <details className="kanban-card__details">
                      <summary>Critères d’acceptation</summary>
                      <p>{item.acceptance}</p>
                    </details>
                  )}
                  {(item.dependencies || item.feature || item.plugins) && (
                    <div className="kanban-card__extra">
                      {item.dependencies && (
                        <p>
                          <strong>Dépendances :</strong> {item.dependencies}
                        </p>
                      )}
                      {item.feature && (
                        <p>
                          <strong>WP Feature :</strong> {item.feature}
                        </p>
                      )}
                      {item.plugins && (
                        <p>
                          <strong>Plugins :</strong> {item.plugins}
                        </p>
                      )}
                    </div>
                  )}
                </article>
              ))}
              {column.items.length === 0 && !loading && (
                <p className="kanban-column__empty">Aucune carte</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
