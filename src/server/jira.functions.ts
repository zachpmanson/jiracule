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

export const getBoardIssues = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: { boardId: string }) => d)
  .handler(({ data, context }) => jira.boardIssues(context.jira, data.boardId, ''))

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

export const addIssueComment = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((d: { issueKey: string; body: string }) => d)
  .handler(({ data, context }) => jira.addComment(context.jira, data.issueKey, data.body))

export const moveIssue = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((d: { issueKey: string; targetStatusId: string }) => d)
  .handler(({ data, context }) => jira.moveIssue(context.jira, data.issueKey, data.targetStatusId))

export const searchIssues = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: { q: string; boardId?: string }) => d)
  .handler(async ({ data, context }) => {
    const q = data.q.trim()
    if (!q) return []
    const clauses: string[] = []
    if (data.boardId != null) {
      const boards = await jira.listBoards(context.jira)
      const key = boards.find((b) => b.id === data.boardId)?.projectKey
      if (key) clauses.push(`project = "${jira.jqlQuote(key)}"`)
    }
    clauses.push(`summary ~ "${jira.jqlQuote(q)}*"`)
    return jira.search(context.jira, clauses.join(' AND ') + ' ORDER BY updated DESC')
  })
