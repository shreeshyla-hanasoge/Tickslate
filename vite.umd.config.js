import { defineConfig } from 'vite'

/**
 * UMD build — the core only, as one minified file: exposes window.Tickslate.
 * It has no elements. The one-script bundle with every element is the CDN
 * build (vite.cdn.config.js), which "unpkg" and "jsdelivr" point at.
 *
 * Run with: npm run build:umd  (after build:lib — emptyOutDir is off here)
 */
export default defineConfig({
  build: {
    outDir: 'dist-lib/umd',
    emptyOutDir: false,
    sourcemap: true,
    minify: 'esbuild',
    target: 'es2019',
    lib: {
      entry: 'src/core/index.js',
      name: 'Tickslate',
      formats: ['umd'],
      fileName: () => 'tickslate.umd.js',
    },
  },
})
