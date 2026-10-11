import { defineConfig } from 'vite'

/**
 * UMD build — one minified file for a plain <script> tag / CDN use.
 * Core only for now: exposes window.Tickslate.
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
