import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

const src = (path) => fileURLToPath(new URL(path, import.meta.url))

// Dev server only. The examples import the package names the README shows;
// these aliases answer them from the source so a page runs before anything is
// published. The build configs (vite.lib/umd/dev.config.js) are separate files
// and never read this one. The longer name goes first so 'tickslate/elements'
// isn't caught by the bare 'tickslate' match.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^tickslate\/elements$/, replacement: src('./src/elements/index.js') },
      { find: /^tickslate$/, replacement: src('./src/core/index.js') },
    ],
  },
})
