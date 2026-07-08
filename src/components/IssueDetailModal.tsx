import { useState } from 'react'
import type { Assignee } from '../types'
import { useAddComment, useIssueDetail, useUpdateDescription } from '../queries'
import { Linkified } from './Linkified'

function Person({ person }: { person?: Assignee }) {
  if (!person) return <span className="muted">Unassigned</span>
  return (
    <span className="person">
      {person.avatarUrl ? (
        <img src={person.avatarUrl} alt="" className="avatar sm" />
      ) : (
        <span className="avatar sm initials">{person.displayName.slice(0, 2).toUpperCase()}</span>
      )}
      {person.displayName}
    </span>
  )
}

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
  const updateDesc = useUpdateDescription(issueKey)
  const addComment = useAddComment(issueKey)

  const [editingDesc, setEditingDesc] = useState(false)
  const [descDraft, setDescDraft] = useState('')
  const [commentDraft, setCommentDraft] = useState('')

  function startEdit() {
    setDescDraft(issue?.description ?? '')
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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal detail" onClick={(e) => e.stopPropagation()}>
        <div className="detail-head">
          <div className="detail-idline">
            {issue?.issueTypeIconUrl && (
              <img src={issue.issueTypeIconUrl} alt="" className="type-icon" />
            )}
            <span className="card-key">{issueKey}</span>
            {issue?.statusName && <span className="status-badge">{issue.statusName}</span>}
          </div>
          <button className="icon-btn" title="Close" onClick={onClose}>
            ×
          </button>
        </div>

        {isLoading && <div className="placeholder">Loading…</div>}
        {error && <div className="inline-error">{(error as Error).message}</div>}

        {issue && (
          <>
            <h2 className="detail-title">{issue.summary}</h2>

            <dl className="detail-grid">
              <dt>Assignee</dt>
              <dd>
                <Person person={issue.assignee} />
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

            <div className="section-label">
              Description
              {!editingDesc && (
                <button className="link-btn" onClick={startEdit}>
                  Edit
                </button>
              )}
            </div>
            {editingDesc ? (
              <div className="editor">
                <textarea
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  rows={6}
                  autoFocus
                />
                {updateDesc.isError && (
                  <div className="inline-error">{(updateDesc.error as Error).message}</div>
                )}
                <div className="editor-actions">
                  <button onClick={() => setEditingDesc(false)}>Cancel</button>
                  <button className="primary" onClick={saveDesc} disabled={updateDesc.isPending}>
                    {updateDesc.isPending ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="detail-desc">
                {issue.description ? (
                  <Linkified text={issue.description} />
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
                      <Linkified text={c.body} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="editor comment-composer">
              <textarea
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                placeholder="Add a comment…"
                rows={2}
              />
              {addComment.isError && (
                <div className="inline-error">{(addComment.error as Error).message}</div>
              )}
              <div className="editor-actions">
                <button
                  className="primary"
                  onClick={submitComment}
                  disabled={addComment.isPending || !commentDraft.trim()}
                >
                  {addComment.isPending ? 'Adding…' : 'Comment'}
                </button>
              </div>
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
