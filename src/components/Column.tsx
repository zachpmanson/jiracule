import { useDroppable } from '@dnd-kit/core'
import type { Column as ColumnType, Issue } from '../types'
import { Card } from './Card'

// A Lane is a single droppable region targeting one status. `label` is shown only
// when a column stacks more than one status.
function Lane({
  statusId,
  label,
  issues,
  onDelete,
  onOpen,
}: {
  statusId: string
  label?: string
  issues: Issue[]
  onDelete: (key: string) => void
  onOpen: (key: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: statusId })
  return (
    <div className={`lane${isOver ? ' over' : ''}`}>
      {label && (
        <div className="lane-label">
          <span>{label}</span>
          <span className="count">{issues.length}</span>
        </div>
      )}
      <div ref={setNodeRef} className="lane-body">
        {issues.map((issue) => (
          <Card key={issue.key} issue={issue} onDelete={onDelete} onOpen={onOpen} />
        ))}
      </div>
    </div>
  )
}

export function Column({
  column,
  issues,
  onDelete,
  onOpen,
}: {
  column: ColumnType
  issues: Issue[]
  onDelete: (key: string) => void
  onOpen: (key: string) => void
}) {
  // Stack lanes only when the column exposes more than one named status
  // (Jira Work Management). Otherwise render one pooled lane whose drop target is
  // the column's primary status (Agile columns / single-status columns).
  const stacked = (column.statuses?.length ?? 0) > 1

  return (
    <div className="column">
      <div className="column-header">
        <span>{column.name}</span>
        <span className="count">{issues.length}</span>
      </div>
      <div className="column-body">
        {stacked ? (
          column.statuses!.map((s) => (
            <Lane
              key={s.id}
              statusId={s.id}
              label={s.name}
              issues={issues.filter((i) => i.statusId === s.id)}
              onDelete={onDelete}
              onOpen={onOpen}
            />
          ))
        ) : (
          <Lane
            statusId={column.statusIds[0]}
            issues={issues}
            onDelete={onDelete}
            onOpen={onOpen}
          />
        )}
      </div>
    </div>
  )
}
