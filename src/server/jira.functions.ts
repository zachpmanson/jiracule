// Server functions: the RPC boundary the client calls. Handlers run only on the
// server and delegate to the server-only Jira client. Types flow through
// end-to-end with no codegen.
import { createServerFn } from '@tanstack/react-start'
import type { CreateIssueInput } from '../types'
import * as jira from './jira.server'

export const getMe = createServerFn({ method: 'GET' }).handler(() => jira.myself())

export const getBoards = createServerFn({ method: 'GET' }).handler(() => jira.listBoards())

export const getBoardColumns = createServerFn({ method: 'GET' })
  .validator((d: { boardId: string }) => d)
  .handler(({ data }) => jira.boardColumns(data.boardId))

export const getBoardIssues = createServerFn({ method: 'GET' })
  .validator((d: { boardId: string }) => d)
  .handler(({ data }) => jira.boardIssues(data.boardId, ''))

export const getIssueDetail = createServerFn({ method: 'GET' })
  .validator((d: { issueKey: string }) => d)
  .handler(({ data }) => jira.getIssueDetail(data.issueKey))

export const createIssue = createServerFn({ method: 'POST' })
  .validator((d: CreateIssueInput) => d)
  .handler(async ({ data }) => {
    const key = await jira.createIssue(data)
    return jira.getIssue(key)
  })

export const deleteIssue = createServerFn({ method: 'POST' })
  .validator((d: { issueKey: string }) => d)
  .handler(({ data }) => jira.deleteIssue(data.issueKey))

export const moveIssue = createServerFn({ method: 'POST' })
  .validator((d: { issueKey: string; boardId: string; targetColumnName: string }) => d)
  .handler(({ data }) => jira.moveIssue(data.issueKey, data.boardId, data.targetColumnName))

export const searchIssues = createServerFn({ method: 'GET' })
  .validator((d: { q: string; boardId?: string }) => d)
  .handler(async ({ data }) => {
    const q = data.q.trim()
    if (!q) return []
    const clauses: string[] = []
    if (data.boardId != null) {
      const boards = await jira.listBoards()
      const key = boards.find((b) => b.id === data.boardId)?.projectKey
      if (key) clauses.push(`project = "${jira.jqlQuote(key)}"`)
    }
    clauses.push(`summary ~ "${jira.jqlQuote(q)}*"`)
    return jira.search(clauses.join(' AND ') + ' ORDER BY updated DESC')
  })
