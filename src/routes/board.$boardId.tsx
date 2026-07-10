import { createFileRoute } from '@tanstack/react-router'
import { BoardPage } from '../components/BoardPage'

export interface BoardSearch {
  // 'all' | 'me' | <accountId>; assignee filter, persisted in the URL
  assignee?: string
  // when true, the search box is treated as raw JQL instead of a summary text match
  jql?: boolean
  // the currently open issue's key; in the URL so the back button closes/reopens
  // the detail modal and the open issue survives a reload.
  issue?: string
}

export const Route = createFileRoute('/board/$boardId')({
  validateSearch: (search: Record<string, unknown>): BoardSearch => ({
    assignee: typeof search.assignee === 'string' ? search.assignee : undefined,
    jql: search.jql === true || search.jql === 'true' ? true : undefined,
    issue: typeof search.issue === 'string' ? search.issue : undefined,
  }),
  component: BoardPage,
})
