import { useEffect, useState } from 'react'
import type { Assignee } from '../types'
import { useCreateIssue, useSearch } from '../queries'
import { InlineError } from './InlineError'

export function CreateIssueDialog({
  boardId,
  defaultProjectKey,
  assignees,
  onClose,
}: {
  boardId: string
  defaultProjectKey: string
  assignees: Assignee[]
  onClose: () => void
}) {
  const create = useCreateIssue(boardId)
  const [projectKey, setProjectKey] = useState(defaultProjectKey)
  const [issueType, setIssueType] = useState('Task')
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [parent, setParent] = useState<{ key: string; summary: string } | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!projectKey.trim() || !summary.trim()) return
    create.mutate(
      {
        projectKey: projectKey.trim(),
        issueType: issueType.trim() || 'Task',
        summary: summary.trim(),
        description: description.trim() || undefined,
        assigneeId: assigneeId || undefined,
        parentKey: parent?.key,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal modal-create" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>New issue</h2>
        <label>
          Project key
          <input value={projectKey} onChange={(e) => setProjectKey(e.target.value)} required />
        </label>
        <label>
          Issue type
          <input value={issueType} onChange={(e) => setIssueType(e.target.value)} />
        </label>
        <label>
          Summary
          <input value={summary} onChange={(e) => setSummary(e.target.value)} autoFocus required />
        </label>
        <label>
          Description
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </label>
        <label>
          Assignee
          <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">Unassigned</option>
            {assignees.map((a) => (
              <option key={a.accountId} value={a.accountId}>
                {a.displayName}
              </option>
            ))}
          </select>
        </label>
        <div className="create-parent">
          <span className="create-parent-label">Parent</span>
          <ParentField boardId={boardId} parent={parent} onChange={setParent} />
        </div>
        <InlineError error={create.error} />
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  )
}

// Debounced search-and-select for an optional parent issue. When a parent is
// chosen it shows a chip with a clear button; otherwise a search box scoped to
// the current board's project. Mirrors the detail modal's ParentPicker.
function ParentField({
  boardId,
  parent,
  onChange,
}: {
  boardId: string
  parent: { key: string; summary: string } | null
  onChange: (p: { key: string; summary: string } | null) => void
}) {
  const [input, setInput] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    if (input === q) return
    const t = setTimeout(() => setQ(input), 300)
    return () => clearTimeout(t)
  }, [input, q])

  const { data: results, isFetching } = useSearch(q, boardId, false)
  const open = q.trim().length > 0

  if (parent) {
    return (
      <div className="parent-row">
        <span className="parent-chip">
          <span className="card-key">{parent.key}</span>
          {parent.summary && <span className="parent-summary">{parent.summary}</span>}
        </span>
        <button type="button" className="link-btn" onClick={() => onChange(null)}>
          Clear
        </button>
      </div>
    )
  }

  return (
    <div className="parent-picker">
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
            <button
              key={i.key}
              type="button"
              className="search-item"
              onClick={() => {
                onChange({ key: i.key, summary: i.summary })
                setInput('')
                setQ('')
              }}
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
