import { useDraggable } from '@dnd-kit/core'
import type { Issue } from '../types'

// Shared visual content for both the in-column card and the drag overlay.
function CardInner({ issue }: { issue: Issue }) {
  return (
    <>
      <div className="card-summary">{issue.summary}</div>
      <div className="card-meta">
        {issue.issueTypeIconUrl && <img src={issue.issueTypeIconUrl} alt="" className="type-icon" />}
        <span className="card-key">{issue.key}</span>
        {issue.priority && <span className="priority">{issue.priority}</span>}
        <div className="spacer" />
        {issue.assignee &&
          (issue.assignee.avatarUrl ? (
            <img
              src={issue.assignee.avatarUrl}
              alt={issue.assignee.displayName}
              title={issue.assignee.displayName}
              className="avatar sm"
            />
          ) : (
            <span className="avatar sm initials" title={issue.assignee.displayName}>
              {issue.assignee.displayName.slice(0, 2).toUpperCase()}
            </span>
          ))}
      </div>
    </>
  )
}

export function Card({ issue, onDelete, onOpen }: { issue: Issue; onDelete: (key: string) => void; onOpen: (key: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: issue.key })

  // No in-place transform: the moving copy is rendered in a DragOverlay so it
  // floats above the scroll containers instead of being clipped by them. The
  // source card just dims while dragging.
  return (
    <div
      ref={setNodeRef}
      className={`card${isDragging ? ' dragging-source' : ''}`}
      onClick={() => onOpen(issue.key)}
      {...attributes}
      {...listeners}
    >
      <button
        className="card-delete"
        title="Delete issue"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onDelete(issue.key)
        }}
      >
        ×
      </button>
      <CardInner issue={issue} />
    </div>
  )
}

// Presentational card rendered inside the DragOverlay while dragging.
export function CardOverlay({ issue }: { issue: Issue }) {
  return (
    <div className="card card-overlay">
      <CardInner issue={issue} />
    </div>
  )
}
