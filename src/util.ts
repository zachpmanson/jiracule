// errMsg normalizes an unknown thrown value into a display string. Server
// functions reject with Error instances, but the catch type is `unknown`, so
// components used to cast with `(e as Error).message` everywhere — this centralizes it.
export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  return String(e)
}
