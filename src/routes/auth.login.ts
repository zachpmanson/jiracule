import { createFileRoute } from '@tanstack/react-router'
import { createHash, randomBytes } from 'node:crypto'
import { getOAuthSession, oauthConfig, SCOPES } from '../server/session.server'

const base64url = (b: Buffer) =>
  b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

// GET /auth/login — start the OAuth 2.0 (3LO) flow with PKCE + state, then
// redirect the browser to Atlassian's consent screen.
export const Route = createFileRoute('/auth/login')({
  server: {
    handlers: {
      GET: async () => {
        const { clientId, redirectUri } = oauthConfig()
        const state = base64url(randomBytes(16))
        const verifier = base64url(randomBytes(32))
        const challenge = base64url(createHash('sha256').update(verifier).digest())

        const oauth = await getOAuthSession()
        await oauth.update({ state, verifier })

        const url = new URL('https://auth.atlassian.com/authorize')
        url.searchParams.set('audience', 'api.atlassian.com')
        url.searchParams.set('client_id', clientId)
        url.searchParams.set('scope', SCOPES)
        url.searchParams.set('redirect_uri', redirectUri)
        url.searchParams.set('state', state)
        url.searchParams.set('response_type', 'code')
        url.searchParams.set('prompt', 'consent')
        url.searchParams.set('code_challenge', challenge)
        url.searchParams.set('code_challenge_method', 'S256')

        return new Response(null, { status: 302, headers: { Location: url.toString() } })
      },
    },
  },
})
