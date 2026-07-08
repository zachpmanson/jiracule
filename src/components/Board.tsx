import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import type { QueryKey } from '@tanstack/react-query'
import type { Column as ColumnType, Issue } from '../types'
import { useMoveIssue } from '../queries'
import { errMsg } from '../util'
import { CardOverlay } from './Card'
import { Column } from './Column'

// Payloads carried on the dnd-kit draggable/droppable so the drop handler can
// move a card between lane caches without a flat board array.
type DragData = { issue: Issue; sourceKey: QueryKey }
type DropData = { targetKey: QueryKey; targetStatusId: string }

export function Board({
  boardId,
  columns,
  assigneeId,
  onDelete,
  onOpen,
}: {
  boardId: string
  columns: ColumnType[]
  assigneeId?: string
  onDelete: (key: string) => void
  onOpen: (key: string) => void
}) {
  const move = useMoveIssue()
  const [activeIssue, setActiveIssue] = useState<Issue | null>(null)

  // A small activation distance so clicking a card / its delete button doesn't
  // start a drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function onDragStart(e: DragStartEvent) {
    setActiveIssue((e.active.data.current as DragData | undefined)?.issue ?? null)
  }

  // A drop target carries its lane's query key and destination status. Dropping
  // moves the issue to that status via a workflow transition and shuffles the
  // lane caches optimistically.
  function onDragEnd(e: DragEndEvent) {
    setActiveIssue(null)
    if (!e.over) return
    const active = e.active.data.current as DragData | undefined
    const target = e.over.data.current as DropData | undefined
    if (!active || !target) return
    if (active.issue.statusId === target.targetStatusId) return
    move.mutate({
      issueKey: active.issue.key,
      issue: active.issue,
      sourceKey: active.sourceKey,
      targetKey: target.targetKey,
      targetStatusId: target.targetStatusId,
    })
  }

  return (
    <>
      {move.isError && <div className="banner error">Move failed: {errMsg(move.error)}</div>}
      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveIssue(null)}
      >
        <div className="board">
          {columns.map((c, i) => (
            // Key by position, not name: a board can legitimately have two
            // columns with the same name (e.g. two "Backlog" columns).
            <Column
              key={i}
              boardId={boardId}
              column={c}
              assigneeId={assigneeId}
              onDelete={onDelete}
              onOpen={onOpen}
            />
          ))}
        </div>
        {/* No drop animation: the card shouldn't fly back to its origin — the
            optimistic move drops it straight into the target lane. */}
        <DragOverlay dropAnimation={null}>
          {activeIssue ? <CardOverlay issue={activeIssue} /> : null}
        </DragOverlay>
      </DndContext>
    </>
  )
}
