import { useEffect, useState } from 'react'
import { useSearch } from '../queries'

// SearchPanel is a debounced text search over the current board's project,
// exercising the /api/search endpoint (JQL under the hood). Results show as a
// dropdown list; v1 has no detail view.
export function SearchPanel({ boardId }: { boardId: string }) {
  const [input, setInput] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setQ(input), 300)
    return () => clearTimeout(t)
  }, [input])

  const { data: results, isFetching } = useSearch(q, boardId)
  const open = q.trim().length > 0

  return (
    <div className="search">
      <input
        type="search"
        placeholder="Search issues…"
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />
      {open && (
        <div className="search-results">
          {isFetching && <div className="search-item muted">Searching…</div>}
          {!isFetching && results?.length === 0 && (
            <div className="search-item muted">No matches</div>
          )}
          {results?.map((i) => (
            <div key={i.key} className="search-item">
              <span className="card-key">{i.key}</span>
              <span className="search-summary">{i.summary}</span>
              <span className="muted">{i.statusName}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
