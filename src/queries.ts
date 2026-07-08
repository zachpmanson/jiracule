import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreateIssueInput, Issue } from './types'
import {
  addIssueComment,
  createIssue,
  deleteIssue,
  getAssignableUsers,
  getBoardColumns,
  getBoardIssues,
  getBoards,
  getIssueDetail,
  getIssueTransitions,
  getMe,
  moveIssue,
  searchIssues,
  transitionIssue,
  updateIssueAssignee,
  updateIssueDescription,
  updateIssueSummary,
} from './server/jira.functions'

export const keys = {
  me: ['me'] as const,
  boards: ['boards'] as const,
  columns: (boardId: string) => ['boards', boardId, 'columns'] as const,
  issues: (boardId: string) => ['boards', boardId, 'issues'] as const,
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

export function useBoardIssues(boardId: string) {
  return useQuery({
    queryKey: keys.issues(boardId),
    queryFn: () => getBoardIssues({ data: { boardId } }),
  })
}

export function useCreateIssue(boardId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateIssueInput) => createIssue({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.issues(boardId) }),
  })
}

export function useDeleteIssue(boardId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (issueKey: string) => deleteIssue({ data: { issueKey } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.issues(boardId) }),
  })
}

type MoveVars = { issueKey: string; targetStatusId: string }

// Optimistically moves the card to the target status, rolling back if the
// workflow rejects the transition, then reconciles with a refetch.
export function useMoveIssue(boardId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ issueKey, targetStatusId }: MoveVars) =>
      moveIssue({ data: { issueKey, targetStatusId } }),
    onMutate: async ({ issueKey, targetStatusId }: MoveVars) => {
      await qc.cancelQueries({ queryKey: keys.issues(boardId) })
      const prev = qc.getQueryData<Issue[]>(keys.issues(boardId))
      if (prev) {
        qc.setQueryData<Issue[]>(
          keys.issues(boardId),
          prev.map((i) => (i.key === issueKey ? { ...i, statusId: targetStatusId } : i)),
        )
      }
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(keys.issues(boardId), ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.issues(boardId) }),
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
