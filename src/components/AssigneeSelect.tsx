import type { Assignee } from '../types'
import { InlineError } from './InlineError'

// Shared assignee control used by the main issue and each subtask row. A dropdown
// of the project's assignable users plus an "Unassigned" option; selecting one
// calls `onSelect` with the accountId (or null to unassign). The current assignee
// is kept selectable even when the assignable list hasn't loaded or omits them.
export function AssigneeSelect({
  assignee,
  assignable,
  pending,
  error,
  onSelect,
  className,
}: {
  assignee?: Assignee
  assignable?: Assignee[]
  pending: boolean
  error?: unknown
  onSelect: (accountId: string | null) => void
  className?: string
}) {
  return (
    <>
      <select
        className={`assignee-select${className ? ` ${className}` : ''}`}
        value={assignee?.accountId ?? ''}
        disabled={pending}
        onChange={(e) => onSelect(e.target.value || null)}
        title="Change assignee"
      >
        <option value="">Unassigned</option>
        {assignee && !(assignable ?? []).some((u) => u.accountId === assignee.accountId) && (
          <option value={assignee.accountId}>{assignee.displayName}</option>
        )}
        {(assignable ?? []).map((u) => (
          <option key={u.accountId} value={u.accountId}>
            {u.displayName}
          </option>
        ))}
      </select>
      <InlineError error={error} />
    </>
  )
}
