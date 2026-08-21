import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

// Mount the built app under a URL subpath (e.g. "/staging/") when BASE_PATH is
// set; default to "/" so the production build is unchanged. Vite bakes this into
// BASE_URL (see src/base-path.ts), which the router + absolute links use.
const base = process.env.BASE_PATH ? `/${process.env.BASE_PATH.replace(/^\/+|\/+$/g, '')}/` : '/'

const config = defineConfig({
  base,
  resolve: { tsconfigPaths: true },
  // nitro builds a standalone node server at .output/server/index.mjs
  // (run: node .output/server/index.mjs), used by the Nix package.
  plugins: [tailwindcss(), nitro(), tanstackStart(), viteReact()],
})

export default config
