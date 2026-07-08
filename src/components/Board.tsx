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

  // A small activation distance so clicking the delete button / reading a card
  // doesn't start a drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // statusId -> column name, and column name -> its primary (first) status id.
  const statusToColumn = new Map<string, string>()
  const columnPrimaryStatus = new Map<string, string>()
  for (const c of columns) {
    columnPrimaryStatus.set(c.name, c.statusIds[0])
    for (const id of c.statusIds) statusToColumn.set(id, c.name)
  }

  const byColumn: Record<string, Issue[]> = {}
  for (const c of columns) byColumn[c.name] = []
  for (const issue of issues) {
    const col = statusToColumn.get(issue.statusId)
    if (col) byColumn[col].push(issue) // unmapped statuses are hidden, as in Jira
  }

  function onDragEnd(e: DragEndEvent) {
    const key = String(e.active.id)
    const target = e.over ? String(e.over.id) : null
    if (!target) return
    const issue = issues.find((i) => i.key === key)
    if (!issue) return
    if (statusToColumn.get(issue.statusId) === target) return
    const targetStatusId = columnPrimaryStatus.get(target)
    if (!targetStatusId) return
    move.mutate({ issueKey: key, targetColumnName: target, targetStatusId })
  }

  return (
    <>
      {move.isError && (
        <div className="banner error">
          Move failed: {(move.error as Error).message}
        </div>
      )}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="board">
          {columns.map((c) => (
            <Column
              key={c.name}
              name={c.name}
              issues={byColumn[c.name]}
              onDelete={onDelete}
              onOpen={onOpen}
            />
          ))}
        </div>
      </DndContext>
    </>
  )
}
