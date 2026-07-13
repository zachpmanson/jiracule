import { useCallback, useEffect, useRef, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import type { Column as ColumnType } from '../types'
import { keys, useLaneIssues } from '../queries'
import { errMsg } from '../util'
import { Card } from './Card'

// A Lane is a single droppable region targeting one status (or, for a pooled
// Agile column, a set of statuses that all drop onto the first one). It owns its
// own paginated query and infinite-scroll trigger, and reports its total up so
// the column header can sum its lanes. `label` shows only when a column stacks
// more than one status.
function Lane({
  boardId,
  laneId,
  statusIds,
  dropStatusId,
  label,
  assigneeId,
  onTotal,
  onDelete,
  onOpen,
}: {
  boardId: string
  laneId: string
  statusIds: string[]
  dropStatusId: string
  label?: string
  assigneeId?: string
  onTotal: (laneId: string, total: number | null) => void
  onDelete: (key: string) => void
  onOpen: (key: string) => void
}) {
  const laneKey = keys.laneIssues(boardId, statusIds, assigneeId)
  const { data, error, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useLaneIssues(
    boardId,
    statusIds,
    assigneeId,
  )
  const issues = data?.pages.flatMap((p) => p.issues) ?? []
  const total = data?.pages[0]?.total ?? null

  const { setNodeRef, isOver } = useDroppable({
    id: dropStatusId,
    data: { targetKey: laneKey, targetStatusId: dropStatusId },
  })

  // Report the lane's total up to the column (for its header badge).
  useEffect(() => onTotal(laneId, total), [laneId, total, onTotal])

  // Infinite scroll: observe a sentinel at the bottom of the (scrolling)
  // lane body and fetch the next page as it comes into view.
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const setBodyRef = (el: HTMLDivElement | null) => {
    bodyRef.current = el
    setNodeRef(el)
  }
  useEffect(() => {
    const root = bodyRef.current
    const target = sentinelRef.current
    if (!root || !target || !hasNextPage) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetchingNextPage) fetchNextPage()
      },
      { root, rootMargin: '120px' },
    )
    obs.observe(target)
    return () => obs.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, issues.length])

  return (
    <div className={`lane${isOver ? ' over' : ''}`}>
      {label && (
        <div className="lane-label">
          <span>{label}</span>
          <span className="count">{total ?? '…'}</span>
        </div>
      )}
      <div ref={setBodyRef} className="lane-body">
        {isLoading && <div className="lane-note">Loading…</div>}
        {error && <div className="lane-note error">{errMsg(error)}</div>}
        {!isLoading && !error && issues.length === 0 && <div className="lane-note">No issues</div>}
        {issues.map((issue) => (
          <Card
            key={issue.key}
            issue={issue}
            sourceKey={laneKey}
            onDelete={onDelete}
            onOpen={onOpen}
          />
        ))}
        <div ref={sentinelRef} className="lane-sentinel" />
        {isFetchingNextPage && <div className="lane-note">Loading more…</div>}
      </div>
    </div>
  )
}

export function Column({
  boardId,
  column,
  assigneeId,
  onDelete,
  onOpen,
}: {
  boardId: string
  column: ColumnType
  assigneeId?: string
  onDelete: (key: string) => void
  onOpen: (key: string) => void
}) {
  // Stack lanes only when a non-pooled column exposes more than one named status
  // (Jira Work Management). Otherwise render one pooled lane whose drop target is
  // the column's primary status (Agile columns / single-status columns).
  const stacked = !column.pooled && (column.statuses?.length ?? 0) > 1

  // For a pooled column, surface the statuses it incorporates as header chips —
  // its name often differs from (and hides) the statuses mapped into it. Skip a
  // lone status whose name just repeats the column name (no new information).
  const pooledNames = column.pooled ? (column.statuses?.map((s) => s.name) ?? []) : []
  const statusChips =
    pooledNames.length === 1 && pooledNames[0].toLowerCase() === column.name.toLowerCase()
      ? []
      : pooledNames

  // Each lane reports its total; the header shows their sum (… until known).
  const [totals, setTotals] = useState<Record<string, number | null>>({})
  const reportTotal = useCallback((laneId: string, total: number | null) => {
    setTotals((prev) => (prev[laneId] === total ? prev : { ...prev, [laneId]: total }))
  }, [])
  const known = Object.values(totals).filter((t): t is number => t != null)
  const columnTotal = known.length ? known.reduce((a, b) => a + b, 0) : null

  return (
    <div className="column">
      <div className="column-header">
        <div className="column-header-top">
          <span>{column.name}</span>
          <span className="count">{columnTotal ?? '…'}</span>
        </div>
        {statusChips.length > 0 && (
          <div className="column-statuses">
            {statusChips.map((name) => (
              <span key={name} className="status-chip">
                {name}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="column-body">
        {stacked ? (
          column.statuses!.map((s) => (
            <Lane
              key={s.id}
              boardId={boardId}
              laneId={s.id}
              statusIds={[s.id]}
              dropStatusId={s.id}
              label={s.name}
              assigneeId={assigneeId}
              onTotal={reportTotal}
              onDelete={onDelete}
              onOpen={onOpen}
            />
          ))
        ) : (
          <Lane
            boardId={boardId}
            laneId="pooled"
            statusIds={column.statusIds}
            dropStatusId={column.statusIds[0]}
            assigneeId={assigneeId}
            onTotal={reportTotal}
            onDelete={onDelete}
            onOpen={onOpen}
          />
        )}
      </div>
    </div>
  )
}
