// Client-safe constants shared between the auth middleware (server) and the UI.
// No server-only imports here.

// Thrown by the auth middleware when there is no valid session; the UI shows the
// connect screen when a query fails with this message.
export const NOT_AUTHENTICATED = 'NOT_AUTHENTICATED'
