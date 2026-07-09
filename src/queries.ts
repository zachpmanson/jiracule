import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryKey,
} from '@tanstack/react-query'
import type { CreateIssueInput, Issue, LanePage } from './types'
import {
  addIssueComment,
  createIssue,
  deleteIssue,
  getAssignableUsers,
  getBoardAssignees,
  getBoardColumns,
  getBoards,
  getIssueDetail,
  getIssueTransitions,
  getLaneIssues,
  getMe,
  moveIssue,
  searchIssues,
  transitionIssue,
  updateIssueAssignee,
  updateIssueDescription,
  updateIssueParent,
  updateIssueSummary,
} from './server/jira.functions'

export const keys = {
  me: ['me'] as const,
  boards: ['boards'] as const,
  columns: (boardId: string) => ['boards', boardId, 'columns'] as const,
  boardAssignees: (projectKey: string) => ['boards', projectKey, 'assignees'] as const,
  // Prefix matching every lane query of a board (for bulk invalidation).
  lanes: (boardId: string) => ['board', boardId, 'lane'] as const,
  // A single lane's paginated issues. statusIds are sorted so the key is stable
  // regardless of column ordering; assigneeId keys the active filter.
  laneIssues: (boardId: string, statusIds: string[], assigneeId?: string) =>
    ['board', boardId, 'lane', [...statusIds].sort().join(','), assigneeId ?? 'all'] as const,
  issue: (issueKey: string) => ['issue', issueKey] as const,
  assignable: (issueKey: string) => ['issue', issueKey, 'assignable'] as const,
  transitions: (issueKey: string) => ['issue', issueKey, 'transitions'] as const,
  search: (q: string, boardId?: string, jql?: boolean) => ['search', q, boardId, jql] as const,
}

// Refresh a single issue's detail plus every board (a mutated field — summary,
// assignee, status — also shows on board cards). Shared by the field-editing
// mutations below so their invalidation can't drift apart.
function invalidateIssueAndBoards(qc: ReturnType<typeof useQueryClient>, issueKey: string) {
  qc.invalidateQueries({ queryKey: keys.issue(issueKey) })
  qc.invalidateQueries({ queryKey: keys.boards })
}

export function useIssueDetail(issueKey: string | null) {
  return useQuery({
    queryKey: keys.issue(issueKey ?? ''),
    queryFn: () => getIssueDetail({ data: { issueKey: issueKey! } }),
    enabled: !!issueKey,
  })
}

export function useUpdateDescription(issueKey: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (description: string) =>
      updateIssueDescription({ data: { issueKey, description } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.issue(issueKey) }),
  })
}

export function useUpdateSummary(issueKey: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (summary: string) => updateIssueSummary({ data: { issueKey, summary } }),
    onSuccess: () => invalidateIssueAndBoards(qc, issueKey),
  })
}

export function useAssignableUsers(issueKey: string | null) {
  return useQuery({
    queryKey: keys.assignable(issueKey ?? ''),
    queryFn: () => getAssignableUsers({ data: { issueKey: issueKey! } }),
    enabled: !!issueKey,
    staleTime: 5 * 60_000,
  })
}

// Reassigns the issue, then refreshes the issue and the board (assignee shows on
// cards and drives the assignee filter).
export function useUpdateAssignee(issueKey: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (accountId: string | null) =>
      updateIssueAssignee({ data: { issueKey, accountId } }),
    onSuccess: () => invalidateIssueAndBoards(qc, issueKey),
  })
}

// Sets (or clears) the issue's parent, then refreshes the issue and the board.
export function useUpdateParent(issueKey: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (parentKey: string | null) => updateIssueParent({ data: { issueKey, parentKey } }),
    onSuccess: () => invalidateIssueAndBoards(qc, issueKey),
  })
}

export function useAddComment(issueKey: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: string) => addIssueComment({ data: { issueKey, body } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.issue(issueKey) }),
  })
}

export function useIssueTransitions(issueKey: string | null) {
  return useQuery({
    queryKey: keys.transitions(issueKey ?? ''),
    queryFn: () => getIssueTransitions({ data: { issueKey: issueKey! } }),
    enabled: !!issueKey,
  })
}

// Applies a specific workflow transition, then refreshes the issue and the
// board (status shows on cards too).
export function useTransitionIssue(issueKey: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (transitionId: string) => transitionIssue({ data: { issueKey, transitionId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.transitions(issueKey) })
      invalidateIssueAndBoards(qc, issueKey)
    },
  })
}

export function useMe() {
  return useQuery({ queryKey: keys.me, queryFn: () => getMe(), staleTime: Infinity })
}

export function useBoards() {
  return useQuery({ queryKey: keys.boards, queryFn: () => getBoards(), staleTime: 5 * 60_000 })
}

export function useBoardColumns(boardId: string) {
  return useQuery({
    queryKey: keys.columns(boardId),
    queryFn: () => getBoardColumns({ data: { boardId } }),
    staleTime: 5 * 60_000,
  })
}

// One lane's issues, paginated. assigneeId (undefined = all) narrows the query
// server-side. Callers flatten `data.pages` for rendering and read the first
// page's `total` for the count badge.
export function useLaneIssues(boardId: string, statusIds: string[], assigneeId?: string) {
  return useInfiniteQuery({
    queryKey: keys.laneIssues(boardId, statusIds, assigneeId),
    queryFn: ({ pageParam }) =>
      getLaneIssues({ data: { boardId, statusIds, assigneeId, cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
}

export function useBoardAssignees(projectKey: string) {
  return useQuery({
    queryKey: keys.boardAssignees(projectKey),
    queryFn: () => getBoardAssignees({ data: { projectKey } }),
    enabled: !!projectKey,
    staleTime: 5 * 60_000,
  })
}

export function useCreateIssue(boardId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateIssueInput) => createIssue({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.lanes(boardId) }),
  })
}

export function useDeleteIssue(boardId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (issueKey: string) => deleteIssue({ data: { issueKey } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.lanes(boardId) }),
  })
}

type LaneData = InfiniteData<LanePage, string | undefined>
type MoveVars = {
  issueKey: string
  issue: Issue
  sourceKey: QueryKey
  targetKey: QueryKey
  targetStatusId: string
}

// Remove an issue from a lane's paged cache, decrementing its total.
function removeFromLane(data: LaneData | undefined, issueKey: string): LaneData | undefined {
  if (!data) return data
  return {
    ...data,
    pages: data.pages.map((p, i) => ({
      ...p,
      issues: p.issues.filter((x) => x.key !== issueKey),
      total: i === 0 && p.total != null ? Math.max(0, p.total - 1) : p.total,
    })),
  }
}

// Prepend an issue to a lane's first page, incrementing its total.
function prependToLane(data: LaneData | undefined, issue: Issue): LaneData | undefined {
  if (!data) return data
  return {
    ...data,
    pages: data.pages.map((p, i) =>
      i === 0
        ? {
            ...p,
            issues: [issue, ...p.issues.filter((x) => x.key !== issue.key)],
            total: p.total != null ? p.total + 1 : p.total,
          }
        : { ...p, issues: p.issues.filter((x) => x.key !== issue.key) },
    ),
  }
}

// How long to wait after a transition before refetching the affected lanes.
// Jira's /search/jql index is eventually consistent; refetching sooner re-reads
// the issue under its pre-transition status and undoes the optimistic move.
const RECONCILE_DELAY_MS = 2500

// Invalidate the source lane (and target, when distinct) so they refetch and
// realign with Jira. Shared by the move mutation's success/error paths.
function reconcile(qc: ReturnType<typeof useQueryClient>, sourceKey: QueryKey, targetKey: QueryKey) {
  qc.invalidateQueries({ queryKey: sourceKey })
  if (JSON.stringify(sourceKey) !== JSON.stringify(targetKey))
    qc.invalidateQueries({ queryKey: targetKey })
}

// Optimistically moves the card from its source lane into the target lane (or
// just flips its status within a pooled lane), rolling back both caches if the
// workflow rejects the transition, then reconciles with a refetch.
export function useMoveIssue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ issueKey, targetStatusId }: MoveVars) =>
      moveIssue({ data: { issueKey, targetStatusId } }),
    onMutate: async ({ issueKey, issue, sourceKey, targetKey, targetStatusId }: MoveVars) => {
      const sameLane = JSON.stringify(sourceKey) === JSON.stringify(targetKey)
      await qc.cancelQueries({ queryKey: sourceKey })
      const prevSource = qc.getQueryData<LaneData>(sourceKey)
      const moved = { ...issue, statusId: targetStatusId }
      if (sameLane) {
        // Status changes but the card stays in the same (pooled) lane.
        qc.setQueryData<LaneData>(sourceKey, (d) =>
          d
            ? {
                ...d,
                pages: d.pages.map((p) => ({
                  ...p,
                  issues: p.issues.map((x) => (x.key === issueKey ? moved : x)),
                })),
              }
            : d,
        )
        return { prevSource, prevTarget: undefined, sourceKey, targetKey }
      }
      await qc.cancelQueries({ queryKey: targetKey })
      const prevTarget = qc.getQueryData<LaneData>(targetKey)
      qc.setQueryData<LaneData>(sourceKey, (d) => removeFromLane(d, issueKey))
      qc.setQueryData<LaneData>(targetKey, (d) => prependToLane(d, moved))
      return { prevSource, prevTarget, sourceKey, targetKey }
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx) return
      if (ctx.prevSource) qc.setQueryData(ctx.sourceKey, ctx.prevSource)
      if (ctx.prevTarget) qc.setQueryData(ctx.targetKey, ctx.prevTarget)
      // A failed move: reconcile immediately so the rolled-back caches match Jira.
      reconcile(qc, ctx.sourceKey, ctx.targetKey)
    },
    onSuccess: (_data, _vars, ctx) => {
      // The optimistic caches already reflect the move. Jira's /search/jql index
      // is eventually consistent and lags a transition by up to a few seconds, so
      // refetching *now* would re-read the issue under its old status and snap the
      // card back into the source lane. Wait for the index to catch up, then
      // reconcile (ordering, totals, any status Jira routed the transition to).
      setTimeout(() => reconcile(qc, ctx.sourceKey, ctx.targetKey), RECONCILE_DELAY_MS)
    },
  })
}

export function useSearch(q: string, boardId?: string, jql?: boolean) {
  return useQuery({
    queryKey: keys.search(q, boardId, jql),
    queryFn: () => searchIssues({ data: { q, boardId, jql } }),
    enabled: q.trim().length > 0,
    // JQL is easy to get wrong; don't hammer Jira with retries on a 400.
    retry: false,
  })
}
