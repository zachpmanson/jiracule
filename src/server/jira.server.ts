// Server-only Jira Cloud client. This module must only ever be imported from
// inside server-function handlers. Requests are authenticated per-user via the
// OAuth access token in `JiraAuth` and go through the OAuth API base
// (api.atlassian.com/ex/jira/{cloudId}). The build keeps it out of the client
// bundle.
import type {
  Assignee,
  Attachment,
  Board,
  Column,
  Comment,
  CreateIssueInput,
  Issue,
  IssueDetail,
  IssueTypeRef,
  LanePage,
  StatusRef,
  SubtaskRef,
  Transition,
  User,
} from '../types'
import type { JiraAuth } from './session.server'
import { markdownToAdf } from '../markdown'

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
    let extra = ''
    if (res.status === 401 || res.status === 403) {
      // Diagnostics: what does Jira object to, and what scopes does the token
      // actually carry?
      extra = ` [www-authenticate: ${res.headers.get('www-authenticate')}] [token scopes: ${tokenScopes(auth.token)}]`
    }
    const message = await parseError(res)
    console.error(`[jira] ${method} ${path} -> ${res.status}: ${message}${extra}`)
    throw new JiraError(message, res.status)
  }
  if (res.status === 204) return undefined
  return (await res.json()) as T
}

// tokenScopes decodes the `scope` claim from the OAuth access token (a JWT) for
// diagnostics — to tell whether a rejected scope is actually present.
function tokenScopes(token: string): string {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'))
    return payload.scope ?? '(no scope claim)'
  } catch {
    return '(token not a decodable JWT)'
  }
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
    issuetype?: { name: string; iconUrl?: string; subtask?: boolean }
    priority?: { name: string }
  }
}

const ISSUE_FIELDS = 'summary,status,assignee,issuetype,priority'

// Cards fetched per lane per page — small enough that a lane renders fast and
// infinite scroll feels responsive.
const LANE_PAGE_SIZE = 25

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

// A board id encodes its kind and the project it scopes to. A Software Agile
// board is `agile-<boardId>-<projectId>`: the board supplies the column layout
// while the project scopes the issue queries. A project with no Agile board is
// `project-<projectId>`, surfaced with status-category columns. Both ids are
// composed only of `agile`/`project` + numeric ids, so splitting on `-` is safe.
type ParsedBoardKey =
  | { kind: 'agile'; boardId: string; projectId: string }
  | { kind: 'project'; projectId: string }

function parseBoardKey(key: string): ParsedBoardKey {
  const parts = key.split('-')
  if (parts[0] === 'agile' && parts.length >= 3) {
    return { kind: 'agile', boardId: parts[1], projectId: parts[2] }
  }
  if (parts[0] === 'project' && parts.length >= 2) {
    return { kind: 'project', projectId: parts[1] }
  }
  throw new JiraError(`invalid board id: ${key}`, 400)
}

// Boards for the switcher: every Agile board on the site, grouped under the
// project it lives in, plus a `project-<id>` entry for projects that have no
// Agile board. Enumerating boards (not just projects) means a project with
// several boards exposes each of them, instead of collapsing to whichever one
// resolves first. The column *layout* is resolved separately in boardColumns.
export async function listBoards(auth: JiraAuth): Promise<Board[]> {
  const projects = await listProjects(auth)
  const boardsByProject = await agileBoardsByProject(auth)
  const out: Board[] = []
  for (const p of projects) {
    const boards = boardsByProject.get(p.id) ?? []
    if (boards.length === 0) {
      out.push({ id: `project-${p.id}`, name: p.name, type: p.type, projectKey: p.key, projectName: p.name })
    } else {
      for (const b of boards) {
        out.push({
          id: `agile-${b.id}-${p.id}`,
          name: b.name,
          type: b.type,
          projectKey: p.key,
          projectName: p.name,
        })
      }
    }
  }
  return out
}

type ProjectInfo = { id: string; key: string; name: string; type: string }

// listProjects enumerates the visible projects (platform API, paginated).
async function listProjects(auth: JiraAuth): Promise<ProjectInfo[]> {
  const out: ProjectInfo[] = []
  let startAt = 0
  for (;;) {
    const r = await jiraFetch<{
      isLast: boolean
      values: Array<{ id: string; key: string; name: string; projectTypeKey: string }>
    }>(auth, 'GET', `/rest/api/3/project/search?maxResults=50&startAt=${startAt}`)
    for (const p of r!.values) out.push({ id: p.id, key: p.key, name: p.name, type: p.projectTypeKey })
    if (r!.isLast || r!.values.length === 0) break
    startAt += r!.values.length
  }
  return out
}

type AgileBoardInfo = { id: number; name: string; type: string }

// agileBoardsByProject lists every Agile board on the site, keyed by the id of
// the project it is located in. Returns an empty map (so listBoards falls back
// to project-only entries) if the Agile board API rejects our token.
async function agileBoardsByProject(auth: JiraAuth): Promise<Map<string, AgileBoardInfo[]>> {
  const byProject = new Map<string, AgileBoardInfo[]>()
  try {
    let startAt = 0
    for (;;) {
      const r = await jiraFetch<{
        isLast: boolean
        values: Array<{ id: number; name: string; type: string; location?: { projectId?: number } }>
      }>(auth, 'GET', `/rest/agile/1.0/board?maxResults=50&startAt=${startAt}`)
      for (const b of r!.values) {
        const pid = b.location?.projectId
        if (pid == null) continue
        const k = String(pid)
        if (!byProject.has(k)) byProject.set(k, [])
        byProject.get(k)!.push({ id: b.id, name: b.name, type: b.type })
      }
      if (r!.isLast || r!.values.length === 0) break
      startAt += r!.values.length
    }
  } catch (e) {
    if (e instanceof JiraError) return new Map()
    throw e
  }
  return byProject
}

export async function boardColumns(auth: JiraAuth, boardKey: string): Promise<Column[]> {
  const parsed = parseBoardKey(boardKey)

  // The project's workflow statuses double as an id→name map so pooled Agile
  // columns can label the statuses they incorporate, and as the source for the
  // status-category fallback — so fetch them once and share.
  const statuses = await projectStatuses(auth, parsed.projectId)
  const names = new Map(statuses.map((s) => [s.id, s.name]))

  // A specific Agile board: use its configured columns directly.
  if (parsed.kind === 'agile') return agileColumns(auth, parsed.boardId, names)

  // A project with no Agile board of its own: prefer any Agile board located in
  // it (authoritative side-by-side layout), else fall back to the status-category
  // heuristic for non-software projects or when the Agile API rejects our token.
  const agile = await agileColumnsForProject(auth, parsed.projectId, names)
  return agile ?? projectColumns(statuses)
}

type ProjectStatus = { id: string; name: string; statusCategory?: { key: string; name: string } }

// projectStatuses returns a project's distinct workflow statuses (id, name,
// category), preserving first-seen (workflow) order across issue types.
async function projectStatuses(auth: JiraAuth, projectId: string): Promise<ProjectStatus[]> {
  const r = await jiraFetch<Array<{ statuses: ProjectStatus[] }>>(
    auth,
    'GET',
    `/rest/api/3/project/${encodeURIComponent(projectId)}/statuses`,
  )
  const out: ProjectStatus[] = []
  const seen = new Set<string>()
  for (const issueType of r ?? [])
    for (const s of issueType.statuses)
      if (!seen.has(s.id)) {
        seen.add(s.id)
        out.push(s)
      }
  return out
}

// agileColumns maps an Agile board's column configuration into our Column shape.
// Statuses mapped into one column are pooled into a single lane (as Jira renders
// them), so the column is marked `pooled` and drops onto its first status. The
// config only carries status ids; `names` (when supplied) resolves them so the
// header can show which statuses the column incorporates.
async function agileColumns(
  auth: JiraAuth,
  boardId: string,
  names?: Map<string, string>,
): Promise<Column[]> {
  const r = await jiraFetch<{
    columnConfig: { columns: Array<{ name: string; statuses: Array<{ id: string }> }> }
  }>(auth, 'GET', `/rest/agile/1.0/board/${boardId}/configuration`)
  return (r!.columnConfig.columns ?? [])
    .map((c) => {
      const statusIds = c.statuses.map((s) => s.id)
      const resolved = names
        ? statusIds
            .map((id) => ({ id, name: names.get(id) }))
            .filter((s): s is StatusRef => s.name != null)
        : []
      return {
        name: c.name,
        statusIds,
        statuses: resolved.length ? resolved : undefined,
        pooled: true,
      }
    })
    .filter((c) => c.statusIds.length > 0) // drop unmapped columns (e.g. Backlog)
}

// agileColumnsForProject finds the project's first Agile board and returns its
// column layout, or null when the project has no board or the Agile API rejects
// our token (a JiraError) — the caller then uses the status-category heuristic.
async function agileColumnsForProject(
  auth: JiraAuth,
  projectId: string,
  names?: Map<string, string>,
): Promise<Column[] | null> {
  try {
    const list = await jiraFetch<{
      values: Array<{ id: number; location?: { projectId?: number } }>
    }>(
      auth,
      'GET',
      `/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(projectId)}&maxResults=50`,
    )
    const boards = list?.values ?? []
    // The projectKeyOrId filter also returns boards that merely *include* the
    // project (e.g. a multi-project board); prefer one actually located in it.
    const board = boards.find((b) => String(b.location?.projectId) === projectId) ?? boards[0]
    if (!board) return null
    const cols = await agileColumns(auth, String(board.id), names)
    return cols.length ? cols : null
  } catch (e) {
    if (e instanceof JiraError) return null
    throw e
  }
}

// projectColumns derives columns from a project's workflow statuses (there is no
// Agile column config for non-software projects). Statuses are grouped by status
// category into one column each, stacked as lanes within the column.
function projectColumns(statuses: ProjectStatus[]): Column[] {
  // Jira Work Management boards use one column per status *category*
  // (To Do → In Progress → Done); statuses in the same category are stacked as
  // lanes within that column (e.g. Done + Abandoned both under "Done").
  const categoryRank: Record<string, number> = { new: 0, indeterminate: 1, done: 2 }
  type Cat = { key: string; name: string; statuses: StatusRef[] }
  const byCategory = new Map<string, Cat>()
  for (const s of statuses) {
    const key = s.statusCategory?.key ?? 'indeterminate'
    const name = s.statusCategory?.name ?? 'In Progress'
    if (!byCategory.has(key)) byCategory.set(key, { key, name, statuses: [] })
    byCategory.get(key)!.statuses.push({ id: s.id, name: s.name })
  }
  return [...byCategory.values()]
    .sort((a, b) => (categoryRank[a.key] ?? 1) - (categoryRank[b.key] ?? 1))
    .map((c) => ({
      name: c.name,
      statusIds: c.statuses.map((s) => s.id),
      statuses: c.statuses,
    }))
}

// laneIssues fetches one page of a lane's issues. A lane targets one or more
// statuses (an Agile column pools several); the board key carries the project
// it scopes to, so we query by JQL over that project and page with the search
// endpoint's opaque cursor. The approximate total is fetched once, on the first
// page (cursor undefined), since the /search/jql endpoint no longer returns
// `total`.
export async function laneIssues(
  auth: JiraAuth,
  boardKey: string,
  statusIds: string[],
  assigneeId?: string,
  cursor?: string,
): Promise<LanePage> {
  const { projectId } = parseBoardKey(boardKey)
  const clauses = [`project = ${projectId}`]
  if (statusIds.length) clauses.push(`status IN (${statusIds.join(',')})`)
  if (assigneeId) clauses.push(`assignee = "${jqlQuote(assigneeId)}"`)
  const jql = `${clauses.join(' AND ')} ORDER BY created DESC`

  const body: Record<string, unknown> = {
    jql,
    fields: ISSUE_FIELDS.split(','),
    maxResults: LANE_PAGE_SIZE,
  }
  if (cursor) body.nextPageToken = cursor
  const page = await jiraFetch<{ issues: RawIssue[]; nextPageToken?: string }>(
    auth,
    'POST',
    '/rest/api/3/search/jql',
    body,
  )

  // Only pay for the count once, on the first page.
  let total: number | null = null
  if (!cursor) {
    const c = await jiraFetch<{ count: number }>(
      auth,
      'POST',
      '/rest/api/3/search/approximate-count',
      { jql },
    )
    total = c?.count ?? null
  }

  return {
    issues: (page?.issues ?? []).map(toIssue),
    nextCursor: page?.nextPageToken ?? null,
    total,
  }
}

// boardAssignees lists the people assignable in the board's project — the source
// for the assignee filter dropdown (which can't be derived from loaded issues
// once lanes are paginated).
export async function boardAssignees(auth: JiraAuth, projectKey: string): Promise<Assignee[]> {
  const r = await jiraFetch<RawPerson[]>(
    auth,
    'GET',
    `/rest/api/3/user/assignable/search?project=${encodeURIComponent(projectKey)}&maxResults=100`,
  )
  return (r ?? []).map((p) => toAssignee(p)!).filter(Boolean)
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
  'summary,status,assignee,issuetype,priority,description,reporter,created,updated,labels,comment,parent,subtasks,attachment'

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
        parent?: { key: string; fields?: { summary?: string } }
        subtasks?: Array<{
          key: string
          fields?: {
            summary?: string
            status?: { id: string; name: string }
            issuetype?: { iconUrl?: string }
            assignee?: RawPerson
          }
        }>
        comment?: {
          comments?: Array<{
            id: string
            author?: RawPerson
            body?: unknown
            created?: string
            updated?: string
          }>
        }
        attachment?: Array<{
          id: string
          filename: string
          mimeType?: string
          size?: number
          created?: string
          author?: RawPerson
        }>
      }
    }
  >(auth, 'GET', `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=${DETAIL_FIELDS}`)
  const base = toIssue(ri!)
  const f = ri!.fields
  // The parent's embedded `subtasks` field has no priority/creation ordering, so
  // when there's more than one to order, re-fetch them via JQL (Jira applies its
  // own priority sequence natively). A single subtask needs no sorting.
  const embeddedSubtasks: SubtaskRef[] = (f.subtasks ?? []).map(toSubtaskRef)
  const subtasks =
    embeddedSubtasks.length > 1 ? await orderedSubtasks(auth, issueKey) : embeddedSubtasks
  const comments: Comment[] = (f.comment?.comments ?? []).map((c) => ({
    id: c.id,
    author: toAssignee(c.author),
    body: adfToMarkdown(c.body),
    created: c.created,
    updated: c.updated,
  }))
  const attachments: Attachment[] = (f.attachment ?? []).map((a) => {
    const mimeType = a.mimeType ?? 'application/octet-stream'
    return {
      id: a.id,
      filename: a.filename,
      mimeType,
      size: a.size ?? 0,
      created: a.created,
      author: toAssignee(a.author),
      isImage: mimeType.startsWith('image/'),
    }
  })
  return {
    ...base,
    description: adfToMarkdown(f.description),
    reporter: toAssignee(f.reporter),
    parent: f.parent ? { key: f.parent.key, summary: f.parent.fields?.summary } : undefined,
    labels: f.labels ?? [],
    created: f.created,
    updated: f.updated,
    browseUrl: `${auth.siteUrl}/browse/${encodeURIComponent(issueKey)}`,
    comments,
    subtasks,
    attachments,
    isSubtask: f.issuetype?.subtask ?? false,
  }
}

// The subset of a subtask's fields we surface, as returned both by a parent's
// embedded `subtasks` field and by a JQL search over its children.
interface RawSubtask {
  key: string
  fields?: {
    summary?: string
    status?: { id: string; name: string }
    issuetype?: { iconUrl?: string }
    assignee?: RawPerson
  }
}

function toSubtaskRef(s: RawSubtask): SubtaskRef {
  return {
    key: s.key,
    summary: s.fields?.summary ?? '',
    statusId: s.fields?.status?.id ?? '',
    statusName: s.fields?.status?.name ?? '',
    issueTypeIconUrl: s.fields?.issuetype?.iconUrl,
    assignee: toAssignee(s.fields?.assignee),
  }
}

// orderedSubtasks lists a parent's subtasks ordered by priority then creation —
// an ordering the embedded `subtasks` field can't express, so we ask Jira for it
// directly via JQL.
async function orderedSubtasks(auth: JiraAuth, parentKey: string): Promise<SubtaskRef[]> {
  const r = await jiraFetch<{ issues: RawSubtask[] }>(auth, 'POST', '/rest/api/3/search/jql', {
    jql: `parent = "${parentKey}" ORDER BY priority DESC, created ASC`,
    fields: ['summary', 'status', 'issuetype', 'assignee'],
    maxResults: 100,
  })
  return (r?.issues ?? []).map(toSubtaskRef)
}

// projectIssueTypes lists a project's issue types, tagged with whether each is a
// subtask type. Used to discover the subtask-type name required when creating a
// subtask (the create-issue API takes an issue-type *name*).
export async function projectIssueTypes(
  auth: JiraAuth,
  projectKey: string,
): Promise<IssueTypeRef[]> {
  const r = await jiraFetch<{
    issueTypes?: Array<{ id: string; name: string; iconUrl?: string; subtask?: boolean }>
  }>(auth, 'GET', `/rest/api/3/project/${encodeURIComponent(projectKey)}`)
  return (r?.issueTypes ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    iconUrl: t.iconUrl,
    subtask: t.subtask ?? false,
  }))
}

export async function createIssue(auth: JiraAuth, input: CreateIssueInput): Promise<string> {
  const fields: Record<string, unknown> = {
    project: { key: input.projectKey },
    issuetype: { name: input.issueType },
    summary: input.summary,
  }
  if (input.description) fields.description = markdownToAdf(input.description)
  if (input.assigneeId) fields.assignee = { accountId: input.assigneeId }
  if (input.parentKey) fields.parent = { key: input.parentKey }
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
    fields: { description: markdownToAdf(description) },
  })
}

export async function updateIssueSummary(
  auth: JiraAuth,
  issueKey: string,
  summary: string,
): Promise<void> {
  await jiraFetch(auth, 'PUT', `/rest/api/3/issue/${encodeURIComponent(issueKey)}`, {
    fields: { summary },
  })
}

export async function updateIssueAssignee(
  auth: JiraAuth,
  issueKey: string,
  accountId: string | null,
): Promise<void> {
  await jiraFetch(auth, 'PUT', `/rest/api/3/issue/${encodeURIComponent(issueKey)}`, {
    fields: { assignee: accountId ? { accountId } : null },
  })
}

export async function updateIssueParent(
  auth: JiraAuth,
  issueKey: string,
  parentKey: string | null,
): Promise<void> {
  await jiraFetch(auth, 'PUT', `/rest/api/3/issue/${encodeURIComponent(issueKey)}`, {
    fields: { parent: parentKey ? { key: parentKey } : null },
  })
}

// Replaces the issue's label set wholesale (Jira takes a plain string array).
export async function updateIssueLabels(
  auth: JiraAuth,
  issueKey: string,
  labels: string[],
): Promise<void> {
  await jiraFetch(auth, 'PUT', `/rest/api/3/issue/${encodeURIComponent(issueKey)}`, {
    fields: { labels },
  })
}

// Sets priority by name — the codebase only stores the priority name (see
// toIssue), so name (not id) is what we have on hand and Jira accepts it.
export async function updateIssuePriority(
  auth: JiraAuth,
  issueKey: string,
  priorityName: string,
): Promise<void> {
  await jiraFetch(auth, 'PUT', `/rest/api/3/issue/${encodeURIComponent(issueKey)}`, {
    fields: { priority: { name: priorityName } },
  })
}

// Autocomplete suggestions for the label field, via Jira's own label-suggest
// endpoint (the v1 API its UI uses). Degrades to [] on failure so the editor
// still lets you type and create labels freely.
export async function labelSuggestions(auth: JiraAuth, query: string): Promise<string[]> {
  try {
    const r = await jiraFetch<{ suggestions?: { label: string }[] }>(
      auth,
      'GET',
      `/rest/api/1.0/labels/suggest?query=${encodeURIComponent(query)}`,
    )
    return (r?.suggestions ?? []).map((s) => s.label)
  } catch {
    return []
  }
}

// The instance's global priority scheme. Names populate the priority dropdown
// and match the value stored on the issue.
export async function listPriorities(auth: JiraAuth): Promise<{ id: string; name: string }[]> {
  const r = await jiraFetch<{ id: string; name: string }[]>(auth, 'GET', '/rest/api/3/priority')
  return (r ?? []).map((p) => ({ id: p.id, name: p.name }))
}

// assignableUsers lists the people who can be assigned to a given issue (scoped
// to the issue's project by Jira). Used to populate the reassign dropdown.
export async function assignableUsers(auth: JiraAuth, issueKey: string): Promise<Assignee[]> {
  const r = await jiraFetch<RawPerson[]>(
    auth,
    'GET',
    `/rest/api/3/user/assignable/search?issueKey=${encodeURIComponent(issueKey)}&maxResults=100`,
  )
  return (r ?? []).map((p) => toAssignee(p)!).filter(Boolean)
}

export async function addComment(auth: JiraAuth, issueKey: string, body: string): Promise<void> {
  await jiraFetch(auth, 'POST', `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`, {
    body: markdownToAdf(body),
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

// adfToMarkdown flattens an Atlassian Document Format node tree into a Markdown
// string — the wire format the browser renders (Markdown.tsx) and edits, and
// which markdownToAdf (../markdown) turns back into ADF on save. Inline marks
// (bold/italic/code/strike/link) and block structure (headings, lists, code
// blocks, quotes) are preserved so a read → edit → write round-trip keeps its
// formatting instead of collapsing to plain text.
function adfToMarkdown(node: unknown): string {
  if (node == null || typeof node !== 'object') return ''
  const blocks: any[] = Array.isArray((node as any).content) ? (node as any).content : []
  return blocks
    .map(blockToMarkdown)
    .filter((s) => s.length > 0)
    .join('\n\n')
    .trim()
}

// Escape the characters that would otherwise be read back as Markdown syntax.
// Underscores are deliberately left alone (see ../markdown), so identifiers like
// snake_case survive untouched.
function escapeMd(text: string): string {
  return text.replace(/([\\`*[])/g, '\\$1').replace(/~~/g, '\\~\\~')
}

// inlineToMarkdown serialises a node's inline children, applying each text
// node's marks as the matching Markdown delimiters.
function inlineToMarkdown(content: any): string {
  const nodes: any[] = Array.isArray(content) ? content : []
  let out = ''
  for (const n of nodes) {
    if (!n || typeof n !== 'object') continue
    if (n.type === 'hardBreak') {
      out += '\n'
      continue
    }
    if (n.type === 'inlineCard' || n.type === 'blockCard') {
      const url = n.attrs?.url
      if (url) out += url
      continue
    }
    if (n.type === 'mention') {
      out += escapeMd(n.attrs?.text ?? '')
      continue
    }
    if (n.type === 'emoji') {
      out += n.attrs?.text ?? n.attrs?.shortName ?? ''
      continue
    }
    if (n.type !== 'text' || typeof n.text !== 'string') continue
    const marks: any[] = Array.isArray(n.marks) ? n.marks : []
    const has = (t: string) => marks.some((m) => m?.type === t)
    const link = marks.find((m) => m?.type === 'link')
    // Code text is verbatim (only its backticks matter); everything else is escaped.
    let s = has('code') ? '`' + n.text + '`' : escapeMd(n.text)
    if (!has('code')) {
      if (has('strike')) s = `~~${s}~~`
      if (has('em')) s = `*${s}*`
      if (has('strong')) s = `**${s}**`
    }
    if (link?.attrs?.href) s = `[${s}](${link.attrs.href})`
    out += s
  }
  return out
}

// Prefix a leading block marker on any paragraph line with a backslash so the
// text isn't re-parsed as a heading/list/quote.
function escapeLeadingMarkers(md: string): string {
  return md.replace(/^(\s*)(#{1,6}\s|[-+>]\s|\d+[.)]\s)/gm, '$1\\$2')
}

function blockToMarkdown(n: any): string {
  if (!n || typeof n !== 'object') return ''
  switch (n.type) {
    case 'paragraph':
      return escapeLeadingMarkers(inlineToMarkdown(n.content))
    case 'heading': {
      const level = Math.min(6, Math.max(1, n.attrs?.level ?? 1))
      return `${'#'.repeat(level)} ${inlineToMarkdown(n.content)}`
    }
    case 'bulletList':
      return (Array.isArray(n.content) ? n.content : [])
        .map((li: any) => `- ${listItemToMarkdown(li)}`)
        .join('\n')
    case 'orderedList': {
      const start = n.attrs?.order ?? 1
      return (Array.isArray(n.content) ? n.content : [])
        .map((li: any, i: number) => `${start + i}. ${listItemToMarkdown(li)}`)
        .join('\n')
    }
    case 'codeBlock': {
      const lang = n.attrs?.language ?? ''
      const text = (Array.isArray(n.content) ? n.content : [])
        .map((c: any) => (typeof c?.text === 'string' ? c.text : ''))
        .join('')
      return '```' + lang + '\n' + text + '\n```'
    }
    case 'blockquote':
      return (Array.isArray(n.content) ? n.content : [])
        .map(blockToMarkdown)
        .join('\n\n')
        .split('\n')
        .map((line: string) => `> ${line}`)
        .join('\n')
    case 'rule':
      return '---'
    // Media nodes reference attachments surfaced separately in the UI; skip them
    // rather than emit noise.
    case 'mediaSingle':
    case 'mediaGroup':
    case 'media':
      return ''
    default:
      // Unknown block: fall back to its inline text if any, else recurse.
      if (Array.isArray(n.content) && n.content.some((c: any) => c?.type === 'text')) {
        return inlineToMarkdown(n.content)
      }
      return (Array.isArray(n.content) ? n.content : []).map(blockToMarkdown).filter(Boolean).join('\n\n')
  }
}

// listItemToMarkdown collapses a listItem's paragraphs onto a single line (the
// flat-list limitation noted in ../markdown).
function listItemToMarkdown(li: any): string {
  const blocks: any[] = Array.isArray(li?.content) ? li.content : []
  return blocks.map(blockToMarkdown).filter(Boolean).join(' ')
}
