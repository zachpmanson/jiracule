import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { BASE_PATH } from './base-path'

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    // Base path so client-side navigation emits /staging/… URLs when the app is
    // mounted under a subpath (see base-path.ts). Root for production. Vite bakes
    // this in at build time, so the router and the built asset URLs stay in sync.
    basepath: BASE_PATH,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
