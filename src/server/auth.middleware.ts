// Server-function middleware that resolves the OAuth session into a Jira auth
// context and attaches it to the request context. Server functions read
// `context.jira` to make authenticated calls.
import { createMiddleware } from '@tanstack/react-start'
import { NOT_AUTHENTICATED } from '../auth-constants'
import { getAuthContext } from './session.server'

export const authMiddleware = createMiddleware().server(async ({ next }) => {
  const jira = await getAuthContext()
  if (!jira) throw new Error(NOT_AUTHENTICATED)
  return next({ context: { jira } })
})
