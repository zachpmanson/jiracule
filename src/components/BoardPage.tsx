import { useMemo, useState } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import type { Assignee } from '../types'
import {
  useBoardColumns,
  useBoardIssues,
  useBoards,
  useDeleteIssue,
  useMe,
} from '../queries'
import { Board } from './Board'
import { CreateIssueDialog } from './CreateIssueDialog'
import { IssueDetailModal } from './IssueDetailModal'
import { SearchPanel } from './SearchPanel'

const ALL = 'all'
const MINE = 'me'

const routeApi = getRouteApi('/board/$boardId')

export function BoardPage() {
  const { boardId } = routeApi.useParams()
  const search = routeApi.useSearch()
  const navigate = routeApi.useNavigate()

  const { data: me } = useMe()
  const { data: boards } = useBoards()
  const board = boards?.find((b) => b.id === boardId)
  const columnsQ = useBoardColumns(boardId)
  const issuesQ = useBoardIssues(boardId)
  const del = useDeleteIssue(boardId)

  // Filters live in the URL so they persist across reloads and are shareable.
  const assigneeFilter = search.assignee ?? ALL
  const setAssigneeFilter = (value: string) =>
    navigate({ search: (p) => ({ ...p, assignee: value === ALL ? undefined : value }), replace: true })
  const setQuery = (q: string) =>
    navigate({ search: (p) => ({ ...p, q: q || undefined }), replace: true })

  const [creating, setCreating] = useState(false)
  const [openIssueKey, setOpenIssueKey] = useState<string | null>(null)

  const issues = issuesQ.data ?? []

  // Unique assignees present on the board, for the filter dropdown.
  const assignees = useMemo(() => {
    const map = new Map<string, Assignee>()
    for (const i of issues) if (i.assignee) map.set(i.assignee.accountId, i.assignee)
    return [...map.values()].sort((a, b) => a.displayName.localeCompare(b.displayName))
  }, [issues])

  const filtered = useMemo(() => {
    if (assigneeFilter === ALL) return issues
    if (assigneeFilter === MINE)
      return issues.filter((i) => i.assignee?.accountId === me?.accountId)
    return issues.filter((i) => i.assignee?.accountId === assigneeFilter)
  }, [issues, assigneeFilter, me])

  function handleDelete(key: string) {
    if (window.confirm(`Delete ${key}? This cannot be undone.`)) del.mutate(key)
  }

  if (columnsQ.isLoading || issuesQ.isLoading)
    return <div className="placeholder">Loading board…</div>
  const err = columnsQ.error ?? issuesQ.error
  if (err) return <div className="placeholder error">{(err as Error).message}</div>

  return (
    <div className="board-page">
      <div className="toolbar">
        <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
          <option value={ALL}>All assignees</option>
          {me && <option value={MINE}>Assigned to me</option>}
          {assignees.map((a) => (
            <option key={a.accountId} value={a.accountId}>
              {a.displayName}
            </option>
          ))}
        </select>
        <SearchPanel boardId={boardId} q={search.q ?? ''} onQueryChange={setQuery} />
        <div className="spacer" />
        {del.isError && <span className="inline-error">{(del.error as Error).message}</span>}
        <button className="primary" onClick={() => setCreating(true)}>
          + New
        </button>
      </div>

      <Board
        boardId={boardId}
        columns={columnsQ.data ?? []}
        issues={filtered}
        onDelete={handleDelete}
        onOpen={setOpenIssueKey}
      />

      {creating && (
        <CreateIssueDialog
          boardId={boardId}
          defaultProjectKey={board?.projectKey ?? ''}
          assignees={assignees}
          onClose={() => setCreating(false)}
        />
      )}

      {openIssueKey && (
        <IssueDetailModal
          issueKey={openIssueKey}
          onClose={() => setOpenIssueKey(null)}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}
