import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { root } from './scripts/entries.mjs'

const VIRTUAL = 'virtual:tickslate-cdn'
const RESOLVED = '\0' + VIRTUAL

/**
 * The one entry a plain <script> needs: everything `tickslate` and
 * `tickslate/elements` export, and every element registered. `version` comes
 * from both, but it is one binding re-exported, so `export *` does not clash.
 * A virtual module keeps this out of src/, where it would look like a public
 * entry.
 */
function cdnEntry() {
  return {
    name: 'tickslate-cdn-entry',
    // Vite resolves a lib entry against the project root before plugins see it.
    resolveId: (id) => (id === VIRTUAL || id.endsWith('/' + VIRTUAL) ? RESOLVED : null),
    load: (id) =>
      id === RESOLVED
        ? `export * from ${JSON.stringify(resolve(root, 'src/core/index.js'))}\n` +
          `export * from ${JSON.stringify(resolve(root, 'src/elements/index.js'))}\n`
        : null,
  }
}

/**
 * esbuild lowers class fields for es2019 and puts its helpers (`var Qo=…`) at
 * the top of the file, outside the IIFE's wrapper, where a classic script makes
 * them globals: a page's later `const E` would then be a SyntaxError, and a
 * global `E` would be clobbered. Wrapping the whole file in one function leaves
 * `Tickslate` as the only name the script adds. It runs in generateBundle,
 * after vite's own renderChunk transforms, which would otherwise add the
 * helpers after any wrapper put on earlier.
 */
function isolateIife() {
  return {
    name: 'tickslate-isolate-iife',
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk' || !chunk.fileName.endsWith('.iife.js')) continue
        if (!chunk.code.includes('var Tickslate=')) this.error(`${chunk.fileName} no longer declares \`var Tickslate=\`, so it cannot be wrapped`)
        chunk.code = `var Tickslate=function(){${chunk.code}\nreturn Tickslate}();\n`
      }
    },
  }
}

/**
 * CDN builds (RFC 0003 §2.3) — core and every element in one minified file,
 * in two formats:
 *
 *   dist-lib/cdn/tickslate.js       ESM, for <script type="module"> or an import map
 *   dist-lib/cdn/tickslate.iife.js  IIFE, sets window.Tickslate; what "unpkg" and "jsdelivr" serve
 *
 * Production only: __TS_DEV__ is false, so the bundle carries no development
 * warnings. The core-only UMD (vite.umd.config.js) is a separate, unchanged file.
 *
 * Run with: npm run build:cdn  (after build:lib — emptyOutDir is off here)
 */
export default defineConfig({
  define: { __TS_DEV__: 'false' },
  plugins: [cdnEntry(), isolateIife()],
  build: {
    outDir: 'dist-lib/cdn',
    emptyOutDir: false,
    // No source maps: these two files are minified for a script tag, and a map
    // five times their size would be published beside them for nobody to load.
    sourcemap: false,
    // Not library mode on purpose: it keeps an ES file's whitespace so a
    // bundler downstream can read it, and nothing bundles these two files. An
    // ordinary build with explicit outputs minifies both in full.
    minify: 'esbuild',
    target: 'es2019',
    modulePreload: false,
    rollupOptions: {
      input: VIRTUAL,
      preserveEntrySignatures: 'strict',
      output: [
        { format: 'es', entryFileNames: 'tickslate.js' },
        { format: 'iife', name: 'Tickslate', entryFileNames: 'tickslate.iife.js' },
      ],
    },
  },
})
