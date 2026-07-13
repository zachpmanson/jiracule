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
