import { defineConfig } from 'vite'
import { elementEntries, root } from './scripts/entries.mjs'
import { resolve } from 'node:path'

/**
 * Library build — ESM, multi-entry (RFC 0003 §2).
 *
 *   tickslate                  -> src/core/index.js      (framework-free logic, no DOM side effects)
 *   tickslate/elements         -> src/elements/index.js  (registers every custom element on import)
 *   tickslate/elements/<name>  -> src/elements/define/*.js (registers one element; found, not listed)
 *
 * Shared code lands in dist-lib/chunks/. tokens.css is not a Vite entry;
 * pack-lib.mjs copies it into dist-lib/.
 *
 * Emberwick is an optional peer (the mini-chart widget draws with it), so it
 * is never bundled: neither the package nor its subpath entries (emberwick/profiles).
 *
 * Run with: npm run build:lib
 */
export default defineConfig({
  // False in production so every `if (DEV) warnOnce(…)` is dropped; the
  // development build (vite.dev.config.js) sets it true.
  define: { __TS_DEV__: 'false' },
  build: {
    outDir: 'dist-lib',
    emptyOutDir: true,
    sourcemap: true,
    minify: false, // consumers minify; readable output helps debugging
    target: 'es2019',
    lib: {
      entry: {
        index: resolve(root, 'src/core/index.js'),
        elements: resolve(root, 'src/elements/index.js'),
        ...Object.fromEntries(elementEntries().map((e) => [`elements/${e.name}`, e.input])),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: [/^emberwick(\/|$)/],
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
  },
})
