// Server functions: the RPC boundary the client calls. Each runs the auth
// middleware (which resolves the OAuth session into `context.jira`) and delegates
// to the server-only Jira client. Types flow through end-to-end with no codegen.
import { createServerFn } from '@tanstack/react-start'
import type { CreateIssueInput } from '../types'
import { authMiddleware } from './auth.middleware'
import * as jira from './jira.server'

export const getMe = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(({ context }) => jira.myself(context.jira))

export const getBoards = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(({ context }) => jira.listBoards(context.jira))

export const getBoardColumns = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: { boardId: string }) => d)
  .handler(({ data, context }) => jira.boardColumns(context.jira, data.boardId))

export const getLaneIssues = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: { boardId: string; statusIds: string[]; assigneeId?: string; cursor?: string }) => d)
  .handler(({ data, context }) =>
    jira.laneIssues(context.jira, data.boardId, data.statusIds, data.assigneeId, data.cursor),
  )

export const getBoardAssignees = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: { projectKey: string }) => d)
  .handler(({ data, context }) => jira.boardAssignees(context.jira, data.projectKey))

export const getProjectIssueTypes = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: { projectKey: string }) => d)
  .handler(({ data, context }) => jira.projectIssueTypes(context.jira, data.projectKey))

export const getIssueDetail = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: { issueKey: string }) => d)
  .handler(({ data, context }) => jira.getIssueDetail(context.jira, data.issueKey))

export const createIssue = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((d: CreateIssueInput) => d)
  .handler(async ({ data, context }) => {
    const key = await jira.createIssue(context.jira, data)
    return jira.getIssue(context.jira, key)
  })

export const deleteIssue = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((d: { issueKey: string }) => d)
  .handler(({ data, context }) => jira.deleteIssue(context.jira, data.issueKey))

export const updateIssueDescription = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((d: { issueKey: string; description: string }) => d)
  .handler(({ data, context }) =>
    jira.updateIssueDescription(context.jira, data.issueKey, data.description),
  )

export const updateIssueSummary = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((d: { issueKey: string; summary: string }) => d)
  .handler(({ data, context }) => jira.updateIssueSummary(context.jira, data.issueKey, data.summary))

export const getAssignableUsers = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: { issueKey: string }) => d)
  .handler(({ data, context }) => jira.assignableUsers(context.jira, data.issueKey))

export const updateIssueAssignee = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((d: { issueKey: string; accountId: string | null }) => d)
  .handler(async ({ data, context }) => {
    await jira.updateIssueAssignee(context.jira, data.issueKey, data.accountId)
    return jira.getIssue(context.jira, data.issueKey)
  })

export const updateIssueParent = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((d: { issueKey: string; parentKey: string | null }) => d)
  .handler(async ({ data, context }) => {
    await jira.updateIssueParent(context.jira, data.issueKey, data.parentKey)
    return jira.getIssue(context.jira, data.issueKey)
  })

export const addIssueComment = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((d: { issueKey: string; body: string }) => d)
  .handler(({ data, context }) => jira.addComment(context.jira, data.issueKey, data.body))

export const moveIssue = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((d: { issueKey: string; targetStatusId: string }) => d)
  .handler(({ data, context }) => jira.moveIssue(context.jira, data.issueKey, data.targetStatusId))

export const getIssueTransitions = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: { issueKey: string }) => d)
  .handler(({ data, context }) => jira.transitions(context.jira, data.issueKey))

export const transitionIssue = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((d: { issueKey: string; transitionId: string }) => d)
  .handler(async ({ data, context }) => {
    await jira.doTransition(context.jira, data.issueKey, data.transitionId)
    return jira.getIssue(context.jira, data.issueKey)
  })

export const searchIssues = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: { q: string; boardId?: string; jql?: boolean }) => d)
  .handler(async ({ data, context }) => {
    const q = data.q.trim()
    if (!q) return []
    // JQL mode: the input is a complete query the user controls, so pass it
    // through verbatim (no project scoping, no summary wrapping).
    if (data.jql) return jira.search(context.jira, q)
    const clauses: string[] = []
    if (data.boardId != null) {
      const boards = await jira.listBoards(context.jira)
      const key = boards.find((b) => b.id === data.boardId)?.projectKey
      if (key) clauses.push(`project = "${jira.jqlQuote(key)}"`)
    }
    clauses.push(`summary ~ "${jira.jqlQuote(q)}*"`)
    return jira.search(context.jira, clauses.join(' AND ') + ' ORDER BY updated DESC')
  })
