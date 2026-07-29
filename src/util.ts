import type { Board } from './types'

// groupByProject buckets boards under their project, preserving the order
// listBoards returned them in (boards already arrive grouped by project). Used
// by the board switcher (<optgroup>s) and the homepage (per-project sections).
export function groupByProject(boards?: Board[]): { name: string; boards: Board[] }[] {
  const groups: { name: string; boards: Board[] }[] = []
  const index = new Map<string, { name: string; boards: Board[] }>()
  for (const b of boards ?? []) {
    const name = b.projectName ?? b.projectKey ?? '—'
    let g = index.get(name)
    if (!g) {
      g = { name, boards: [] }
      index.set(name, g)
      groups.push(g)
    }
    g.boards.push(b)
  }
  return groups
}

// errMsg normalizes an unknown thrown value into a display string. Server
// functions reject with Error instances, but the catch type is `unknown`, so
// components used to cast with `(e as Error).message` everywhere — this centralizes it.
export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  return String(e)
}

// formatBytes renders a byte count as a compact human size (e.g. "3.4 MB").
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`
}
