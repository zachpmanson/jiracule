// Server-only OAuth session handling. Tokens live in an encrypted (sealed)
// cookie via TanStack Start's session API — no server-side store, survives
// restarts, and keeps the app stateless. Import only from server code.
import { useSession } from '@tanstack/react-start/server'

export interface JiraAuth {
  token: string
  cloudId: string
  siteUrl: string
}

interface SessionData {
  accessToken?: string
  refreshToken?: string
  expiresAt?: number // epoch ms
  cloudId?: string
  siteUrl?: string
}

interface OAuthTxn {
  state?: string
  verifier?: string
}

const AUTH_URL = 'https://auth.atlassian.com'
const API_URL = 'https://api.atlassian.com'

export function oauthConfig() {
  const clientId = process.env.ATLASSIAN_CLIENT_ID
  const clientSecret = process.env.ATLASSIAN_CLIENT_SECRET
  const redirectUri = process.env.OAUTH_REDIRECT_URI ?? 'http://localhost:3000/auth/callback'
  if (!clientId || !clientSecret) {
    throw new Error('missing ATLASSIAN_CLIENT_ID / ATLASSIAN_CLIENT_SECRET')
  }
  return { clientId, clientSecret, redirectUri }
}

function sessionPassword() {
  const secret = process.env.SESSION_SECRET
  if (secret && secret.length >= 32) return secret
  // Dev fallback so the app runs before a real secret is set; logs a warning.
  console.warn('SESSION_SECRET missing or <32 chars — using an insecure dev fallback')
  return 'jiracule-dev-insecure-session-password-change-me'
}

// Classic scopes cover all the platform (api/3) endpoints; the Agile board API
// additionally needs a few granular Jira Software scopes. Atlassian allows an app
// to carry both and request a mix ("use classic to the max extent; granular only
// where required").
export const SCOPES = [
  // platform (classic)
  'read:jira-work',
  'write:jira-work',
  'read:jira-user',
  // jira software — agile boards (granular)
  'read:board-scope:jira-software',
  'read:board-scope.admin:jira-software',
  'read:issue-details:jira',
  // refresh tokens
  'offline_access',
].join(' ')

export function getMainSession() {
  return useSession<SessionData>({ password: sessionPassword(), name: 'jiracule_session' })
}

export function getOAuthSession() {
  return useSession<OAuthTxn>({
    password: sessionPassword(),
    name: 'jiracule_oauth',
    maxAge: 600, // the login round-trip is short-lived
  })
}

// exchangeCode swaps an authorization code (+ PKCE verifier) for tokens.
export async function exchangeCode(code: string, verifier: string) {
  const { clientId, clientSecret, redirectUri } = oauthConfig()
  const res = await fetch(`${AUTH_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  })
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`)
  return (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number }
}

async function refreshTokens(refreshToken: string) {
  const { clientId, clientSecret } = oauthConfig()
  const res = await fetch(`${AUTH_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  })
  if (!res.ok) throw new Error(`token refresh failed: ${res.status}`)
  return (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number }
}

// accessibleResources lists the Jira sites the token can reach (for cloudId).
export async function accessibleResources(accessToken: string) {
  const res = await fetch(`${API_URL}/oauth/token/accessible-resources`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`accessible-resources failed: ${res.status}`)
  return (await res.json()) as Array<{ id: string; url: string; name: string }>
}

// getAuthContext resolves the current session into a usable Jira auth context,
// refreshing the access token if it is expired. Returns null when unauthenticated.
export async function getAuthContext(): Promise<JiraAuth | null> {
  const session = await getMainSession()
  const d = session.data
  if (!d.accessToken || !d.cloudId || !d.siteUrl) return null

  const expired = d.expiresAt != null && Date.now() > d.expiresAt - 60_000
  if (expired && d.refreshToken) {
    const t = await refreshTokens(d.refreshToken)
    await session.update({
      accessToken: t.access_token,
      refreshToken: t.refresh_token ?? d.refreshToken,
      expiresAt: Date.now() + t.expires_in * 1000,
    })
    return { token: t.access_token, cloudId: d.cloudId, siteUrl: d.siteUrl }
  }
  return { token: d.accessToken, cloudId: d.cloudId, siteUrl: d.siteUrl }
}
