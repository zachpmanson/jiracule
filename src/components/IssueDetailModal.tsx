import { useEffect, useState } from 'react'
import type { InlineSegment } from '../types'
import {
  useAddComment,
  useAssignableUsers,
  useIssueDetail,
  useIssueTransitions,
  useTransitionIssue,
  useUpdateAssignee,
  useUpdateDescription,
  useUpdateSummary,
} from '../queries'
import { Person } from './Avatar'
import { InlineEditor } from './InlineEditor'
import { InlineError } from './InlineError'
import { RichText } from './Linkified'

const segmentsToText = (segments: InlineSegment[]) => segments.map((s) => s.text).join('')

function fmtDate(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleString()
}

export function IssueDetailModal({
  issueKey,
  onClose,
  onDelete,
}: {
  issueKey: string
  onClose: () => void
  onDelete: (key: string) => void
}) {
  const { data: issue, isLoading, error } = useIssueDetail(issueKey)
  const { data: transitions } = useIssueTransitions(issueKey)
  const { data: assignable } = useAssignableUsers(issueKey)
  const applyTransition = useTransitionIssue(issueKey)
  const updateAssignee = useUpdateAssignee(issueKey)
  const updateDesc = useUpdateDescription(issueKey)
  const updateSummary = useUpdateSummary(issueKey)
  const addComment = useAddComment(issueKey)

  const [editingDesc, setEditingDesc] = useState(false)
  const [descDraft, setDescDraft] = useState('')
  const [commentDraft, setCommentDraft] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')

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
      else onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [editingTitle, editingDesc, onClose])

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

                <div className="section-label">Comments ({issue.comments.length})</div>
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
                    {transitions && transitions.length > 0 ? (
                      <select
                        className="status-select"
                        value=""
                        disabled={applyTransition.isPending}
                        onChange={(e) => {
                          if (e.target.value) applyTransition.mutate(e.target.value)
                        }}
                        title="Change status"
                      >
                        <option value="">
                          {applyTransition.isPending ? 'Updating…' : issue.statusName}
                        </option>
                        {transitions.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.toStatusName ?? t.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="status-badge">{issue.statusName}</span>
                    )}
                    <InlineError error={applyTransition.error} />
                  </dd>
                  <dt>Assignee</dt>
                  <dd>
                    <select
                      className="assignee-select"
                      value={issue.assignee?.accountId ?? ''}
                      disabled={updateAssignee.isPending}
                      onChange={(e) => updateAssignee.mutate(e.target.value || null)}
                    >
                      <option value="">Unassigned</option>
                      {/* Keep the current assignee selectable even if the assignable
                          list hasn't loaded or doesn't include them. */}
                      {issue.assignee &&
                        !(assignable ?? []).some(
                          (u) => u.accountId === issue.assignee!.accountId,
                        ) && (
                          <option value={issue.assignee.accountId}>
                            {issue.assignee.displayName}
                          </option>
                        )}
                      {(assignable ?? []).map((u) => (
                        <option key={u.accountId} value={u.accountId}>
                          {u.displayName}
                        </option>
                      ))}
                    </select>
                    <InlineError error={updateAssignee.error} />
                  </dd>
                  <dt>Reporter</dt>
                  <dd>
                    <Person person={issue.reporter} />
                  </dd>
                  <dt>Type</dt>
                  <dd>{issue.issueType ?? '—'}</dd>
                  <dt>Priority</dt>
                  <dd>{issue.priority ?? '—'}</dd>
                  <dt>Labels</dt>
                  <dd>
                    {issue.labels.length ? (
                      <span className="labels">
                        {issue.labels.map((l) => (
                          <span key={l} className="label-chip">
                            {l}
                          </span>
                        ))}
                      </span>
                    ) : (
                      '—'
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
              <div className="spacer" />
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
