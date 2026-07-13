import { createFileRoute } from '@tanstack/react-router'
import { getAuthContext } from '../server/session.server'

// GET /attachment/$id — authenticated proxy that streams a Jira attachment's
// bytes to the browser. Tokens are server-only (encrypted cookie), so the
// browser can never hit Jira's attachment URLs directly; this route attaches the
// Bearer token and streams the response through. `?thumb=1` serves the image
// thumbnail (used for previews); otherwise the full content is served.
//
// `redirect=false` makes Jira return the bytes directly rather than a 302 to a
// media host that would need its own auth.
export const Route = createFileRoute('/attachment/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const jira = await getAuthContext()
        if (!jira) return new Response('Not authenticated', { status: 401 })

        const thumb = new URL(request.url).searchParams.get('thumb') === '1'
        const kind = thumb ? 'thumbnail' : 'content'
        const upstream = await fetch(
          `https://api.atlassian.com/ex/jira/${jira.cloudId}/rest/api/3/attachment/${kind}/${encodeURIComponent(params.id)}?redirect=false`,
          { headers: { Authorization: `Bearer ${jira.token}` } },
        )
        if (!upstream.ok || !upstream.body) {
          return new Response('Attachment unavailable', { status: upstream.status || 502 })
        }

        const headers = new Headers()
        const contentType = upstream.headers.get('content-type')
        if (contentType) headers.set('Content-Type', contentType)
        const contentLength = upstream.headers.get('content-length')
        if (contentLength) headers.set('Content-Length', contentLength)
        // Per-user content behind auth — let the browser cache it, but privately.
        headers.set('Cache-Control', 'private, max-age=300')
        return new Response(upstream.body, { status: 200, headers })
      },
    },
  },
})
