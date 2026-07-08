import { createFileRoute } from '@tanstack/react-router'
import {
  accessibleResources,
  exchangeCode,
  getMainSession,
  getOAuthSession,
} from '../server/session.server'

const redirectTo = (path: string) =>
  new Response(null, { status: 302, headers: { Location: path } })

// GET /auth/callback — verify state, exchange the code for tokens, resolve the
// Jira site (cloudId), persist the session, and return to the app.
export const Route = createFileRoute('/auth/callback')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')

        const oauth = await getOAuthSession()
        const { state: expectedState, verifier } = oauth.data
        await oauth.clear()

        if (!code || !state || !verifier || state !== expectedState) {
          return redirectTo('/?authError=state')
        }

        try {
          const tok = await exchangeCode(code, verifier)
          const sites = await accessibleResources(tok.access_token)
          const site = sites[0]
          if (!site) return redirectTo('/?authError=nosite')

          const session = await getMainSession()
          await session.update({
            accessToken: tok.access_token,
            refreshToken: tok.refresh_token,
            expiresAt: Date.now() + tok.expires_in * 1000,
            cloudId: site.id,
            siteUrl: site.url,
          })
          return redirectTo('/')
        } catch {
          return redirectTo('/?authError=exchange')
        }
      },
    },
  },
})
