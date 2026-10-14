import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const src = (path) => resolve(root, path)
const { version } = JSON.parse(readFileSync(src('package.lib.json'), 'utf8'))

// A project page lives under /<repo>/, so assets must be addressed from there.
// SITE_BASE=./ makes every URL relative instead, for opening the folder from
// any path (a quick local check, or a host that serves it at the root).
const base = process.env.SITE_BASE || '/Tickslate/'

// Third-party hosts are not allowed on the site: the page must work with the
// network off and must not tell anyone who visited. The dev pages link the web
// fonts from Google (nicer in development); the site uses the system fallback
// the tokens already name, so those links are dropped from the built HTML.
// Inline scripts and comments are left alone on purpose: the playground's Copy
// HTML builds a page that links the CDN, and that text is data, not a request.
const INERT = /<script\b[\s\S]*?<\/script>|<!--[\s\S]*?-->/gi
const EXTERNAL_LINK = /<link\b[^>]*\bhref=["']https?:\/\/[^"']*["'][^>]*>\s*/gi
// What would still reach another host once the links above are gone.
const EXTERNAL_REF = /<(?:link|script|img|iframe|source|video|audio)\b[^>]*\b(?:href|src)=["'](?:https?:)?\/\/|url\(\s*["']?(?:https?:)?\/\//i

function offlineSite() {
  return {
    name: 'tickslate-offline-site',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replace(new RegExp(`${INERT.source}|${EXTERNAL_LINK.source}`, 'gi'), (m) => (/^<(?:script|!--)/i.test(m) ? m : '')),
    },
    // Fail the build rather than ship a page that phones home, so a link added
    // to a page later is caught by `npm run build:site` and not by a visitor.
    generateBundle(_, bundle) {
      for (const file of Object.values(bundle)) {
        const text = file.type === 'asset' && /\.(html|css)$/.test(file.fileName) ? String(file.source) : ''
        if (EXTERNAL_REF.test(text.replace(INERT, ''))) {
          this.error(`${file.fileName} references another host. The site must not load anything third-party.`)
        }
      }
    },
  }
}

/**
 * Static demo site, for GitHub Pages: dist-site/ holds the playground, the
 * widget gallery and the examples, built from the same pages `npm run dev`
 * serves. Nothing here ships in the package.
 *
 * The pages import the package names the README shows (`tickslate`,
 * `tickslate/elements`) or the source paths; the aliases answer both from the
 * source, built exactly as the library build is (`__TS_DEV__` off), so the
 * site demonstrates the code that gets published.
 *
 * Run with: npm run build:site  (preview with npm run preview:site)
 */
export default defineConfig({
  base,
  // False as in the library build, so development warnings and strings are dropped.
  define: {
    __TS_DEV__: 'false',
    // The playground's Copy HTML pins the CDN URL to the version it was built from.
    __TICKSLATE_VERSION__: JSON.stringify(version),
  },
  resolve: {
    alias: [
      // The longer name goes first so 'tickslate/elements' isn't caught by the bare match.
      { find: /^tickslate\/elements$/, replacement: src('src/elements/index.js') },
      { find: /^tickslate$/, replacement: src('src/core/index.js') },
    ],
  },
  plugins: [offlineSite()],
  build: {
    outDir: 'dist-site',
    emptyOutDir: true,
    target: 'es2019',
    rollupOptions: {
      input: {
        index: src('index.html'),
        widgets: src('widgets.html'),
        examples: src('examples/index.html'),
        'examples/quickstart': src('examples/quickstart.html'),
        'examples/generic': src('examples/generic.html'),
        'examples/bare': src('examples/bare.html'),
      },
    },
  },
})
