import { useEffect, useState } from 'react'
import { useSearch } from '../queries'
import { errMsg } from '../util'

// SearchPanel is a debounced search over the current board's project. In the
// default mode it matches issue summaries; with the JQL toggle on, the input is
// sent to Jira as a raw JQL query. The committed query `q` is ephemeral UI state
// held by the parent; the `jql` flag lives in the URL so the mode is shareable.
export function SearchPanel({
  boardId,
  q,
  jql,
  onQueryChange,
  onJqlChange,
  onOpen,
}: {
  boardId: string
  q: string
  jql: boolean
  onQueryChange: (q: string) => void
  onJqlChange: (jql: boolean) => void
  onOpen: (issueKey: string) => void
}) {
  const [input, setInput] = useState(q)

  // Reflect external resets of the committed query into the box.
  useEffect(() => setInput(q), [q])

  // Debounce edits into the committed query (only when actually changed).
  useEffect(() => {
    if (input === q) return
    const t = setTimeout(() => onQueryChange(input), 600)
    return () => clearTimeout(t)
  }, [input, q, onQueryChange])

  const { data: results, isFetching, error } = useSearch(q, boardId, jql)
  const open = q.trim().length > 0

  return (
    <div className="search">
      <div className="search-box">
        <input
          type="search"
          placeholder={jql ? 'JQL, e.g. status = "In Progress" ORDER BY updated DESC' : 'Search issues…'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <label className="jql-toggle" title="Treat the query as raw JQL">
          <input type="checkbox" checked={jql} onChange={(e) => onJqlChange(e.target.checked)} />
          JQL
        </label>
      </div>
      {open && (
        <div className="search-results">
          {isFetching && <div className="search-item muted">Searching…</div>}
          {!isFetching && error && (
            <div className="search-item error">{errMsg(error)}</div>
          )}
          {!isFetching && !error && results?.length === 0 && (
            <div className="search-item muted">No matches</div>
          )}
          {results?.map((i) => (
            <button
              key={i.key}
              type="button"
              className="search-item"
              onClick={() => onOpen(i.key)}
            >
              <span className="card-key">{i.key}</span>
              <span className="search-summary">{i.summary}</span>
              <span className="muted">{i.statusName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
