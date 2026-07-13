import type { Transition } from '../types'
import { InlineError } from './InlineError'

// Shared workflow-status control used by both the main issue status and each
// subtask row. Renders a dropdown of available transitions with the current
// status as the resting label; selecting one calls `onSelect` with its id. Falls
// back to a plain badge when there are no transitions (none offered, or not yet
// loaded). Any transition error renders inline beneath it.
export function StatusSelect({
  statusName,
  transitions,
  pending,
  error,
  onSelect,
  className,
}: {
  statusName: string
  transitions?: Transition[]
  pending: boolean
  error?: unknown
  onSelect: (transitionId: string) => void
  className?: string
}) {
  if (!transitions || transitions.length === 0) {
    return <span className="status-badge">{statusName}</span>
  }
  return (
    <>
      <select
        className={`status-select${className ? ` ${className}` : ''}`}
        value=""
        disabled={pending}
        onChange={(e) => {
          if (e.target.value) onSelect(e.target.value)
        }}
        title="Change status"
      >
        <option value="">{pending ? 'Updating…' : statusName}</option>
        {transitions.map((t) => (
          <option key={t.id} value={t.id}>
            {t.toStatusName ?? t.name}
          </option>
        ))}
      </select>
      <InlineError error={error} />
    </>
  )
}
