import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import type { Column as ColumnType, Issue } from '../types'
import { useMoveIssue } from '../queries'
import { Column } from './Column'

export function Board({
  boardId,
  columns,
  issues,
  onDelete,
  onOpen,
}: {
  boardId: string
  columns: ColumnType[]
  issues: Issue[]
  onDelete: (key: string) => void
  onOpen: (key: string) => void
}) {
  const move = useMoveIssue(boardId)

  // A small activation distance so clicking a card / its delete button doesn't
  // start a drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // statusId -> owning column index (a status belongs to exactly one column).
  const statusToColumn = new Map<string, number>()
  columns.forEach((c, i) => c.statusIds.forEach((id) => statusToColumn.set(id, i)))

  const byColumn: Issue[][] = columns.map(() => [])
  for (const issue of issues) {
    const idx = statusToColumn.get(issue.statusId)
    if (idx != null) byColumn[idx].push(issue) // unmapped statuses are hidden, as in Jira
  }

  // A drop target's id is the destination status id (a lane). Dropping moves the
  // issue to that status via a workflow transition.
  function onDragEnd(e: DragEndEvent) {
    const key = String(e.active.id)
    const targetStatusId = e.over ? String(e.over.id) : null
    if (!targetStatusId) return
    const issue = issues.find((i) => i.key === key)
    if (!issue || issue.statusId === targetStatusId) return
    move.mutate({ issueKey: key, targetStatusId })
  }

  return (
    <>
      {move.isError && (
        <div className="banner error">Move failed: {(move.error as Error).message}</div>
      )}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="board">
          {columns.map((c, i) => (
            <Column key={c.name} column={c} issues={byColumn[i]} onDelete={onDelete} onOpen={onOpen} />
          ))}
        </div>
      </DndContext>
    </>
  )
}
