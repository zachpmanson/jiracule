// Build-time base path, derived from Vite's `base` config (set per environment).
//
// - Production build (base = "/")        → BASE_URL "/"  → basePath ""  (root)
// - Staging build   (base = "/staging/") → BASE_URL "/staging/" → basePath "/staging"
//
// We mount staging under a URL subpath on the SAME host as prod. Caddy strips the
// prefix before reverse-proxying to the staging instance, so the server always
// renders at root internally — but the browser must emit `/staging/…` URLs so the
// stripped route (and thus the staging origin) is hit. A subpath must therefore be
// prefixed on every absolute link/asset/navigation the app generates.
export const BASE_PATH = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '')

export const withBase = (path: string) => `${BASE_PATH}${path}`
