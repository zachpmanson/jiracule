import { useEffect, useState } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import {
  useBoardAssignees,
  useBoardColumns,
  useBoards,
  useDeleteIssue,
  useMe,
} from '../queries'
import { Board } from './Board'
import { CreateIssueDialog } from './CreateIssueDialog'
import { InlineError } from './InlineError'
import { IssueDetailModal } from './IssueDetailModal'
import { SearchPanel } from './SearchPanel'
import { errMsg } from '../util'

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
  const assigneesQ = useBoardAssignees(board?.projectKey ?? '')
  const del = useDeleteIssue(boardId)

  // Filters live in the URL so they persist across reloads and are shareable.
  const assigneeFilter = search.assignee ?? ALL
  const setAssigneeFilter = (value: string) =>
    navigate({ search: (p) => ({ ...p, assignee: value === ALL ? undefined : value }), replace: true })
  // The search query is ephemeral UI state — no need to persist it in the URL.
  const [query, setQuery] = useState('')
  const jqlMode = search.jql ?? false
  const setJqlMode = (on: boolean) =>
    navigate({ search: (p) => ({ ...p, jql: on || undefined }), replace: true })

  // Resolve the URL filter into the accountId the lane queries filter by
  // server-side (undefined = no filter). "Me" waits on the current user.
  const assigneeId =
    assigneeFilter === ALL ? undefined : assigneeFilter === MINE ? me?.accountId : assigneeFilter

  const [creating, setCreating] = useState(false)
  const [openIssueKey, setOpenIssueKey] = useState<string | null>(null)

  // Reflect the current board's name in the document title, restoring the
  // default on unmount. Board data is fetched client-side, so this can't live
  // in the route's static `head`.
  useEffect(() => {
    if (!board?.name) return
    document.title = `${board.name} · jiracule`
    return () => {
      document.title = 'jiracule'
    }
  }, [board?.name])

  const assignees = assigneesQ.data ?? []

  function handleDelete(key: string) {
    if (window.confirm(`Delete ${key}? This cannot be undone.`)) del.mutate(key)
  }

  // Lanes own their own loading/error now, so the board only waits on columns.
  if (columnsQ.isLoading) return <div className="placeholder">Loading board…</div>
  if (columnsQ.error) return <div className="placeholder error">{errMsg(columnsQ.error)}</div>

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
        <SearchPanel
          boardId={boardId}
          q={query}
          jql={jqlMode}
          onQueryChange={setQuery}
          onJqlChange={setJqlMode}
          onOpen={setOpenIssueKey}
        />
        <InlineError error={del.error} />
        <button className="primary" onClick={() => setCreating(true)}>
          + New
        </button>
      </div>

      <Board
        boardId={boardId}
        columns={columnsQ.data ?? []}
        assigneeId={assigneeId}
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
          boardId={boardId}
          onClose={() => setOpenIssueKey(null)}
          onDelete={handleDelete}
          onOpen={setOpenIssueKey}
        />
      )}
    </div>
  )
}
