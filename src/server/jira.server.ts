// Server-only Jira Cloud client. This module must only ever be imported from
// inside server-function handlers. Requests are authenticated per-user via the
// OAuth access token in `JiraAuth` and go through the OAuth API base
// (api.atlassian.com/ex/jira/{cloudId}). The build keeps it out of the client
// bundle.
import type {
  Assignee,
  Board,
  Column,
  Comment,
  CreateIssueInput,
  InlineSegment,
  Issue,
  IssueDetail,
  StatusRef,
  Transition,
  User,
} from '../types'
import type { JiraAuth } from './session.server'

export type { JiraAuth }

export class JiraError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function jiraFetch<T>(
  auth: JiraAuth,
  method: string,
  path: string,
  body?: unknown,
): Promise<T | undefined> {
  const res = await fetch(`https://api.atlassian.com/ex/jira/${auth.cloudId}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${auth.token}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    throw new JiraError(await parseError(res), res.status)
  }
  if (res.status === 204) return undefined
  return (await res.json()) as T
}

async function parseError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as {
      errorMessages?: string[]
      errors?: Record<string, string>
    }
    const parts = [
      ...(data.errorMessages ?? []),
      ...Object.entries(data.errors ?? {}).map(([k, v]) => `${k}: ${v}`),
    ]
    if (parts.length) return parts.join('; ')
  } catch {
    // fall through
  }
  return res.statusText || `HTTP ${res.status}`
}

// --- raw Jira response shapes (only the fields we use) ---

interface RawIssue {
  key: string
  fields: {
    summary: string
    status: { id: string; name: string }
    assignee?: { accountId: string; displayName: string; avatarUrls?: Record<string, string> }
    issuetype?: { name: string; iconUrl?: string }
    priority?: { name: string }
  }
}

const ISSUE_FIELDS = 'summary,status,assignee,issuetype,priority'

function toIssue(ri: RawIssue): Issue {
  const f = ri.fields
  return {
    key: ri.key,
    summary: f.summary,
    statusId: f.status.id,
    statusName: f.status.name,
    issueType: f.issuetype?.name,
    issueTypeIconUrl: f.issuetype?.iconUrl,
    priority: f.priority?.name,
    assignee: f.assignee
      ? {
          accountId: f.assignee.accountId,
          displayName: f.assignee.displayName,
          avatarUrl: f.assignee.avatarUrls?.['48x48'],
        }
      : undefined,
  }
}

// --- API methods ---

export async function myself(auth: JiraAuth): Promise<User> {
  const r = await jiraFetch<{
    accountId: string
    displayName: string
    emailAddress?: string
    avatarUrls?: Record<string, string>
  }>(auth, 'GET', '/rest/api/3/myself')
  return {
    accountId: r!.accountId,
    displayName: r!.displayName,
    email: r!.emailAddress,
    avatarUrl: r!.avatarUrls?.['48x48'],
  }
}

// A board id is an opaque key that encodes its kind. Software Agile boards use
// `agile-<boardId>`; non-software projects (e.g. Jira Work Management) have no
// Agile board and are surfaced as `project-<projectId>` with status columns.
type BoardKind = 'agile' | 'project'

function parseBoardKey(key: string): { kind: BoardKind; id: string } {
  const idx = key.indexOf('-')
  if (idx < 0) throw new JiraError(`invalid board id: ${key}`, 400)
  return { kind: key.slice(0, idx) as BoardKind, id: key.slice(idx + 1) }
}

export async function listBoards(auth: JiraAuth): Promise<Board[]> {
  const [agile, projects] = await Promise.all([listAgileBoards(auth), listProjectBoards(auth)])
  return [...agile, ...projects]
}

async function listAgileBoards(auth: JiraAuth): Promise<Board[]> {
  const out: Board[] = []
  let startAt = 0
  for (;;) {
    const r = await jiraFetch<{
      isLast: boolean
      values: Array<{
        id: number
        name: string
        type: string
        location?: { projectKey?: string; projectName?: string }
      }>
    }>(auth, 'GET', `/rest/agile/1.0/board?maxResults=50&startAt=${startAt}`)
    for (const v of r!.values) {
      out.push({
        id: `agile-${v.id}`,
        name: v.name,
        type: v.type,
        projectKey: v.location?.projectKey,
        projectName: v.location?.projectName,
      })
    }
    if (r!.isLast || r!.values.length === 0) break
    startAt += r!.values.length
  }
  return out
}

// listProjectBoards surfaces non-software projects (business / service) as
// boards, since they have no Agile board of their own.
async function listProjectBoards(auth: JiraAuth): Promise<Board[]> {
  const out: Board[] = []
  let startAt = 0
  for (;;) {
    const r = await jiraFetch<{
      isLast: boolean
      values: Array<{ id: string; key: string; name: string; projectTypeKey: string }>
    }>(auth, 'GET', `/rest/api/3/project/search?maxResults=50&startAt=${startAt}`)
    for (const p of r!.values) {
      if (p.projectTypeKey === 'software') continue // already covered by Agile boards
      out.push({
        id: `project-${p.id}`,
        name: p.name,
        type: p.projectTypeKey,
        projectKey: p.key,
        projectName: p.name,
      })
    }
    if (r!.isLast || r!.values.length === 0) break
    startAt += r!.values.length
  }
  return out
}

export async function boardColumns(auth: JiraAuth, boardKey: string): Promise<Column[]> {
  const { kind, id } = parseBoardKey(boardKey)
  if (kind === 'project') return projectColumns(auth, id)

  const r = await jiraFetch<{
    columnConfig: { columns: Array<{ name: string; statuses: Array<{ id: string }> }> }
  }>(auth, 'GET', `/rest/agile/1.0/board/${id}/configuration`)
  return r!.columnConfig.columns.map((c) => ({
    name: c.name,
    statusIds: c.statuses.map((s) => s.id),
  }))
}

// projectColumns derives columns from a project's workflow statuses (there is no
// Agile column config for non-software projects). Each distinct status becomes a
// one-status column, preserving first-seen (workflow) order across issue types.
async function projectColumns(auth: JiraAuth, projectId: string): Promise<Column[]> {
  const r = await jiraFetch<
    Array<{
      statuses: Array<{
        id: string
        name: string
        statusCategory?: { key: string; name: string }
      }>
    }>
  >(auth, 'GET', `/rest/api/3/project/${encodeURIComponent(projectId)}/statuses`)

  // Jira Work Management boards use one column per status *category*
  // (To Do → In Progress → Done); statuses in the same category are stacked as
  // lanes within that column (e.g. Done + Abandoned both under "Done").
  const categoryRank: Record<string, number> = { new: 0, indeterminate: 1, done: 2 }
  type Cat = { key: string; name: string; statuses: StatusRef[] }
  const byCategory = new Map<string, Cat>()
  const seen = new Set<string>()
  for (const issueType of r ?? []) {
    for (const s of issueType.statuses) {
      if (seen.has(s.id)) continue
      seen.add(s.id)
      const key = s.statusCategory?.key ?? 'indeterminate'
      const name = s.statusCategory?.name ?? 'In Progress'
      if (!byCategory.has(key)) byCategory.set(key, { key, name, statuses: [] })
      byCategory.get(key)!.statuses.push({ id: s.id, name: s.name })
    }
  }
  return [...byCategory.values()]
    .sort((a, b) => (categoryRank[a.key] ?? 1) - (categoryRank[b.key] ?? 1))
    .map((c) => ({
      name: c.name,
      statusIds: c.statuses.map((s) => s.id),
      statuses: c.statuses,
    }))
}

export async function boardIssues(auth: JiraAuth, boardKey: string, jql: string): Promise<Issue[]> {
  const { kind, id } = parseBoardKey(boardKey)
  if (kind === 'project') return projectIssues(auth, id, jql)

  const out: Issue[] = []
  let startAt = 0
  for (;;) {
    const params = new URLSearchParams({
      fields: ISSUE_FIELDS,
      maxResults: '100',
      startAt: String(startAt),
    })
    if (jql) params.set('jql', jql)
    const r = await jiraFetch<{ total: number; issues: RawIssue[] }>(
      auth,
      'GET',
      `/rest/agile/1.0/board/${id}/issue?${params.toString()}`,
    )
    for (const ri of r!.issues) out.push(toIssue(ri))
    startAt += r!.issues.length
    if (r!.issues.length === 0 || startAt >= r!.total) break
  }
  return out
}

// projectIssues fetches all issues of a project via JQL, paging with the search
// endpoint's token pagination.
async function projectIssues(auth: JiraAuth, projectId: string, extraJql: string): Promise<Issue[]> {
  const base = `project = ${projectId}`
  const jql = extraJql ? `${base} AND ${extraJql}` : base
  const out: Issue[] = []
  let nextPageToken: string | undefined
  for (;;) {
    const body: Record<string, unknown> = {
      jql: `${jql} ORDER BY created DESC`,
      fields: ISSUE_FIELDS.split(','),
      maxResults: 100,
    }
    if (nextPageToken) body.nextPageToken = nextPageToken
    const r = await jiraFetch<{ issues: RawIssue[]; nextPageToken?: string }>(
      auth,
      'POST',
      '/rest/api/3/search/jql',
      body,
    )
    for (const ri of r!.issues) out.push(toIssue(ri))
    if (!r!.nextPageToken || r!.issues.length === 0) break
    nextPageToken = r!.nextPageToken
  }
  return out
}

export async function transitions(auth: JiraAuth, issueKey: string): Promise<Transition[]> {
  const r = await jiraFetch<{
    transitions: Array<{ id: string; name: string; to: { id: string; name: string } }>
  }>(auth, 'GET', `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`)
  return r!.transitions.map((t) => ({
    id: t.id,
    name: t.name,
    toStatusId: t.to.id,
    toStatusName: t.to.name,
  }))
}

export async function doTransition(
  auth: JiraAuth,
  issueKey: string,
  transitionId: string,
): Promise<void> {
  await jiraFetch(auth, 'POST', `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`, {
    transition: { id: transitionId },
  })
}

export async function getIssue(auth: JiraAuth, issueKey: string): Promise<Issue> {
  const ri = await jiraFetch<RawIssue>(
    auth,
    'GET',
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=${ISSUE_FIELDS}`,
  )
  return toIssue(ri!)
}

const DETAIL_FIELDS =
  'summary,status,assignee,issuetype,priority,description,reporter,created,updated,labels,comment'

interface RawPerson {
  accountId: string
  displayName: string
  avatarUrls?: Record<string, string>
}

function toAssignee(p?: RawPerson): Assignee | undefined {
  if (!p) return undefined
  return { accountId: p.accountId, displayName: p.displayName, avatarUrl: p.avatarUrls?.['48x48'] }
}

// getIssueDetail fetches the richer field set used by the detail modal and
// flattens the ADF description into plain text.
export async function getIssueDetail(auth: JiraAuth, issueKey: string): Promise<IssueDetail> {
  const ri = await jiraFetch<
    RawIssue & {
      fields: RawIssue['fields'] & {
        description?: unknown
        reporter?: RawPerson
        created?: string
        updated?: string
        labels?: string[]
        comment?: {
          comments?: Array<{
            id: string
            author?: RawPerson
            body?: unknown
            created?: string
            updated?: string
          }>
        }
      }
    }
  >(auth, 'GET', `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=${DETAIL_FIELDS}`)
  const base = toIssue(ri!)
  const f = ri!.fields
  const comments: Comment[] = (f.comment?.comments ?? []).map((c) => ({
    id: c.id,
    author: toAssignee(c.author),
    body: adfToRich(c.body),
    created: c.created,
    updated: c.updated,
  }))
  return {
    ...base,
    description: adfToRich(f.description),
    reporter: toAssignee(f.reporter),
    labels: f.labels ?? [],
    created: f.created,
    updated: f.updated,
    browseUrl: `${auth.siteUrl}/browse/${encodeURIComponent(issueKey)}`,
    comments,
  }
}

export async function createIssue(auth: JiraAuth, input: CreateIssueInput): Promise<string> {
  const fields: Record<string, unknown> = {
    project: { key: input.projectKey },
    issuetype: { name: input.issueType },
    summary: input.summary,
  }
  if (input.description) fields.description = adfDoc(input.description)
  if (input.assigneeId) fields.assignee = { accountId: input.assigneeId }
  const r = await jiraFetch<{ key: string }>(auth, 'POST', '/rest/api/3/issue', { fields })
  return r!.key
}

export async function deleteIssue(auth: JiraAuth, issueKey: string): Promise<void> {
  await jiraFetch(auth, 'DELETE', `/rest/api/3/issue/${encodeURIComponent(issueKey)}`)
}

export async function updateIssueDescription(
  auth: JiraAuth,
  issueKey: string,
  description: string,
): Promise<void> {
  await jiraFetch(auth, 'PUT', `/rest/api/3/issue/${encodeURIComponent(issueKey)}`, {
    fields: { description: adfDoc(description) },
  })
}

export async function addComment(auth: JiraAuth, issueKey: string, body: string): Promise<void> {
  await jiraFetch(auth, 'POST', `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`, {
    body: adfDoc(body),
  })
}

export async function search(auth: JiraAuth, jql: string): Promise<Issue[]> {
  const r = await jiraFetch<{ issues: RawIssue[] }>(auth, 'POST', '/rest/api/3/search/jql', {
    jql,
    fields: ISSUE_FIELDS.split(','),
    maxResults: 50,
  })
  return r!.issues.map(toIssue)
}

// Move an issue to a target status by finding a workflow transition whose
// destination is that status and executing it. Moving by status (rather than
// column) is unambiguous even when a column stacks several statuses.
export async function moveIssue(
  auth: JiraAuth,
  issueKey: string,
  targetStatusId: string,
): Promise<Issue> {
  const avail = await transitions(auth, issueKey)
  const t = avail.find((tr) => tr.toStatusId === targetStatusId)
  if (!t) {
    throw new JiraError('no workflow transition from the current status into the target status', 409)
  }
  await doTransition(auth, issueKey, t.id)
  return getIssue(auth, issueKey)
}

// jqlQuote escapes a user string for embedding in a JQL double-quoted literal.
export function jqlQuote(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

// adfToRich flattens an Atlassian Document Format node tree into inline segments,
// preserving link targets so the frontend can render link-marked text as an <a>
// tag on the label itself. Newlines between block-level nodes are kept as text.
function adfToRich(node: unknown): InlineSegment[] {
  if (node == null || typeof node !== 'object') return []
  const blockTypes = new Set(['paragraph', 'heading', 'listItem', 'blockquote', 'codeBlock'])
  const out: InlineSegment[] = []
  const push = (text: string, href?: string) => {
    if (!text) return
    out.push(href ? { text, href } : { text })
  }
  const walk = (n: any): void => {
    if (!n || typeof n !== 'object') return
    if (n.type === 'text') {
      const text = typeof n.text === 'string' ? n.text : ''
      const href = Array.isArray(n.marks)
        ? n.marks.find((m: any) => m?.type === 'link')?.attrs?.href
        : undefined
      push(text, href)
      return
    }
    if (n.type === 'hardBreak') return push('\n')
    // Smart links / URL cards carry the URL in attrs, not as child text.
    if (n.type === 'inlineCard' || n.type === 'blockCard') {
      const url = n.attrs?.url
      if (url) push(url, url)
      return
    }
    const children: any[] = Array.isArray(n.content) ? n.content : []
    children.forEach(walk)
    if (blockTypes.has(n.type)) push('\n')
  }
  walk(node)
  // Trim leading/trailing whitespace-only segments (e.g. the final block newline).
  while (out.length && out[0].text.trim() === '' && !out[0].href) out.shift()
  while (out.length && out[out.length - 1].text.trim() === '' && !out[out.length - 1].href) out.pop()
  return out
}

// adfDoc wraps plain text in a minimal Atlassian Document Format document, which
// the v3 create-issue endpoint requires for rich-text fields like description.
function adfDoc(text: string) {
  // Split on newlines into paragraphs; empty text yields a single empty
  // paragraph (valid ADF — an empty text node is not).
  const content = text.split('\n').map((line) =>
    line ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' },
  )
  return { type: 'doc', version: 1, content }
}
