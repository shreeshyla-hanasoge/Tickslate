import { defineConfig } from 'vite'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const coreEntry = resolve(root, 'src/core/index.js')

/**
 * Development build — dist-lib/elements.dev.js (RFC 0002 §7.3, §8).
 *
 * The same entry as the production elements.js, built with __TS_DEV__ true so
 * every warning is kept. The core stays external and is imported as
 * './index.js', exactly as in the library build, so both files share one core
 * and one configure() state: a host that swaps between them (or loads both)
 * never gets two copies of the formatter settings.
 *
 * Run with: npm run build:dev  (after build:lib, whose emptyOutDir wipes
 * dist-lib/)
 */
export default defineConfig({
  define: { __TS_DEV__: 'true' },
  build: {
    outDir: 'dist-lib',
    emptyOutDir: false,
    sourcemap: true,
    minify: false,
    target: 'es2019',
    lib: {
      entry: { 'elements.dev': 'src/elements/index.js' },
      formats: ['es'],
    },
    rollupOptions: {
      // Rollup asks twice: with the raw specifier, then with the resolved
      // path. Only the resolved path identifies the core reliably.
      external: (id) => id === 'emberwick' || resolve(id) === coreEntry,
      output: {
        entryFileNames: '[name].js',
        paths: (id) => (resolve(id) === coreEntry ? './index.js' : id),
      },
    },
  },
})
