// Runtime base path for server-rendered responses. The client gets its subpath
// from Vite's at-build-time base (see src/base-path.ts); the server reads the
// same value from the environment so its redirects land back inside the subpath.
//
// Under a subpath mount, Caddy strips "/staging" BEFORE reverse-proxying, so the
// server only ever sees root paths ("/auth/callback") and cannot infer the public
// prefix from the request. The staging systemd unit therefore sets BASE_PATH=/staging
// and every server redirect is prefixed with it. Production (no BASE_PATH) is root.
const SERVER_BASE_PATH = (process.env.BASE_PATH || '')
  .replace(/^\/+|\/+$/g, '')
  .replace(/\/$/, '')

export const serverBase = (path: string) => {
  const base = SERVER_BASE_PATH ? `/${SERVER_BASE_PATH}` : ''
  return base + (path.startsWith('/') ? path : `/${path}`)
}

// redirectTo builds a 302 response to the given location (relative to the app's
// base path). Shared by the auth route handlers, which all finish by redirecting
// the browser back somewhere.
export const redirectTo = (location: string) =>
  new Response(null, { status: 302, headers: { Location: serverBase(location) } })
