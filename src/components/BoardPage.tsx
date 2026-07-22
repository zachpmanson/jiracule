import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import {
  keys,
  useBoardAssignees,
  useBoardColumns,
  useBoards,
  useDeleteIssue,
  useMe,
  useSearch,
} from '../queries'
import { Board } from './Board'
import { SearchHitContext } from './Card'
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
  const qc = useQueryClient()

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
  // The open issue lives in the URL so the back button closes the modal (and a
  // reload/share reopens it). Pushed (not replaced) so it's its own history entry.
  const openIssueKey = search.issue ?? null
  const setOpenIssueKey = (key: string | null) =>
    navigate({ search: (p) => ({ ...p, issue: key ?? undefined }) })

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

  // While the detail modal is open it owns focus-refetching (see IssueDetailModal);
  // the board only refetches on window focus when no modal is open. Refetches the
  // lanes so cards reflect changes made in another tab/window while we were away.
  useEffect(() => {
    if (openIssueKey) return
    function onFocus() {
      qc.invalidateQueries({ queryKey: keys.lanes(boardId) })
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [openIssueKey, boardId, qc])

  // When the modal closes, refetch the lanes: the issue may have been edited in
  // the panel (status/assignee/etc.) and the board's focus-refetch was suppressed
  // while it was open. Only fires on the open→closed transition, not on mount.
  const prevOpenIssueKey = useRef(openIssueKey)
  useEffect(() => {
    if (prevOpenIssueKey.current && !openIssueKey) {
      qc.invalidateQueries({ queryKey: keys.lanes(boardId) })
    }
    prevOpenIssueKey.current = openIssueKey
  }, [openIssueKey, boardId, qc])

  const assignees = assigneesQ.data ?? []

  // Result keys of the active search (shares the panel's cached query). Cards on
  // the board whose key matches are ringed green — visible only for the results
  // that happen to be on the board.
  const searchResults = useSearch(query, boardId, jqlMode)
  const searchHits = useMemo(
    () => new Set((searchResults.data ?? []).map((i) => i.key)),
    [searchResults.data],
  )

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

      <SearchHitContext.Provider value={searchHits}>
        <Board
          boardId={boardId}
          columns={columnsQ.data ?? []}
          assigneeId={assigneeId}
          onDelete={handleDelete}
          onOpen={setOpenIssueKey}
        />
      </SearchHitContext.Provider>

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
