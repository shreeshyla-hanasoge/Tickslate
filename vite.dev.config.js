import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { elementEntries, root } from './scripts/entries.mjs'

const coreEntry = resolve(root, 'src/core/index.js')

/**
 * Development build — dist-lib/dev/ (RFC 0003 §2.2, replacing RFC 0002's single
 * elements.dev.js).
 *
 * The same entries as the production elements build (the all-in `elements` and
 * one per define module), built with __TS_DEV__ true so every warning is kept.
 * The files are:
 *
 *   dist-lib/dev/elements.js
 *   dist-lib/dev/elements/<name>.js
 *   dist-lib/dev/chunks/…       (shared among the development files only)
 *
 * The core stays external and points at dist-lib/index.js, so the production
 * and development trees share one core and one configure() state: a host that
 * swaps between them (or loads both) never gets two copies of the formatter
 * settings. Production and development files never import each other.
 *
 * Run with: npm run build:dev  (after build:lib, whose emptyOutDir wipes
 * dist-lib/)
 */
export default defineConfig({
  define: { __TS_DEV__: 'true' },
  build: {
    outDir: 'dist-lib/dev',
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    target: 'es2019',
    lib: {
      entry: {
        elements: resolve(root, 'src/elements/index.js'),
        ...Object.fromEntries(elementEntries().map((e) => [`elements/${e.name}`, e.input])),
      },
      formats: ['es'],
    },
    rollupOptions: {
      // Rollup asks twice: with the raw specifier, then with the resolved
      // path. Only the resolved path identifies the core reliably.
      external: (id) => id === 'emberwick' || resolve(id) === coreEntry,
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        // A relative path here is read from dist-lib/dev/, and rollup rewrites
        // it for each file's depth: ../index.js from elements.js,
        // ../../index.js from elements/<name>.js and chunks/*.js. It is
        // dist-lib/index.js, the one core the production tree builds.
        paths: (id) => (resolve(id) === coreEntry ? '../index.js' : id),
      },
    },
  },
})
