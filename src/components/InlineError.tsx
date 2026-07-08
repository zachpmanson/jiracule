import { errMsg } from '../util'

// InlineError renders the standard red inline-error line, or nothing when there
// is no error. Accepts any thrown value (mutation/query `.error` is `unknown`).
export function InlineError({ error }: { error: unknown }) {
  if (!error) return null
  return <div className="inline-error">{errMsg(error)}</div>
}
