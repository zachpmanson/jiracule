import type { ReactNode } from 'react'
import { NOT_AUTHENTICATED } from '../auth-constants'
import { useMe } from '../queries'
import { errMsg } from '../util'

const AUTH_ERRORS: Record<string, string> = {
  state: 'Login could not be verified. Please try again.',
  nosite: 'No accessible Jira site was found for your account.',
  exchange: 'Could not complete sign-in with Atlassian. Please try again.',
}

function ConnectScreen() {
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const err = params?.get('authError')
  return (
    <div className="connect">
      <div className="connect-card">
        <h1>jiracule</h1>
        <p className="muted">Connect your Jira account to continue.</p>
        {err && <p className="inline-error">{AUTH_ERRORS[err] ?? 'Sign-in failed.'}</p>}
        <a className="primary connect-btn" href="/auth/login">
          Connect Jira
        </a>
      </div>
    </div>
  )
}

// AuthGate renders the app only when the user has a valid Jira session; otherwise
// it shows the connect screen. Unauthenticated server functions reject with
// NOT_AUTHENTICATED, which `useMe` surfaces here.
export function AuthGate({ children }: { children: ReactNode }) {
  const me = useMe()
  if (me.isLoading) return <div className="placeholder">Loading…</div>
  if (me.error) {
    const msg = errMsg(me.error)
    if (msg === NOT_AUTHENTICATED) return <ConnectScreen />
    return <div className="placeholder error">{msg}</div>
  }
  return <>{children}</>
}
