import { useDroppable } from '@dnd-kit/core'
import type { Issue } from '../types'
import { Card } from './Card'

export function Column({
  name,
  issues,
  onDelete,
  onOpen,
}: {
  name: string
  issues: Issue[]
  onDelete: (key: string) => void
  onOpen: (key: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: name })

  return (
    <div ref={setNodeRef} className={`column${isOver ? ' over' : ''}`}>
      <div className="column-header">
        <span>{name}</span>
        <span className="count">{issues.length}</span>
      </div>
      <div className="column-body">
        {issues.map((issue) => (
          <Card key={issue.key} issue={issue} onDelete={onDelete} onOpen={onOpen} />
        ))}
      </div>
    </div>
  )
}
