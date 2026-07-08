// redirectTo builds a 302 response to the given path/URL. Shared by the auth
// route handlers, which all finish by redirecting the browser back somewhere.
export const redirectTo = (location: string) =>
  new Response(null, { status: 302, headers: { Location: location } })
