import { useDraggable } from '@dnd-kit/core'
import type { Issue } from '../types'

export function Card({
  issue,
  onDelete,
  onOpen,
}: {
  issue: Issue
  onDelete: (key: string) => void
  onOpen: (key: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: issue.key,
  })

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`card${isDragging ? ' dragging' : ''}`}
      onClick={() => onOpen(issue.key)}
      {...attributes}
    >
      <button
        className="card-delete"
        title="Delete issue"
        onClick={(e) => {
          e.stopPropagation()
          onDelete(issue.key)
        }}
      >
        ×
      </button>
      <div className="card-summary" {...listeners}>
        {issue.summary}
      </div>
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
    </div>
  )
}
