import { createContext, useContext } from 'react'
import { useDraggable } from '@dnd-kit/core'
import type { QueryKey } from '@tanstack/react-query'
import type { Issue } from '../types'
import { Avatar } from './Avatar'

// Keys of issues matched by the active board search. Cards whose key is in this
// set are ringed on the board so search hits are visible in context. Empty when
// there's no active query.
export const SearchHitContext = createContext<Set<string>>(new Set())

// Shared visual content for both the in-column card and the drag overlay.
function CardInner({ issue }: { issue: Issue }) {
  return (
    <>
      <div className="card-summary">{issue.summary}</div>
      <div className="card-meta">
        {issue.issueTypeIconUrl && <img src={issue.issueTypeIconUrl} alt="" className="type-icon" />}
        <span className="card-key">{issue.key}</span>
        {issue.priority && <span className="priority">{issue.priority}</span>}
        <div className="flex-1" />
        {issue.assignee && <Avatar person={issue.assignee} size="sm" />}
      </div>
    </>
  )
}

export function Card({
  issue,
  sourceKey,
  onDelete,
  onOpen,
}: {
  issue: Issue
  sourceKey: QueryKey
  onDelete: (key: string) => void
  onOpen: (key: string) => void
}) {
  // The draggable carries the issue and its owning lane's query key so the drop
  // handler can move it between lane caches without a flat board array.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: issue.key,
    data: { issue, sourceKey },
  })
  const isSearchHit = useContext(SearchHitContext).has(issue.key)

  // No in-place transform: the moving copy is rendered in a DragOverlay so it
  // floats above the scroll containers instead of being clipped by them. The
  // source card just dims while dragging.
  return (
    <div
      ref={setNodeRef}
      className={`card${isDragging ? ' dragging-source' : ''}${isSearchHit ? ' search-hit' : ''}`}
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
