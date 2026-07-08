import { useEffect, useState } from 'react'
import { useSearch } from '../queries'

// SearchPanel is a debounced text search over the current board's project. The
// committed query `q` lives in the URL (passed in); the text box debounces edits
// back up via onQueryChange so the search is shareable/reload-safe.
export function SearchPanel({
  boardId,
  q,
  onQueryChange,
}: {
  boardId: string
  q: string
  onQueryChange: (q: string) => void
}) {
  const [input, setInput] = useState(q)

  // Reflect external changes to the URL query (e.g. navigation) into the box.
  useEffect(() => setInput(q), [q])

  // Debounce edits into the URL (only when actually changed).
  useEffect(() => {
    if (input === q) return
    const t = setTimeout(() => onQueryChange(input), 300)
    return () => clearTimeout(t)
  }, [input, q, onQueryChange])

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
