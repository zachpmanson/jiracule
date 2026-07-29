import { createFileRoute } from '@tanstack/react-router'
import { getAuthContext } from '../server/session.server'

// TEMPORARY debug route — GET /auth/token returns the current session's resolved
// (auto-refreshed) Jira bearer token as plain text. DELETE this file after use.
export const Route = createFileRoute('/auth/token')({
  server: {
    handlers: {
      GET: async () => {
        const auth = await getAuthContext()
        if (!auth) return new Response('not authed', { status: 401 })
        return new Response(auth.token, { headers: { 'content-type': 'text/plain' } })
      },
    },
  },
})
