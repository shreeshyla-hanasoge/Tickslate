import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { elementEntries } from './scripts/entries.mjs'

const src = (path) => fileURLToPath(new URL(path, import.meta.url))

// Dev server only. The examples import the package names the README shows;
// these aliases answer them from the source so a page runs before anything is
// published. The build configs (vite.lib/umd/dev.config.js) are separate files
// and never read this one. The longer name goes first so 'tickslate/elements'
// isn't caught by the bare 'tickslate' match. `tickslate/elements/<name>` is
// answered by that widget's define module, the list scripts/entries.mjs reads.
export default defineConfig({
  resolve: {
    alias: [
      ...elementEntries().map((e) => ({ find: new RegExp(`^tickslate/elements/${e.name}$`), replacement: e.input })),
      { find: /^tickslate\/elements$/, replacement: src('./src/elements/index.js') },
      { find: /^tickslate$/, replacement: src('./src/core/index.js') },
    ],
  },
})
