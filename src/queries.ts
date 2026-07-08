import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreateIssueInput, Issue } from './types'
import {
  addIssueComment,
  createIssue,
  deleteIssue,
  getBoardColumns,
  getBoardIssues,
  getBoards,
  getIssueDetail,
  getMe,
  moveIssue,
  searchIssues,
  updateIssueDescription,
  updateIssueSummary,
} from './server/jira.functions'

export const keys = {
  me: ['me'] as const,
  boards: ['boards'] as const,
  columns: (boardId: string) => ['boards', boardId, 'columns'] as const,
  issues: (boardId: string) => ['boards', boardId, 'issues'] as const,
  issue: (issueKey: string) => ['issue', issueKey] as const,
  search: (q: string, boardId?: string) => ['search', q, boardId] as const,
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.issue(issueKey) })
      // The summary shows on board cards too, so refresh board data.
      qc.invalidateQueries({ queryKey: ['boards'] })
    },
  })
}

export function useAddComment(issueKey: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: string) => addIssueComment({ data: { issueKey, body } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.issue(issueKey) }),
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

export function useSearch(q: string, boardId?: string) {
  return useQuery({
    queryKey: keys.search(q, boardId),
    queryFn: () => searchIssues({ data: { q, boardId } }),
    enabled: q.trim().length > 0,
  })
}
