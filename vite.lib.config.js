import { defineConfig } from 'vite'

/**
 * Library build — ESM, multi-entry.
 *
 *   tickslate            -> src/core/index.js      (framework-free logic, no DOM side effects)
 *   tickslate/elements   -> src/elements/index.js  (registers the custom elements on import)
 *
 * tokens.css is not a Vite entry; pack-lib.mjs copies it into dist-lib/.
 *
 * Emberwick is an optional peer (the mini-chart widget draws with it), so it
 * is never bundled.
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
        index: 'src/core/index.js',
        elements: 'src/elements/index.js',
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: ['emberwick'],
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
  },
})
