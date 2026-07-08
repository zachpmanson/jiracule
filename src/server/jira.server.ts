// Server-only Jira Cloud client. This module must only ever be imported from
// inside server-function handlers — it reads the API token from the environment
// and talks directly to Jira. The build keeps it out of the client bundle.
import type {
  Assignee,
  Board,
  Column,
  Comment,
  CreateIssueInput,
  Issue,
  IssueDetail,
  Transition,
  User,
} from '../types'

export class JiraError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

function config() {
  const baseUrl = process.env.JIRA_BASE_URL?.replace(/\/+$/, '')
  const email = process.env.JIRA_EMAIL
  const token = process.env.JIRA_API_TOKEN
  const missing = [
    !baseUrl && 'JIRA_BASE_URL',
    !email && 'JIRA_EMAIL',
    !token && 'JIRA_API_TOKEN',
  ].filter(Boolean)
  if (missing.length) {
    throw new JiraError(`missing required env vars: ${missing.join(', ')}`, 500)
  }
  const authHeader = 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64')
  return { baseUrl: baseUrl!, authHeader }
}

async function jiraFetch<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T | undefined> {
  const { baseUrl, authHeader } = config()
  const res = await fetch(baseUrl + path, {
    method,
    headers: {
      Authorization: authHeader,
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

export async function myself(): Promise<User> {
  const r = await jiraFetch<{
    accountId: string
    displayName: string
    emailAddress?: string
    avatarUrls?: Record<string, string>
  }>('GET', '/rest/api/3/myself')
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

export async function listBoards(): Promise<Board[]> {
  const [agile, projects] = await Promise.all([listAgileBoards(), listProjectBoards()])
  return [...agile, ...projects]
}

async function listAgileBoards(): Promise<Board[]> {
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
    }>('GET', `/rest/agile/1.0/board?maxResults=50&startAt=${startAt}`)
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
async function listProjectBoards(): Promise<Board[]> {
  const out: Board[] = []
  let startAt = 0
  for (;;) {
    const r = await jiraFetch<{
      isLast: boolean
      values: Array<{ id: string; key: string; name: string; projectTypeKey: string }>
    }>('GET', `/rest/api/3/project/search?maxResults=50&startAt=${startAt}`)
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

export async function boardColumns(boardKey: string): Promise<Column[]> {
  const { kind, id } = parseBoardKey(boardKey)
  if (kind === 'project') return projectColumns(id)

  const r = await jiraFetch<{
    columnConfig: { columns: Array<{ name: string; statuses: Array<{ id: string }> }> }
  }>('GET', `/rest/agile/1.0/board/${id}/configuration`)
  return r!.columnConfig.columns.map((c) => ({
    name: c.name,
    statusIds: c.statuses.map((s) => s.id),
  }))
}

// projectColumns derives columns from a project's workflow statuses (there is no
// Agile column config for non-software projects). Each distinct status becomes a
// one-status column, preserving first-seen (workflow) order across issue types.
async function projectColumns(projectId: string): Promise<Column[]> {
  const r = await jiraFetch<
    Array<{ statuses: Array<{ id: string; name: string }> }>
  >('GET', `/rest/api/3/project/${encodeURIComponent(projectId)}/statuses`)
  const seen = new Set<string>()
  const cols: Column[] = []
  for (const issueType of r ?? []) {
    for (const s of issueType.statuses) {
      if (seen.has(s.id)) continue
      seen.add(s.id)
      cols.push({ name: s.name, statusIds: [s.id] })
    }
  }
  return cols
}

export async function boardIssues(boardKey: string, jql: string): Promise<Issue[]> {
  const { kind, id } = parseBoardKey(boardKey)
  if (kind === 'project') return projectIssues(id, jql)

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
async function projectIssues(projectId: string, extraJql: string): Promise<Issue[]> {
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

export async function transitions(issueKey: string): Promise<Transition[]> {
  const r = await jiraFetch<{
    transitions: Array<{ id: string; name: string; to: { id: string; name: string } }>
  }>('GET', `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`)
  return r!.transitions.map((t) => ({
    id: t.id,
    name: t.name,
    toStatusId: t.to.id,
    toStatusName: t.to.name,
  }))
}

export async function doTransition(issueKey: string, transitionId: string): Promise<void> {
  await jiraFetch('POST', `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`, {
    transition: { id: transitionId },
  })
}

export async function getIssue(issueKey: string): Promise<Issue> {
  const ri = await jiraFetch<RawIssue>(
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
export async function getIssueDetail(issueKey: string): Promise<IssueDetail> {
  const { baseUrl } = config()
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
  >('GET', `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=${DETAIL_FIELDS}`)
  const base = toIssue(ri!)
  const f = ri!.fields
  const comments: Comment[] = (f.comment?.comments ?? []).map((c) => ({
    id: c.id,
    author: toAssignee(c.author),
    body: adfToText(c.body) ?? '',
    created: c.created,
    updated: c.updated,
  }))
  return {
    ...base,
    description: adfToText(f.description),
    reporter: toAssignee(f.reporter),
    labels: f.labels ?? [],
    created: f.created,
    updated: f.updated,
    browseUrl: `${baseUrl}/browse/${encodeURIComponent(issueKey)}`,
    comments,
  }
}

export async function createIssue(input: CreateIssueInput): Promise<string> {
  const fields: Record<string, unknown> = {
    project: { key: input.projectKey },
    issuetype: { name: input.issueType },
    summary: input.summary,
  }
  if (input.description) fields.description = adfDoc(input.description)
  if (input.assigneeId) fields.assignee = { accountId: input.assigneeId }
  const r = await jiraFetch<{ key: string }>('POST', '/rest/api/3/issue', { fields })
  return r!.key
}

export async function deleteIssue(issueKey: string): Promise<void> {
  await jiraFetch('DELETE', `/rest/api/3/issue/${encodeURIComponent(issueKey)}`)
}

export async function search(jql: string): Promise<Issue[]> {
  const r = await jiraFetch<{ issues: RawIssue[] }>('POST', '/rest/api/3/search/jql', {
    jql,
    fields: ISSUE_FIELDS.split(','),
    maxResults: 50,
  })
  return r!.issues.map(toIssue)
}

// Resolve the target board column to a status set, find a valid workflow
// transition into it, execute it, and return the updated issue.
export async function moveIssue(
  issueKey: string,
  boardKey: string,
  targetColumnName: string,
): Promise<Issue> {
  const cols = await boardColumns(boardKey)
  const col = cols.find((c) => c.name === targetColumnName)
  if (!col) throw new JiraError(`unknown column: ${targetColumnName}`, 400)
  const targetStatuses = new Set(col.statusIds)

  const avail = await transitions(issueKey)
  const t = avail.find((tr) => targetStatuses.has(tr.toStatusId))
  if (!t) {
    throw new JiraError(
      `no workflow transition from the current status into column "${targetColumnName}"`,
      409,
    )
  }
  await doTransition(issueKey, t.id)
  return getIssue(issueKey)
}

// jqlQuote escapes a user string for embedding in a JQL double-quoted literal.
export function jqlQuote(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

// adfToText flattens an Atlassian Document Format node tree into plain text,
// inserting newlines between block-level nodes. Good enough for a read-only
// detail view; rich rendering is out of scope for v1.
function adfToText(node: unknown): string | undefined {
  if (node == null || typeof node !== 'object') return undefined
  const blockTypes = new Set(['paragraph', 'heading', 'listItem', 'blockquote', 'codeBlock'])
  const walk = (n: any): string => {
    if (!n || typeof n !== 'object') return ''
    if (n.type === 'text') return typeof n.text === 'string' ? n.text : ''
    if (n.type === 'hardBreak') return '\n'
    const children: any[] = Array.isArray(n.content) ? n.content : []
    const inner = children.map(walk).join('')
    return blockTypes.has(n.type) ? inner + '\n' : inner
  }
  const text = walk(node).replace(/\n{3,}/g, '\n\n').trim()
  return text || undefined
}

// adfDoc wraps plain text in a minimal Atlassian Document Format document, which
// the v3 create-issue endpoint requires for rich-text fields like description.
function adfDoc(text: string) {
  return {
    type: 'doc',
    version: 1,
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  }
}
