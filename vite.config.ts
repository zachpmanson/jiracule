import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  // nitro builds a standalone node server at .output/server/index.mjs
  // (run: node .output/server/index.mjs), used by the Nix package.
  plugins: [nitro(), tanstackStart(), viteReact()],
})

export default config
