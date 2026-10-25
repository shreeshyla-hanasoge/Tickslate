/**
 * The public site's generated pages: which Markdown files become docs pages,
 * where links in them point, and the HTML around them. vite.site.config.js
 * serves these as virtual pages in development and builds them with the rest
 * of the site, so nothing generated is ever written into the repository.
 *
 * Site paths here start with `/` and mean the site root; the build prefixes the
 * base (`/Tickslate/` on GitHub Pages, `/` on LambdaDeploy) to every link.
 */
import { readdirSync, existsSync } from 'node:fs'
import { join, posix } from 'node:path'
import { renderMarkdown, escapeHtml } from './md.mjs'

export const REPO = 'https://github.com/shreeshyla-hanasoge/Tickslate'
export const NPM = 'https://www.npmjs.com/package/tickslate'
const BLOB = `${REPO}/blob/master/`
const TREE = `${REPO}/tree/master/`

const mdIn = (root, dir) => (existsSync(join(root, dir))
  ? readdirSync(join(root, dir)).filter((f) => f.endsWith('.md')).sort().map((f) => `${dir}/${f}`)
  : [])

// Groups in sidebar order. Found rather than listed, so a new guide or widget
// page is on the site the day it lands in docs/.
const GROUPS = [
  { id: 'guides', title: 'Guides', files: (root) => mdIn(root, 'docs/guide') },
  { id: 'frameworks', title: 'Frameworks', files: (root) => mdIn(root, 'docs/guide/frameworks') },
  { id: 'widgets', title: 'Widgets', files: (root) => mdIn(root, 'docs/widgets') },
  { id: 'reference', title: 'Reference', files: (root) => [...mdIn(root, 'docs/reference'), 'docs/theming.md', 'docs/ACCESSIBILITY.md'].filter((f) => existsSync(join(root, f))) },
  { id: 'project', title: 'Project', files: (root) => ['CHANGELOG.md'].filter((f) => existsSync(join(root, f))) },
]

/** The site path a rendered Markdown file is published at. */
export function pageFor(src) {
  if (src === 'CHANGELOG.md') return '/changelog.html'
  return `/${src.replace(/\.md$/, '.html').replace(/ACCESSIBILITY\.html$/, 'accessibility.html')}`
}

/**
 * Every generated page: [{ src, path, group, title, summary }]. `src` is the
 * Markdown file, `path` the site path. The docs hub has no `src`.
 */
export function docPages(root, read) {
  const pages = []
  for (const g of GROUPS) {
    for (const src of g.files(root)) {
      const md = read(src)
      const { title } = renderMarkdown(md)
      pages.push({ src, path: pageFor(src), group: g.id, title: plainTitle(title, src), summary: summaryOf(md) })
    }
  }
  return pages
}

// "`<ts-grid>`" reads as "<ts-grid>" in the sidebar; a page with no h1 is named by its file.
function plainTitle(title, src) {
  return title || posix.basename(src, '.md')
}

/** The first paragraph's plain text, cut to a sentence or 160 characters, for the hub and the description meta. */
export function summaryOf(md) {
  const para = md
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .find((p) => p && !/^(#|>|\||[-*] |\d+\. )/.test(p))
  if (!para) return ''
  const text = para
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_]/g, '')
    .replace(/\s+/g, ' ')
  const sentence = text.match(/^.*?[.!?](?=\s|$)/)
  const out = sentence && sentence[0].length >= 40 ? sentence[0] : text
  return out.length > 160 ? `${out.slice(0, 157).replace(/\s+\S*$/, '')}…` : out
}

/**
 * Where a link in `fromSrc` should point on the site. A rendered page goes to
 * its generated page; a playground, gallery or example page to its site copy;
 * a folder of rendered pages to that group on the hub; anything else in the
 * repository to GitHub, where it renders.
 */
export function rewriteLink(href, fromSrc, pages) {
  if (/^([a-z]+:|#|\/\/)/i.test(href)) return href
  const [pathPart, hash = ''] = href.split('#')
  const frag = hash ? `#${hash}` : ''
  if (!pathPart) return href
  const target = posix.normalize(posix.join(posix.dirname(fromSrc), pathPart))
  if (target.startsWith('..')) return href
  const page = pages.find((p) => p.src === target)
  if (page) return page.path + frag
  if (target === 'index.html') return `/playground.html${frag}`
  if (target === 'widgets.html' || /^examples\/[\w-]+\.html$/.test(target)) return `/${target}${frag}`
  const dir = target.replace(/\/$/, '')
  const group = GROUPS.find((g) => pages.some((p) => p.group === g.id && posix.dirname(p.src) === dir))
  if (group) return `/docs/index.html#${group.id}`
  const isDir = pathPart.endsWith('/') || !posix.extname(target)
  return (isDir ? TREE : BLOB) + target + frag
}

// ── The page shell ──────────────────────────────────────────────────────────

const NAV = [
  { href: '/playground.html', label: 'Playground', key: 'playground' },
  { href: '/widgets.html', label: 'Widgets', key: 'widgets' },
  { href: '/examples/index.html', label: 'Examples', key: 'examples' },
  { href: '/docs/index.html', label: 'Docs', key: 'docs' },
  { href: '/changelog.html', label: 'Changelog', key: 'changelog' },
]

const MARK = '<svg class="site-mark" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><rect x="2" y="2" width="9" height="9" rx="2.5"/><rect x="13" y="2" width="9" height="5" rx="2"/><rect x="13" y="9" width="9" height="13" rx="2.5"/><rect x="2" y="13" width="9" height="9" rx="2.5"/></svg>'

/**
 * The site bar every page shares: the wordmark home, the main links and
 * GitHub, and on pages that have no theme control of their own a theme switch.
 * `skip` names the id the skip link jumps to.
 */
export function siteHeader({ current = '', toggle = false, skip = 'main' } = {}) {
  const links = NAV.map((l) => `<li><a href="${l.href}"${l.key === current ? ' aria-current="page"' : ''}>${l.label}</a></li>`).join('')
  const theme = toggle
    ? '<button type="button" class="site-theme" data-site-theme aria-label="Colour theme: follows your system. Change it" title="Colour theme"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/></svg><span data-site-theme-label>Auto</span></button>'
    : ''
  return `<a class="site-skip" href="#${skip}">Skip to content</a>
<header class="site-bar">
  <div class="site-bar-in">
    <a class="site-word" href="/"${current === 'home' ? ' aria-current="page"' : ''}>${MARK}<span>Tickslate</span></a>
    <nav class="site-nav" aria-label="Site">
      <ul>${links}<li><a href="${REPO}">GitHub</a></li></ul>
    </nav>
    ${theme}
  </div>
</header>`
}

// Paper by default, Graphite when the system asks or the visitor chose it.
// Run before the first paint, so a stored choice never flashes the other theme.
export const THEME_BOOT = `<script>try{var t=localStorage.getItem('tickslate-site-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}</script>`

function head({ title, description }) {
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="color-scheme" content="light dark">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Tickslate">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<link rel="icon" href="/site/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/src/themes/tokens.css">
<link rel="stylesheet" href="/site/site.css">
${THEME_BOOT}`
}

function sidebar(pages, currentPath) {
  const groups = GROUPS.map((g) => {
    const list = pages.filter((p) => p.group === g.id)
    if (!list.length) return ''
    const items = list.map((p) => `<li><a href="${p.path}"${p.path === currentPath ? ' aria-current="page"' : ''}>${escapeHtml(p.title)}</a></li>`).join('')
    return `<p class="docs-group" id="side-${g.id}">${g.title}</p><ul aria-labelledby="side-${g.id}">${items}</ul>`
  }).join('')
  const home = `<ul><li><a href="/docs/index.html"${currentPath === '/docs/index.html' ? ' aria-current="page"' : ''}>Overview</a></li></ul>`
  // A disclosure on phones, always open on wide screens (site.js opens it there).
  return `<details class="docs-side" data-docs-side open>
  <summary>Docs menu</summary>
  <nav aria-label="Docs">${home}${groups}</nav>
</details>`
}

function shell({ title, description, current, body, pages, path }) {
  return `<!doctype html>
<html lang="en" data-theme="auto">
<head>
${head({ title, description })}
</head>
<body>
${siteHeader({ current, toggle: true })}
<div class="docs">
${sidebar(pages, path)}
<main id="main" class="docs-main" tabindex="-1">
${body}
</main>
</div>
${footer()}
<script type="module" src="/site/site.js"></script>
</body>
</html>
`
}

export function footer() {
  return `<footer class="site-foot">
  <div class="site-foot-in">
    <p>Tickslate is MIT licensed. Every figure on this site is made up.</p>
    <ul>
      <li><a href="${REPO}">GitHub</a></li>
      <li><a href="${NPM}">npm</a></li>
      <li><a href="/changelog.html">Version __TICKSLATE_VERSION__</a></li>
      <li><a href="${REPO}/blob/master/LICENSE">Licence</a></li>
    </ul>
  </div>
</footer>`
}

/** One docs page, from its Markdown. */
export function renderDocPage(page, pages, read) {
  const { html } = renderMarkdown(read(page.src), { link: (href) => rewriteLink(href, page.src, pages) })
  const group = GROUPS.find((g) => g.id === page.group)
  const source = `<p class="docs-source"><a href="${BLOB}${page.src}">View ${escapeHtml(page.src)} on GitHub</a></p>`
  const crumbs = page.src === 'CHANGELOG.md'
    ? ''
    : `<p class="docs-crumbs"><a href="/docs/index.html">Docs</a> <span aria-hidden="true">/</span> <a href="/docs/index.html#${group.id}">${group.title}</a></p>`
  const label = page.src === 'CHANGELOG.md' ? 'Changelog · Tickslate' : `${page.title} · Tickslate docs`
  return shell({
    title: label,
    description: page.summary || 'Tickslate documentation.',
    current: page.src === 'CHANGELOG.md' ? 'changelog' : 'docs',
    body: `<article class="prose">${crumbs}\n${html}\n${source}</article>`,
    pages,
    path: page.path,
  })
}

/** The docs hub: every group, every page and its first sentence. */
export function renderDocsHub(pages) {
  const sections = GROUPS.map((g) => {
    const list = pages.filter((p) => p.group === g.id)
    if (!list.length) return ''
    const items = list.map((p) => `<li><a href="${p.path}">${escapeHtml(p.title)}</a>${p.summary ? `<p>${escapeHtml(p.summary)}</p>` : ''}</li>`).join('\n')
    return `<section class="hub-group" aria-labelledby="${g.id}"><h2 id="${g.id}">${g.title}</h2><ul class="hub-list">\n${items}\n</ul></section>`
  }).join('\n')
  const body = `<div class="prose hub">
<h1>Documentation</h1>
<p class="lede">Everything the library does, one page per widget, plus guides for each framework and the reference for the core functions, events and theme tokens. New here? Start with the <a href="/#install">install steps</a>, then read <a href="/docs/widgets/ts-grid.html"><code>&lt;ts-grid&gt;</code></a>.</p>
<p>These pages are built from the Markdown in the repository's <a href="${TREE}docs">docs folder</a>, so they match the code of the version on the site, ${'__TICKSLATE_VERSION__'}.</p>
${sections}
</div>`
  return shell({
    title: 'Docs · Tickslate',
    description: 'Tickslate documentation: guides, framework recipes, a page per widget, and the core, events and theming reference.',
    current: 'docs',
    body,
    pages,
    path: '/docs/index.html',
  })
}
