import { createFileRoute } from '@tanstack/react-router'
import { getMainSession } from '../server/session.server'

// POST /auth/logout — clear the session cookie and return to the app.
export const Route = createFileRoute('/auth/logout')({
  server: {
    handlers: {
      POST: async () => {
        const session = await getMainSession()
        await session.clear()
        return new Response(null, { status: 302, headers: { Location: '/' } })
      },
    },
  },
})
