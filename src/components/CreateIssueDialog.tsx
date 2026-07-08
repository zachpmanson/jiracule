import { useState } from 'react'
import type { Assignee } from '../types'
import { useCreateIssue } from '../queries'

export function CreateIssueDialog({
  boardId,
  defaultProjectKey,
  assignees,
  onClose,
}: {
  boardId: string
  defaultProjectKey: string
  assignees: Assignee[]
  onClose: () => void
}) {
  const create = useCreateIssue(boardId)
  const [projectKey, setProjectKey] = useState(defaultProjectKey)
  const [issueType, setIssueType] = useState('Task')
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [assigneeId, setAssigneeId] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!projectKey.trim() || !summary.trim()) return
    create.mutate(
      {
        projectKey: projectKey.trim(),
        issueType: issueType.trim() || 'Task',
        summary: summary.trim(),
        description: description.trim() || undefined,
        assigneeId: assigneeId || undefined,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>New issue</h2>
        <label>
          Project key
          <input value={projectKey} onChange={(e) => setProjectKey(e.target.value)} required />
        </label>
        <label>
          Issue type
          <input value={issueType} onChange={(e) => setIssueType(e.target.value)} />
        </label>
        <label>
          Summary
          <input value={summary} onChange={(e) => setSummary(e.target.value)} autoFocus required />
        </label>
        <label>
          Description
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </label>
        <label>
          Assignee
          <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">Unassigned</option>
            {assignees.map((a) => (
              <option key={a.accountId} value={a.accountId}>
                {a.displayName}
              </option>
            ))}
          </select>
        </label>
        {create.isError && <div className="inline-error">{(create.error as Error).message}</div>}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  )
}
