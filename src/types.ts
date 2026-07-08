// Shared, client-safe domain types. No server-only imports here so this file is
// safe to import from both server functions and browser components.

export interface User {
  accountId: string
  displayName: string
  email?: string
  avatarUrl?: string
}

export interface Board {
  // Opaque key that also encodes the board kind: `agile-<boardId>` for a Jira
  // Software Agile board, or `project-<projectId>` for a non-software (e.g. Jira
  // Work Management "business") project surfaced as a status-column board.
  id: string
  name: string
  type: string
  projectKey?: string
  projectName?: string
}

export interface StatusRef {
  id: string
  name: string
}

export interface Column {
  name: string
  statusIds: string[]
  // Named statuses within the column. When more than one, the UI renders them as
  // stacked lanes (e.g. a "Done" column holding both Done and Abandoned). Absent
  // for Agile boards, whose columns pool their mapped statuses without stacking.
  statuses?: StatusRef[]
}

export interface Assignee {
  accountId: string
  displayName: string
  avatarUrl?: string
}

export interface Issue {
  key: string
  summary: string
  statusId: string
  statusName: string
  issueType?: string
  issueTypeIconUrl?: string
  priority?: string
  assignee?: Assignee
}

// A run of inline text; `href` set means it should render as a link.
export interface InlineSegment {
  text: string
  href?: string
}

export interface Comment {
  id: string
  author?: Assignee
  body: InlineSegment[]
  created?: string
  updated?: string
}

export interface IssueDetail extends Issue {
  description: InlineSegment[]
  reporter?: Assignee
  labels: string[]
  created?: string
  updated?: string
  browseUrl?: string
  comments: Comment[]
}

export interface Transition {
  id: string
  name: string
  toStatusId: string
  toStatusName?: string
}

export interface CreateIssueInput {
  projectKey: string
  issueType: string
  summary: string
  description?: string
  assigneeId?: string
}
