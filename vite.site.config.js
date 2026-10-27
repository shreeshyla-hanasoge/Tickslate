import { defineConfig } from 'vite'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname, relative, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { elementEntries } from './scripts/entries.mjs'
import { docPages, renderDocPage, renderDocsHub, siteHeader, siteFooter, THEME_BOOT } from './scripts/site-docs.mjs'
import { escapeHtml } from './scripts/md.mjs'

const root = dirname(fileURLToPath(import.meta.url))
const src = (path) => resolve(root, path)
const read = (path) => readFileSync(src(path), 'utf8')
const { version } = JSON.parse(read('package.lib.json'))

// The version the site tells visitors to install. It defaults to the one in
// package.lib.json, but between a version bump on master and `npm publish`
// that version is not on npm yet, and a pinned CDN tag for it is a 404. So a
// deploy in that window sets SITE_VERSION to the published version, and the
// pages say which version the docs describe. RELEASING.md: redeploy with it
// unset once the release is out.
function checkVersion(v) {
  if (!/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(v)) throw new Error(`SITE_VERSION must be a version such as 0.1.0; got "${v}".`)
  return v
}

// Third-party hosts are not allowed on the site: the page must work with the
// network off and must not tell anyone who visited. The dev pages link the web
// fonts from Google (nicer in development); the site uses the system fallback
// the tokens already name, so exactly those links, and nothing else, are
// removed from the built HTML. Any other link to another host fails the build.
// Inline scripts and comments are left alone on purpose: the playground's Copy
// HTML builds a page that links the CDN, and that text is data, not a request.
const INERT = /<script\b[\s\S]*?<\/script[^>]*>|<!--[\s\S]*?--!?>/gi
const FONT_LINK = /<link\b[^>]*\bhref=["']https:\/\/fonts\.(?:googleapis|gstatic)\.com[^"']*["'][^>]*>\s*/gi
// What would reach another host: an element that loads a URL, a CSS url() or @import.
const EXTERNAL_REF = /<(?:link|script|img|iframe|source|video|audio|embed|object)\b[^>]*\b(?:href|src|data)=["'](?:https?:)?\/\/|url\(\s*["']?(?:https?:)?\/\/|@import\s*(?:url\(\s*)?["']?(?:https?:)?\/\//i
// The same in script: a dynamic import, a URL or a fetch of an absolute address.
const EXTERNAL_JS = /\bimport\(\s*["'`](?:https?:)?\/\/|\bnew URL\(\s*["'`](?:https?:)?\/\/|\bfetch\(\s*["'`](?:https?:)?\/\//
// For the check, a script keeps its opening tag (and so its src) and loses only
// its body, so an external <script src> is caught while inline text is not.
const forCheck = (text) => {
  let out = text.replace(/(<script\b[^>]*>)[\s\S]*?<\/script[^>]*>/gi, '$1</script>')
  // Repeated until stable: removing one comment can join the text around it into another.
  for (let prev = ''; prev !== out;) {
    prev = out
    out = out.replace(/<!--[\s\S]*?--!?>/g, '')
  }
  return out
}

function offlineSite() {
  return {
    name: 'tickslate-offline-site',
    // After Vite's HTML plugin, or the pages aren't in the bundle yet to check.
    enforce: 'post',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replace(new RegExp(`${INERT.source}|${FONT_LINK.source}`, 'gi'), (m) => (/^<(?:script|!--)/i.test(m) ? m : '')),
    },
    // Fail the build rather than ship a page that phones home, so a link added
    // to a page later is caught by `npm run build:site` and not by a visitor.
    generateBundle(_, bundle) {
      for (const file of Object.values(bundle)) {
        const markup = file.type === 'asset' && /\.(html|css)$/.test(file.fileName) ? forCheck(String(file.source)) : ''
        const script = file.type === 'chunk' ? file.code : ''
        if (EXTERNAL_REF.test(markup) || EXTERNAL_JS.test(script)) {
          this.error(`${file.fileName} references another host. The site must not load anything third-party.`)
        }
      }
    },
  }
}

// ── The site's pages ────────────────────────────────────────────────────────
//
// The repository keeps the playground at index.html and the gallery at
// widgets.html, where `npm run dev` and the tests expect them, and the landing
// page under site/. The build publishes them at the URLs a visitor uses:
//
//   site/index.html      ->  /index.html        the landing page
//   index.html           ->  /playground.html
//   widgets.html         ->  /widgets.html
//   examples/*.html      ->  /examples/*.html
//   site/404.html        ->  /404.html
//   docs/**/*.md         ->  /docs/**/*.html    generated, never written to the repo
//   CHANGELOG.md         ->  /changelog.html
//
// Every URL names a file. Some hosts (LambdaDeploy among them) answer a path
// with no file with the root page, so /docs/ would show the landing page.

const PUBLISHED = { 'site/index.html': 'index.html', 'index.html': 'playground.html', 'site/404.html': '404.html' }

// Pages from the repository that get the shared site bar and footer, and which
// nav entry is theirs. Each carries `<!-- site-header -->` and `<!-- site-footer -->`
// markers. Every page gets the bar's theme switch; on a page with its own theme
// buttons (the playground, generic example) site/theme.js keeps the two in step.
const BAR_PAGES = { 'index.html': 'playground', 'widgets.html': 'widgets' }
const barKey = (file) => BAR_PAGES[file] || (file.startsWith('examples/') ? 'examples' : file.startsWith('site/') ? 'home' : '')

const exampleFiles = () => readdirSync(src('examples')).filter((f) => f.endsWith('.html')).sort().map((f) => `examples/${f}`)

/** The generated pages, keyed by the source-relative path they are served from. */
function generatedPages() {
  const pages = docPages(root, read)
  const out = new Map()
  out.set('site/docs/index.html', () => renderDocsHub(pages))
  for (const page of pages) {
    const at = page.path === '/changelog.html' ? 'site/changelog.html' : `site${page.path}`
    out.set(at, () => renderDocPage(page, pages, read))
  }
  return { pages, out }
}

const README_QUICKSTART = () => {
  const m = read('README.md').match(/<!-- quickstart -->\n```html\n([\s\S]*?)```\n<!-- \/quickstart -->/)
  return m ? m[1].trimEnd() : ''
}

function sitePages({ base, siteVersion }) {
  const ahead = siteVersion !== version
  const virtualPrefix = src('site') + '/'
  let generated = generatedPages()
  const isVirtual = (id) => id.startsWith(virtualPrefix) && generated.out.has(relative(root, id).split(posix.sep).join('/'))

  // A link written as /x in a site page means the site root; the base goes in front.
  const withBase = (html) => html.replace(/(<a\b[^>]*?\bhref=")\/(?!\/)/g, `$1${base}`)

  function transform(html, file) {
    let out = html
    // The bar, where the page asks for it.
    out = out.replace(/<!-- site-header(?: \w+)? -->/, () => siteHeader({ current: barKey(file), skip: 'main' }))
    out = out.replace('<!-- site-footer -->', () => siteFooter({ version: siteVersion }))
    if (out !== html && !file.startsWith('site/')) {
      out = out.replace('</head>', `<link rel="stylesheet" href="/site/bar.css">\n<link rel="icon" href="/site/favicon.svg" type="image/svg+xml">\n${THEME_BOOT}\n<script type="module" src="/site/theme.js"></script>\n</head>`)
    }
    // In the repository a link to index.html is the playground; on the site
    // index.html is the landing page.
    if (!file.startsWith('site/')) {
      out = out.replace(/(<a\b[^>]*?\bhref=")((?:\.\.\/|\.\/)*)index\.html"/g, (m, pre, up) => {
        const target = posix.normalize(posix.join(posix.dirname(file), up, 'index.html'))
        return target === 'index.html' ? `${pre}${up}playground.html"` : m
      })
    }
    // Page copy in the site's own pages names the version too. Not in the
    // repository's pages, whose inline scripts read the define instead.
    if (file.startsWith('site/')) {
      out = out.replace(/__TICKSLATE_VERSION__/g, siteVersion)
      out = out.replace(/__TICKSLATE_DOCS_VERSION__/g, version)
      out = out.replace(/<!-- version-notice -->/g, ahead
        ? `<p class="notice">These pages describe ${version}, which is on master. The package on npm is ${siteVersion} until ${version} is released, so the install lines name ${siteVersion}.</p>`
        : '')
      // Lines only true of the version the docs describe, kept until it is published.
      out = out.replace(/<!-- if-released -->([\s\S]*?)<!-- \/if-released -->/g, (_, body) => (ahead ? '' : body))
      out = out.replace('<!-- readme:quickstart -->', () => escapeHtml(README_QUICKSTART()))
    }
    return withBase(out)
  }

  return {
    name: 'tickslate-site-pages',
    // The generated docs pages are HTML entries that exist only here.
    resolveId(id) {
      const abs = id.startsWith('/') ? id : src(id)
      return isVirtual(abs) ? abs : null
    },
    load(id) {
      if (!isVirtual(id)) return null
      const key = relative(root, id).split(posix.sep).join('/')
      return generated.out.get(key)()
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const file = relative(root, ctx.filename).split(posix.sep).join('/')
        return transform(html, file)
      },
    },
    // Development: the same URLs as the built site.
    configureServer(server) {
      server.watcher.add([src('docs'), src('CHANGELOG.md'), src('README.md')])
      server.watcher.on('change', (path) => {
        if (/\.md$/.test(path)) {
          generated = generatedPages()
          server.ws.send({ type: 'full-reload' })
        }
      })
      server.middlewares.use(async (req, res, next) => {
        const [path, query = ''] = req.url.split('?')
        const page = path === '/' ? '/index.html' : path
        if (page === '/index.html') req.url = `/site/index.html${query ? `?${query}` : ''}`
        else if (page === '/playground.html') req.url = `/index.html${query ? `?${query}` : ''}`
        else if (page === '/404.html') req.url = '/site/404.html'
        else {
          const key = page === '/changelog.html' ? 'site/changelog.html' : `site${page}`
          if (/\.html$/.test(page) && generated.out.has(key)) {
            try {
              const html = await server.transformIndexHtml(`/${key}`, generated.out.get(key)())
              res.setHeader('Content-Type', 'text/html')
              res.end(html)
            } catch (e) {
              next(e)
            }
            return
          }
        }
        next()
      })
    },
  }
}

// The build: publish each page at its site URL (the table above). After
// Vite's HTML plugin, which emits the pages in its own generateBundle.
function publishPages() {
  return {
    name: 'tickslate-publish-pages',
    enforce: 'post',
    generateBundle(_, bundle) {
      const moves = []
      for (const [key, file] of Object.entries(bundle)) {
        if (file.type !== 'asset' || !file.fileName.endsWith('.html')) continue
        const to = PUBLISHED[file.fileName] || (file.fileName.startsWith('site/') ? file.fileName.slice('site/'.length) : null)
        if (to) moves.push({ key, to, source: file.source })
      }
      for (const m of moves) delete bundle[m.key]
      for (const m of moves) this.emitFile({ type: 'asset', fileName: m.to, source: m.source })
    },
  }
}

// The gallery and the landing page link tokens.css and then the presets.
// Vite splits a stylesheet shared by several pages into its own file, and the
// page then links the page's own bundle first, so the presets (same zero
// specificity) lose to the defaults they are meant to override. Each page's
// stylesheets are put back in source order: tokens first.
function tokensFirst() {
  return {
    name: 'tickslate-tokens-first',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const links = [...html.matchAll(/<link rel="stylesheet"[^>]*href="[^"]*\/assets\/[^"]+\.css"[^>]*>\n?/g)].map((m) => m[0])
        const tokens = links.filter((l) => /\/tokens-[\w-]+\.css"/.test(l))
        if (!tokens.length || links.indexOf(tokens[0]) === 0) return html
        let out = html
        for (const l of tokens) out = out.replace(l, '')
        return out.replace(links.find((l) => !tokens.includes(l)), (first) => tokens.join('') + first)
      },
    },
    generateBundle(_, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type !== 'asset' || !file.fileName.endsWith('.html')) continue
        const order = [...String(file.source).matchAll(/<link rel="stylesheet"[^>]*href="[^"]*\/assets\/([^"/]+)\.css"/g)].map((m) => m[1])
        const t = order.findIndex((n) => n.startsWith('tokens-'))
        if (t > 0) this.error(`${file.fileName} links ${order[0]}.css before tokens.css, so a theme preset would lose to the defaults.`)
      }
    },
  }
}

/**
 * The public site: the landing page, the playground, the widget gallery, the
 * examples and the docs, built from the same pages `npm run dev` serves.
 * Nothing here ships in the package. docs/site.md describes the build and the
 * two places it deploys.
 *
 * The pages import the package names the README shows (`tickslate`,
 * `tickslate/elements`) or the source paths; the aliases answer both from the
 * source, built exactly as the library build is (`__TS_DEV__` off), so the
 * site demonstrates the code that gets published.
 *
 *   npm run build:site   dist-site/, base SITE_BASE or /Tickslate/ (GitHub Pages)
 *   npm run build:ld     dist/, base / (LambdaDeploy, vite.ld.config.js)
 *   npm run dev:site     the site in development, at the same URLs
 */
export function siteConfig({ base = process.env.SITE_BASE || '/Tickslate/', outDir = 'dist-site', serve = false, siteVersion = process.env.SITE_VERSION || version } = {}) {
  checkVersion(siteVersion)
  const at = serve ? '/' : base
  // The pages move to new folders when published (site/index.html becomes
  // index.html), so URLs relative to the page would point one level off.
  if (!at.startsWith('/') || !at.endsWith('/')) {
    throw new Error(`SITE_BASE must be an absolute path that starts and ends with "/", such as / or /Tickslate/; got "${at}".`)
  }
  const docsInputs = Object.fromEntries([...generatedPages().out.keys()].map((key) => [key.replace(/\.html$/, ''), src(key)]))
  return {
    base: at,
    // False as in the library build, so development warnings and strings are dropped.
    define: {
      __TS_DEV__: 'false',
      // The playground's Copy HTML pins the CDN URL to the published version (SITE_VERSION above).
      __TICKSLATE_VERSION__: JSON.stringify(siteVersion),
    },
    resolve: {
      alias: [
        // The longer names go first so 'tickslate/elements' isn't caught by the bare match.
        // `tickslate/elements/<name>` is answered by that widget's define module.
        ...elementEntries().map((e) => ({ find: new RegExp(`^tickslate/elements/${e.name}$`), replacement: e.input })),
        { find: /^tickslate\/elements$/, replacement: src('src/elements/index.js') },
        { find: /^tickslate$/, replacement: src('src/core/index.js') },
      ],
    },
    plugins: [offlineSite(), sitePages({ base: at, siteVersion }), tokensFirst(), publishPages()],
    build: {
      outDir,
      emptyOutDir: true,
      target: 'es2019',
      rollupOptions: {
        input: {
          'site/index': src('site/index.html'),
          'site/404': src('site/404.html'),
          playground: src('index.html'),
          widgets: src('widgets.html'),
          ...Object.fromEntries(exampleFiles().map((f) => [f.replace(/\.html$/, ''), src(f)])),
          ...docsInputs,
        },
      },
    },
  }
}

export default defineConfig(({ command, isPreview }) => siteConfig({ serve: command === 'serve' && !isPreview }))

