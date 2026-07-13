import { useEffect, useState } from 'react'
import type { Assignee, Attachment, InlineSegment, SubtaskRef } from '../types'
import { formatBytes } from '../util'
import {
  useAddComment,
  useAssignableUsers,
  useCreateSubtask,
  useDeleteSubtask,
  useIssueDetail,
  useIssueTransitions,
  useLabelSuggestions,
  usePriorities,
  useProjectIssueTypes,
  useSearch,
  useTransitionIssue,
  useTransitionSubtask,
  useUpdateAssignee,
  useUpdateDescription,
  useUpdateLabels,
  useUpdateParent,
  useUpdatePriority,
  useUpdateSubtaskAssignee,
  useUpdateSummary,
} from '../queries'
import { Person } from './Avatar'
import { AssigneeSelect } from './AssigneeSelect'
import { InlineEditor } from './InlineEditor'
import { InlineError } from './InlineError'
import { RichText } from './Linkified'
import { StatusSelect } from './StatusSelect'

const segmentsToText = (segments: InlineSegment[]) => segments.map((s) => s.text).join('')

function fmtDate(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleString()
}

export function IssueDetailModal({
  issueKey,
  boardId,
  onClose,
  onDelete,
  onOpen,
}: {
  issueKey: string
  boardId?: string
  onClose: () => void
  onDelete: (key: string) => void
  onOpen?: (key: string) => void
}) {
  const { data: issue, isLoading, error } = useIssueDetail(issueKey)
  const { data: transitions } = useIssueTransitions(issueKey)
  const { data: assignable } = useAssignableUsers(issueKey)
  const applyTransition = useTransitionIssue(issueKey)
  const updateAssignee = useUpdateAssignee(issueKey)
  const updateDesc = useUpdateDescription(issueKey)
  const updateSummary = useUpdateSummary(issueKey)
  const updateParent = useUpdateParent(issueKey)
  const updatePriority = useUpdatePriority(issueKey)
  const updateLabels = useUpdateLabels(issueKey)
  const { data: priorities } = usePriorities()
  const addComment = useAddComment(issueKey)

  const [editingDesc, setEditingDesc] = useState(false)
  const [descDraft, setDescDraft] = useState('')
  const [commentDraft, setCommentDraft] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [editingParent, setEditingParent] = useState(false)
  const [editingLabels, setEditingLabels] = useState(false)

  function startEditTitle() {
    setTitleDraft(issue?.summary ?? '')
    setEditingTitle(true)
  }
  function saveTitle() {
    const summary = titleDraft.trim()
    if (!summary) return
    updateSummary.mutate(summary, { onSuccess: () => setEditingTitle(false) })
  }
  function startEdit() {
    setDescDraft(issue ? segmentsToText(issue.description) : '')
    setEditingDesc(true)
  }
  function saveDesc() {
    updateDesc.mutate(descDraft, { onSuccess: () => setEditingDesc(false) })
  }
  function submitComment() {
    const body = commentDraft.trim()
    if (!body) return
    addComment.mutate(body, { onSuccess: () => setCommentDraft('') })
  }

  // Escape dismisses the modal — but first backs out of an inline editor if one
  // is open, so it doesn't discard an in-progress edit unexpectedly.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (editingTitle) setEditingTitle(false)
      else if (editingDesc) setEditingDesc(false)
      else if (editingParent) setEditingParent(false)
      else if (editingLabels) setEditingLabels(false)
      else onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [editingTitle, editingDesc, editingParent, editingLabels, onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal detail" onClick={(e) => e.stopPropagation()}>
        <div className="detail-head">
          <div className="detail-idline">
            {issue?.issueTypeIconUrl && (
              <img src={issue.issueTypeIconUrl} alt="" className="type-icon" />
            )}
            <span className="card-key">{issueKey}</span>
          </div>
          <button className="icon-btn" title="Close" onClick={onClose}>
            ×
          </button>
        </div>

        {isLoading && <div className="placeholder">Loading…</div>}
        <InlineError error={error} />

        {issue && (
          <>
            {editingTitle ? (
              <InlineEditor
                value={titleDraft}
                onChange={setTitleDraft}
                onSave={saveTitle}
                onCancel={() => setEditingTitle(false)}
                pending={updateSummary.isPending}
                error={updateSummary.error}
                requireNonEmpty
                singleLine
                autoFocus
              />
            ) : (
              <h2 className="detail-title">
                <span>{issue.summary}</span>
                <button className="link-btn" onClick={startEditTitle}>
                  Edit
                </button>
              </h2>
            )}

            <div className="detail-body">
              <div className="detail-main">
                <div className="section-label">
                  Description
                  {!editingDesc && (
                    <button className="link-btn" onClick={startEdit}>
                      Edit
                    </button>
                  )}
                </div>
                {editingDesc ? (
                  <InlineEditor
                    value={descDraft}
                    onChange={setDescDraft}
                    onSave={saveDesc}
                    onCancel={() => setEditingDesc(false)}
                    pending={updateDesc.isPending}
                    error={updateDesc.error}
                    rows={6}
                    autoFocus
                  />
                ) : (
                  <div className="detail-desc">
                    {issue.description.length ? (
                      <RichText segments={issue.description} />
                    ) : (
                      <span className="muted">No description</span>
                    )}
                  </div>
                )}

                <SubtaskSection
                  parentKey={issueKey}
                  boardId={boardId}
                  subtasks={issue.subtasks}
                  assignable={assignable}
                  canAdd={!issue.isSubtask}
                  onOpen={onOpen}
                />

                {issue.attachments.length > 0 && (
                  <AttachmentSection attachments={issue.attachments} />
                )}

                <div className="section-label section-label-spaced">
                  Comments ({issue.comments.length})
                </div>
                {issue.comments.length > 0 && (
                  <ul className="comments">
                    {issue.comments.map((c) => (
                      <li key={c.id} className="comment">
                        <div className="comment-head">
                          <Person person={c.author} />
                          <span className="muted">{fmtDate(c.updated ?? c.created)}</span>
                        </div>
                        <div className="comment-body">
                          <RichText segments={c.body} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <InlineEditor
                  className="comment-composer"
                  value={commentDraft}
                  onChange={setCommentDraft}
                  onSave={submitComment}
                  pending={addComment.isPending}
                  error={addComment.error}
                  placeholder="Add a comment…"
                  saveLabel="Comment"
                  savingLabel="Adding…"
                  requireNonEmpty
                />
              </div>

              <aside className="detail-side">
                <dl className="detail-grid">
                  <dt>Status</dt>
                  <dd>
                    <StatusSelect
                      statusName={issue.statusName}
                      transitions={transitions}
                      pending={applyTransition.isPending}
                      error={applyTransition.error}
                      onSelect={(id) => applyTransition.mutate(id)}
                    />
                  </dd>
                  <dt>Assignee</dt>
                  <dd>
                    <AssigneeSelect
                      assignee={issue.assignee}
                      assignable={assignable}
                      pending={updateAssignee.isPending}
                      error={updateAssignee.error}
                      onSelect={(id) => updateAssignee.mutate(id)}
                    />
                  </dd>
                  <dt>Parent</dt>
                  <dd>
                    {editingParent ? (
                      <ParentPicker
                        boardId={boardId}
                        pending={updateParent.isPending}
                        error={updateParent.error}
                        hasParent={!!issue.parent}
                        onSelect={(key) =>
                          updateParent.mutate(key, {
                            onSuccess: () => setEditingParent(false),
                          })
                        }
                        onClear={() =>
                          updateParent.mutate(null, {
                            onSuccess: () => setEditingParent(false),
                          })
                        }
                        onCancel={() => setEditingParent(false)}
                      />
                    ) : (
                      <div className="parent-row">
                        {issue.parent ? (
                          <button
                            type="button"
                            className="parent-chip"
                            onClick={() => onOpen?.(issue.parent!.key)}
                            title={issue.parent.summary ?? issue.parent.key}
                          >
                            <span className="card-key">{issue.parent.key}</span>
                            {issue.parent.summary && (
                              <span className="parent-summary">{issue.parent.summary}</span>
                            )}
                          </button>
                        ) : (
                          <span className="muted">—</span>
                        )}
                        <button className="link-btn" onClick={() => setEditingParent(true)}>
                          {issue.parent ? 'Edit' : 'Set parent'}
                        </button>
                      </div>
                    )}
                  </dd>
                  <dt>Reporter</dt>
                  <dd>
                    <Person person={issue.reporter} />
                  </dd>
                  <dt>Type</dt>
                  <dd>{issue.issueType ?? '—'}</dd>
                  <dt>Priority</dt>
                  <dd>
                    <select
                      className="assignee-select"
                      value={issue.priority ?? ''}
                      disabled={updatePriority.isPending}
                      onChange={(e) => {
                        if (e.target.value) updatePriority.mutate(e.target.value)
                      }}
                    >
                      {/* Keep the current priority selectable even if the list
                          hasn't loaded or doesn't include it. */}
                      {issue.priority &&
                        !(priorities ?? []).some((p) => p.name === issue.priority) && (
                          <option value={issue.priority}>{issue.priority}</option>
                        )}
                      {!issue.priority && <option value="">—</option>}
                      {(priorities ?? []).map((p) => (
                        <option key={p.id} value={p.name}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <InlineError error={updatePriority.error} />
                  </dd>
                  <dt>Labels</dt>
                  <dd>
                    {editingLabels ? (
                      <LabelsEditor
                        initial={issue.labels}
                        pending={updateLabels.isPending}
                        error={updateLabels.error}
                        onSave={(labels) =>
                          updateLabels.mutate(labels, {
                            onSuccess: () => setEditingLabels(false),
                          })
                        }
                        onCancel={() => setEditingLabels(false)}
                      />
                    ) : (
                      <div className="parent-row">
                        {issue.labels.length ? (
                          <span className="labels">
                            {issue.labels.map((l) => (
                              <span key={l} className="label-chip">
                                {l}
                              </span>
                            ))}
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                        <button className="link-btn" onClick={() => setEditingLabels(true)}>
                          {issue.labels.length ? 'Edit' : 'Add labels'}
                        </button>
                      </div>
                    )}
                  </dd>
                  <dt>Created</dt>
                  <dd>{fmtDate(issue.created)}</dd>
                  <dt>Updated</dt>
                  <dd>{fmtDate(issue.updated)}</dd>
                </dl>
              </aside>
            </div>

            <div className="modal-actions">
              {issue.browseUrl && (
                <a className="link-btn" href={issue.browseUrl} target="_blank" rel="noreferrer">
                  Open in Jira ↗
                </a>
              )}
              <div className="flex-1" />
              <button
                className="danger"
                onClick={() => {
                  onDelete(issueKey)
                  onClose()
                }}
              >
                Delete
              </button>
              <button onClick={onClose}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// Lists an issue's subtasks (click-through to open each) and, unless the issue is
// itself a subtask, offers an inline composer to create a new one.
function SubtaskSection({
  parentKey,
  boardId,
  subtasks,
  assignable,
  canAdd,
  onOpen,
}: {
  parentKey: string
  boardId?: string
  subtasks: SubtaskRef[]
  assignable?: Assignee[]
  canAdd: boolean
  onOpen?: (key: string) => void
}) {
  const [adding, setAdding] = useState(false)
  return (
    <>
      <div className="section-label section-label-spaced">
        Subtasks ({subtasks.length})
        {canAdd && !adding && (
          <button className="link-btn" onClick={() => setAdding(true)}>
            Add subtask
          </button>
        )}
      </div>
      {subtasks.length > 0 && (
        <ul className="subtasks">
          {subtasks.map((s) => (
            <li key={s.key}>
              <SubtaskRow
                subtask={s}
                parentKey={parentKey}
                boardId={boardId}
                assignable={assignable}
                onOpen={onOpen}
              />
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <SubtaskComposer
          parentKey={parentKey}
          boardId={boardId}
          onClose={() => setAdding(false)}
        />
      )}
    </>
  )
}

// Read-only list of an issue's attachments. Images show a thumbnail (streamed
// through the /attachment proxy); everything else shows a generic file glyph.
// Clicking downloads the full file via the same proxy, using the anchor's
// `download` attribute (same-origin) to preserve the original filename.
function AttachmentSection({ attachments }: { attachments: Attachment[] }) {
  return (
    <>
      <div className="section-label section-label-spaced">
        Attachments ({attachments.length})
      </div>
      <ul className="attachments">
        {attachments.map((a) => (
          <li key={a.id}>
            <a
              className="attachment"
              href={`/attachment/${a.id}`}
              download={a.filename}
              title={`Download ${a.filename}`}
            >
              {a.isImage ? (
                <img
                  className="attachment-thumb"
                  src={`/attachment/${a.id}?thumb=1`}
                  alt=""
                  loading="lazy"
                />
              ) : (
                <span className="attachment-thumb attachment-icon" aria-hidden="true">
                  📄
                </span>
              )}
              <span className="attachment-meta">
                <span className="attachment-name">{a.filename}</span>
                <span className="muted">{formatBytes(a.size)}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </>
  )
}

function SubtaskRow({
  subtask,
  parentKey,
  boardId,
  assignable,
  onOpen,
}: {
  subtask: SubtaskRef
  parentKey: string
  boardId?: string
  assignable?: Assignee[]
  onOpen?: (key: string) => void
}) {
  const del = useDeleteSubtask(parentKey, boardId)
  const { data: transitions } = useIssueTransitions(subtask.key)
  const transition = useTransitionSubtask(subtask.key, parentKey)
  const assignee = useUpdateSubtaskAssignee(subtask.key, parentKey)
  return (
    <div className="subtask-row">
      <div className="subtask-card">
        <div className="subtask-line1">
          <button
            type="button"
            className="subtask-open"
            onClick={() => onOpen?.(subtask.key)}
            title={subtask.summary || subtask.key}
          >
            {subtask.issueTypeIconUrl && (
              <img src={subtask.issueTypeIconUrl} alt="" className="type-icon" />
            )}
            <span className="card-key">{subtask.key}</span>
          </button>
          <div className="subtask-meta">
            <AssigneeSelect
              assignee={subtask.assignee}
              assignable={assignable}
              pending={assignee.isPending}
              error={assignee.error}
              onSelect={(id) => assignee.mutate(id)}
              className="subtask-assignee"
            />
            <StatusSelect
              statusName={subtask.statusName}
              transitions={transitions}
              pending={transition.isPending}
              error={transition.error}
              onSelect={(id) => transition.mutate(id)}
              className="subtask-status"
            />
            <button
              className="icon-btn subtask-delete"
              title={`Delete ${subtask.key}`}
              disabled={del.isPending}
              onClick={() => {
                if (window.confirm(`Delete ${subtask.key}? This cannot be undone.`))
                  del.mutate(subtask.key)
              }}
            >
              ×
            </button>
          </div>
        </div>
        <button
          type="button"
          className="subtask-title"
          onClick={() => onOpen?.(subtask.key)}
          title={subtask.summary || subtask.key}
        >
          {subtask.summary}
        </button>
      </div>
      <InlineError error={del.error} />
    </div>
  )
}

// Inline composer for a new subtask. Resolves the project's subtask issue-type
// name (required by create-issue) from the parent's project, derived from its key.
function SubtaskComposer({
  parentKey,
  boardId,
  onClose,
}: {
  parentKey: string
  boardId?: string
  onClose: () => void
}) {
  const projectKey = parentKey.split('-')[0]
  const { data: types } = useProjectIssueTypes(projectKey)
  const create = useCreateSubtask(parentKey, boardId)
  const [summary, setSummary] = useState('')

  const subtaskType = (types ?? []).find((t) => t.subtask)
  const noSubtaskType = types != null && !subtaskType

  function submit() {
    const s = summary.trim()
    if (!s || !subtaskType) return
    create.mutate(
      { projectKey, issueType: subtaskType.name, summary: s },
      { onSuccess: () => onClose() },
    )
  }

  if (noSubtaskType) {
    return (
      <div className="muted subtask-composer">
        This project has no subtask issue type.{' '}
        <button className="link-btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div className="subtask-composer">
      <input
        type="text"
        autoFocus
        placeholder="Subtask summary…"
        value={summary}
        disabled={create.isPending}
        onChange={(e) => setSummary(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          else if (e.key === 'Escape') onClose()
        }}
      />
      <InlineError error={create.error} />
      <div className="subtask-composer-actions">
        <button className="link-btn" disabled={create.isPending} onClick={onClose}>
          Cancel
        </button>
        <button
          className="primary"
          disabled={create.isPending || !summary.trim() || !subtaskType}
          onClick={submit}
        >
          {create.isPending ? 'Adding…' : 'Add'}
        </button>
      </div>
    </div>
  )
}

// Debounced search-and-select for choosing a parent issue. Mirrors SearchPanel's
// result list, but selecting a result sets the parent instead of opening it.
function ParentPicker({
  boardId,
  pending,
  error,
  hasParent,
  onSelect,
  onClear,
  onCancel,
}: {
  boardId?: string
  pending: boolean
  error: unknown
  hasParent: boolean
  onSelect: (key: string) => void
  onClear: () => void
  onCancel: () => void
}) {
  const [input, setInput] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    if (input === q) return
    const t = setTimeout(() => setQ(input), 300)
    return () => clearTimeout(t)
  }, [input, q])

  const { data: results, isFetching } = useSearch(q, boardId, false)
  const open = q.trim().length > 0

  return (
    <div className="parent-picker">
      <input
        type="search"
        autoFocus
        placeholder="Search issues…"
        value={input}
        disabled={pending}
        onChange={(e) => setInput(e.target.value)}
      />
      {open && (
        <div className="search-results">
          {isFetching && <div className="search-item muted">Searching…</div>}
          {!isFetching && results?.length === 0 && (
            <div className="search-item muted">No matches</div>
          )}
          {results?.map((i) => (
            <button
              key={i.key}
              type="button"
              className="search-item"
              disabled={pending}
              onClick={() => onSelect(i.key)}
            >
              <span className="card-key">{i.key}</span>
              <span className="search-summary">{i.summary}</span>
              <span className="muted">{i.statusName}</span>
            </button>
          ))}
        </div>
      )}
      <InlineError error={error} />
      <div className="parent-picker-actions">
        {hasParent && (
          <button className="link-btn" disabled={pending} onClick={onClear}>
            Clear parent
          </button>
        )}
        <button className="link-btn" disabled={pending} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}

// Chip input for the label set: shows current labels as removable chips, and a
// debounced search box that autocompletes existing Jira labels (or creates a new
// one from the typed text). Editing is against a local draft; Save commits it.
function LabelsEditor({
  initial,
  pending,
  error,
  onSave,
  onCancel,
}: {
  initial: string[]
  pending: boolean
  error: unknown
  onSave: (labels: string[]) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<string[]>(initial)
  const [input, setInput] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    if (input === q) return
    const t = setTimeout(() => setQ(input), 300)
    return () => clearTimeout(t)
  }, [input, q])

  const { data: suggestions, isFetching } = useLabelSuggestions(q)

  function add(label: string) {
    const l = label.trim()
    if (!l || draft.includes(l)) {
      setInput('')
      return
    }
    setDraft([...draft, l])
    setInput('')
    setQ('')
  }
  function remove(label: string) {
    setDraft(draft.filter((l) => l !== label))
  }

  const typed = input.trim()
  // Suggestions not already chosen; Jira labels can't contain spaces.
  const options = (suggestions ?? []).filter((s) => !draft.includes(s))
  const canCreate = typed.length > 0 && !options.includes(typed) && !draft.includes(typed)
  const open = q.trim().length > 0

  return (
    <div className="parent-picker">
      {draft.length > 0 && (
        <span className="labels">
          {draft.map((l) => (
            <span key={l} className="label-chip">
              {l}
              <button
                type="button"
                aria-label={`Remove ${l}`}
                disabled={pending}
                onClick={() => remove(l)}
              >
                ×
              </button>
            </span>
          ))}
        </span>
      )}
      <input
        type="search"
        autoFocus
        placeholder="Add a label…"
        value={input}
        disabled={pending}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && typed) {
            e.preventDefault()
            add(typed)
          }
        }}
      />
      {open && (
        <div className="search-results">
          {isFetching && <div className="search-item muted">Searching…</div>}
          {options.map((s) => (
            <button
              key={s}
              type="button"
              className="search-item"
              disabled={pending}
              onClick={() => add(s)}
            >
              {s}
            </button>
          ))}
          {canCreate && (
            <button
              type="button"
              className="search-item"
              disabled={pending}
              onClick={() => add(typed)}
            >
              + create “{typed}”
            </button>
          )}
          {!isFetching && options.length === 0 && !canCreate && (
            <div className="search-item muted">No matches</div>
          )}
        </div>
      )}
      <InlineError error={error} />
      <div className="parent-picker-actions">
        <button className="link-btn" disabled={pending} onClick={() => onSave(draft)}>
          Save
        </button>
        <button className="link-btn" disabled={pending} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
