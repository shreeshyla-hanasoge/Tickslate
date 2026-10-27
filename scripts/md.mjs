/**
 * A small Markdown to HTML renderer for the site's docs pages.
 *
 * The site has to prove the library's own rule, zero runtime dependencies, so
 * it doesn't pull in marked or markdown-it. This covers what the repository's
 * docs use, as GitHub renders it: ATX headings with GitHub's anchor ids,
 * paragraphs, ordered and unordered lists (nested, tight or loose), fenced
 * code, block quotes, rules, pipe tables with alignment, inline code, links,
 * autolinks, bold and italic, backslash escapes and hard breaks.
 *
 * Not covered, because no doc uses them: setext headings, indented code
 * blocks, reference-style links, images, footnotes, strikethrough, task lists
 * and raw HTML. Raw HTML is escaped and shown as text rather than passed
 * through, so a doc can never inject markup into the site, and a link whose
 * target has a scheme other than http, https or mailto (javascript:, data:)
 * renders as its text. HTML comments, whole-line or inline, are dropped.
 *
 *   renderMarkdown(source, { link }) -> { html, title, headings }
 *
 * `link(href)` rewrites every link target (a relative .md link becomes the
 * generated page, for example); it defaults to leaving targets alone.
 *
 * `node scripts/md.mjs --check` runs the self-checks at the end of this file;
 * `npm run build:site` runs them first. They live here, not in test/, because
 * the unit tests import nothing outside src/ and node:*.
 */

import { pathToFileURL } from 'node:url'

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
export const escapeHtml = (text) => String(text).replace(/[&<>"]/g, (c) => ESC[c])

// The ASCII punctuation CommonMark lets a backslash escape.
const ESCAPABLE = /\\([!-/:-@[-`{-~])/g

/** GitHub's heading anchor: lower case, punctuation dropped, spaces to hyphens. */
export function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-')
}

// Removes every open...close span by scanning, not by pattern, and again until nothing is left to remove: cutting
// one span can join the text around it into a new one ("<!<!-- a -->-- b -->"), and one pass would leave that behind.
const cut = (text, open, close) => {
  for (let prev = null; prev !== text;) {
    prev = text
    let out = ''
    let at = 0
    for (;;) {
      const start = text.indexOf(open, at)
      const end = start < 0 ? -1 : text.indexOf(close, start + open.length)
      if (end < 0) break
      out += text.slice(at, start)
      at = end + close.length
    }
    text = out + text.slice(at)
  }
  return text
}

const textOf = (html) => cut(html, '<', '>')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')

// ── Inline ──────────────────────────────────────────────────────────────────

/**
 * Code spans and links are cut out first and held as placeholders, so the
 * emphasis and escaping passes never reach inside them. \u0000 can't appear in
 * a doc, so a placeholder can't collide with real text.
 */
function renderInline(src, opts) {
  const held = []
  const hold = (html) => `\u0000${held.push(html) - 1}\u0000`

  let s = src.replace(ESCAPABLE, (_, c) => hold(escapeHtml(c)))

  // Code spans: a run of backticks closed by a run of the same length.
  s = s.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, ticks, code) => {
    const body = code.replace(/\n/g, ' ')
    const trimmed = /^ .* $/.test(body) && body.trim() ? body.slice(1, -1) : body
    return hold(`<code>${escapeHtml(trimmed)}</code>`)
  })

  // Comments are for whoever edits the Markdown, never for the page.
  s = cut(s, '<!--', '-->')

  // Autolinks in angle brackets.
  s = s.replace(/<(https?:\/\/[^\s<>]+)>/g, (_, url) => hold(anchor(url, escapeHtml(url), opts)))

  // Links. The text may hold code placeholders and emphasis, so it is rendered
  // on its own; the target stops at the first space or closing bracket.
  s = s.replace(/\[((?:[^\[\]]|\[[^\[\]]*\])*)\]\(\s*<?((?:[^\s()<>]|\([^\s()<>]*\))*)>?(?:\s+"([^"]*)")?\s*\)/g, (_, text, href, title) => {
    return hold(anchor(href, emphasis(escapeText(text)), opts, title))
  })

  // Bare URLs, as GitHub links them. A trailing full stop or comma is prose.
  s = s.replace(/\bhttps?:\/\/[^\s<>()\u0000]+[^\s<>()\u0000.,;:!?'"]/g, (url) => hold(anchor(url, escapeHtml(url), opts)))

  s = emphasis(escapeText(s))

  // Hard breaks: a backslash or two spaces before a newline.
  s = s.replace(/(?: {2,}|\\)\n/g, '<br>\n')

  // Placeholders can nest (a link's text holds a code span), so resolve until stable.
  for (let i = 0; i < 4 && s.includes('\u0000'); i++) s = s.replace(/\u0000(\d+)\u0000/g, (_, n) => held[Number(n)])
  return s
}

// A common entity such as &nbsp; is kept; any other & is escaped, so "P&L;" stays text.
function escapeText(text) {
  return text
    .replace(/&(?!(?:#\d+|#x[\da-f]+|amp|lt|gt|quot|apos|nbsp|mdash|ndash|hellip|rarr|larr|times|minus|copy);)/gi, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function emphasis(s) {
  return s
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\w])__(?=\S)([\s\S]*?\S)__(?!\w)/g, '$1<strong>$2</strong>')
    .replace(/(^|[^*\w])\*(?=[^\s*])([\s\S]*?[^\s*])\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_(?=[^\s_])([\s\S]*?[^\s_])_(?!\w)/g, '$1<em>$2</em>')
}

// A target is a relative path, a fragment, or http, https or mailto. Anything
// else (javascript:, data:, vbscript:) would run or load something; it renders as text.
const SAFE_TARGET = /^(?:https?:|mailto:|#|[^:/?#]*(?:[/?#]|$))/i

function anchor(href, inner, opts, title) {
  const target = opts.link ? opts.link(href) : href
  if (!SAFE_TARGET.test(target)) return inner
  const t = title ? ` title="${escapeHtml(title)}"` : ''
  return `<a href="${escapeHtml(target)}"${t}>${inner}</a>`
}

// ── Blocks ──────────────────────────────────────────────────────────────────

const FENCE = /^( {0,3})(`{3,}|~{3,})\s*([^\s`]*)[^`]*$/
const HEADING = /^ {0,3}(#{1,6})(?:\s+(.*?))?(?:\s+#+)?\s*$/
const RULE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/
const LIST_ITEM = /^( *)([-*+]|\d{1,9}[.)])( +|$)(.*)$/
const QUOTE = /^ {0,3}> ?(.*)$/
const TABLE_RULE = /^ *\|? *:?-+:? *(?:\| *:?-+:? *)*\|? *$/
const COMMENT_START = /^ {0,3}<!--/

const isBlank = (line) => !line.trim()
const indentOf = (line) => line.match(/^ */)[0].length

/** True when `line` begins a block other than a paragraph, which ends a paragraph. */
function startsBlock(line) {
  return FENCE.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line) || COMMENT_START.test(line) || LIST_ITEM.test(line)
}

/** Splits a table row on pipes that are not escaped and not inside a code span. */
function cells(row) {
  let s = row.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1)
  const out = []
  let cur = ''
  let ticks = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '\\' && s[i + 1] === '|') { cur += '\\|'; i++; continue }
    if (c === '`') {
      let run = 1
      while (s[i + run] === '`') run++
      if (!ticks) ticks = run
      else if (ticks === run) ticks = 0
      cur += '`'.repeat(run)
      i += run - 1
      continue
    }
    if (c === '|' && !ticks) { out.push(cur.trim()); cur = ''; continue }
    cur += c
  }
  out.push(cur.trim())
  // A pipe inside a code span reaches the cell escaped; GitHub shows it bare.
  return out.map((cell) => cell.replace(/\\\|/g, '|'))
}

class Renderer {
  constructor(opts) {
    this.opts = opts
    this.headings = []
    this.slugs = new Map()
  }

  slug(text) {
    const base = slugify(text)
    const n = this.slugs.get(base) || 0
    this.slugs.set(base, n + 1)
    return n ? `${base}-${n}` : base
  }

  inline(text) { return renderInline(text, this.opts) }

  /** Renders a list of lines. `tight` leaves paragraphs unwrapped, as in a tight list item. */
  blocks(lines, tight = false) {
    const out = []
    let i = 0
    while (i < lines.length) {
      const line = lines[i]
      if (isBlank(line)) { i++; continue }

      if (COMMENT_START.test(line)) {
        while (i < lines.length && !lines[i].includes('-->')) i++
        i++
        continue
      }

      const fence = line.match(FENCE)
      if (fence) {
        const [, indent, marker, lang] = fence
        const body = []
        i++
        while (i < lines.length && !new RegExp(`^ {0,3}${marker[0] === '`' ? '`' : '~'}{${marker.length},}\\s*$`).test(lines[i])) {
          body.push(lines[i].slice(Math.min(indent.length, indentOf(lines[i]))))
          i++
        }
        i++
        const cls = lang ? ` class="language-${escapeHtml(lang)}"` : ''
        const data = lang ? ` data-lang="${escapeHtml(lang)}"` : ''
        // tabindex: a long line scrolls the block sideways, and a keyboard user must be able to scroll it.
        out.push(`<pre${data} tabindex="0"><code${cls}>${escapeHtml(body.join('\n'))}</code></pre>`)
        continue
      }

      const heading = line.match(HEADING)
      if (heading) {
        const level = heading[1].length
        const html = this.inline(heading[2] || '')
        const text = textOf(html)
        const id = this.slug(text)
        this.headings.push({ level, text, id })
        out.push(`<h${level} id="${escapeHtml(id)}">${html}</h${level}>`)
        i++
        continue
      }

      if (RULE.test(line)) {
        out.push('<hr>')
        i++
        continue
      }

      if (QUOTE.test(line)) {
        const body = []
        while (i < lines.length && !isBlank(lines[i])) {
          const q = lines[i].match(QUOTE)
          body.push(q ? q[1] : lines[i])
          i++
        }
        out.push(`<blockquote>\n${this.blocks(body)}\n</blockquote>`)
        continue
      }

      if (line.includes('|') && i + 1 < lines.length && TABLE_RULE.test(lines[i + 1]) && lines[i + 1].includes('-')) {
        const head = cells(line)
        const align = cells(lines[i + 1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : ''))
        i += 2
        const rows = []
        while (i < lines.length && !isBlank(lines[i]) && lines[i].includes('|')) rows.push(cells(lines[i++]))
        const attr = (n) => (align[n] ? ` style="text-align: ${align[n] === 'right' ? 'end' : align[n] === 'left' ? 'start' : 'center'}"` : '')
        const th = head.map((c, n) => `<th scope="col"${attr(n)}>${this.inline(c)}</th>`).join('')
        const body = rows.map((r) => `<tr>${head.map((_, n) => `<td${attr(n)}>${this.inline(r[n] || '')}</td>`).join('')}</tr>`).join('\n')
        // The wrapper scrolls a wide table sideways inside the column instead of
        // widening the page; tabindex lets a keyboard user scroll it too.
        out.push(`<div class="table-wrap" tabindex="0"><table>\n<thead><tr>${th}</tr></thead>\n<tbody>\n${body}\n</tbody>\n</table></div>`)
        continue
      }

      const item = line.match(LIST_ITEM)
      if (item && (item[4] || i + 1 < lines.length)) {
        const [html, next] = this.list(lines, i)
        out.push(html)
        i = next
        continue
      }

      // A paragraph runs to a blank line or the start of another block.
      // Only the start is trimmed: two trailing spaces are a hard break.
      const para = [line.trimStart()]
      i++
      while (i < lines.length && !isBlank(lines[i]) && !startsBlock(lines[i]) && !(lines[i].includes('|') && TABLE_RULE.test(lines[i + 1] || ''))) {
        para.push(lines[i].replace(/^ +/, ''))
        i++
      }
      const html = this.inline(para.join('\n'))
      out.push(tight ? html : `<p>${html}</p>`)
    }
    return out.join('\n')
  }

  /** One list from lines[start]: its items, each rendered as its own block. Returns [html, nextIndex]. */
  list(lines, start) {
    const first = lines[start].match(LIST_ITEM)
    const baseIndent = first[1].length
    const ordered = /\d/.test(first[2])
    const sameKind = (m) => m && m[1].length === baseIndent && /\d/.test(m[2]) === ordered
    const items = []
    let loose = false
    let i = start
    while (i < lines.length) {
      const m = lines[i].match(LIST_ITEM)
      if (!sameKind(m)) break
      const contentIndent = m[1].length + m[2].length + Math.max(1, Math.min(m[3].length, 4))
      const body = [m[4]]
      i++
      let sawBlank = false
      while (i < lines.length) {
        const l = lines[i]
        if (isBlank(l)) { sawBlank = true; body.push(''); i++; continue }
        if (indentOf(l) >= contentIndent) { body.push(l.slice(contentIndent)); sawBlank = false; i++; continue }
        // A wrapped line of the item's own paragraph (a lazy continuation).
        if (!sawBlank && !startsBlock(l)) { body.push(l.trim()); i++; continue }
        // A nested list indented less than the content but more than this item.
        const nested = l.match(LIST_ITEM)
        if (!sawBlank && nested && nested[1].length > baseIndent) { body.push(l.slice(Math.min(indentOf(l), contentIndent))); i++; continue }
        break
      }
      // Trailing blanks belong between items: they make the list loose only when another item follows.
      while (body.length && isBlank(body[body.length - 1])) body.pop()
      if (sawBlank && i < lines.length && sameKind(lines[i].match(LIST_ITEM))) loose = true
      if (body.some((l, n) => isBlank(l) && n > 0 && n < body.length - 1 && !isBlank(body[n + 1]) && !LIST_ITEM.test(body[n + 1]))) loose = true
      items.push(body)
    }
    const startAttr = ordered && Number.parseInt(first[2], 10) !== 1 ? ` start="${Number.parseInt(first[2], 10)}"` : ''
    const tag = ordered ? 'ol' : 'ul'
    const lis = items.map((body) => `<li>${this.blocks(body, !loose)}</li>`).join('\n')
    return [`<${tag}${startAttr}>\n${lis}\n</${tag}>`, i]
  }
}

export function renderMarkdown(source, opts = {}) {
  const r = new Renderer(opts)
  const lines = String(source).replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n')
  const html = r.blocks(lines)
  const h1 = r.headings.find((h) => h.level === 1)
  return { html, title: h1 ? h1.text : '', headings: r.headings }
}

// ── Self-checks ─────────────────────────────────────────────────────────────

async function check() {
  const { default: assert } = await import('node:assert/strict')
  const { rewriteLink } = await import('./site-docs.mjs')
  const html = (md, opts) => renderMarkdown(md, opts).html
  const cases = [
    ['headings and GitHub ids', () => {
      const r = renderMarkdown('# `<ts-grid>`\n\n## Data shape\n\n## Data shape\n\n### `toNumber(v)`')
      assert.equal(r.title, '<ts-grid>')
      assert.deepEqual(r.headings.map((h) => h.id), ['ts-grid', 'data-shape', 'data-shape-1', 'tonumberv'])
      assert.match(r.html, /<h1 id="ts-grid"><code>&lt;ts-grid&gt;<\/code><\/h1>/)
    }],
    ['paragraphs, emphasis and hard breaks', () => {
      assert.equal(html('One **two** *three* _four_ snake_case_name.'), '<p>One <strong>two</strong> <em>three</em> <em>four</em> snake_case_name.</p>')
      assert.equal(html('line one  \nline two'), '<p>line one<br>\nline two</p>')
      assert.equal(html('a\\\nb'), '<p>a<br>\nb</p>')
    }],
    ['lists: tight, loose, nested, ordered with a start', () => {
      assert.equal(html('- a\n- b'), '<ul>\n<li>a</li>\n<li>b</li>\n</ul>')
      assert.equal(html('- a\n\n- b'), '<ul>\n<li><p>a</p></li>\n<li><p>b</p></li>\n</ul>')
      assert.equal(html('3. a\n   - b\n4. c'), '<ol start="3">\n<li>a\n<ul>\n<li>b</li>\n</ul></li>\n<li>c</li>\n</ol>')
      assert.equal(html('- a\n  wrapped'), '<ul>\n<li>a\nwrapped</li>\n</ul>')
    }],
    ['tables with alignment and escaped pipes', () => {
      const t = html('| A | B |\n|---|--:|\n| `a\\|b` | 2 |')
      assert.match(t, /<th scope="col">A<\/th><th scope="col" style="text-align: end">B<\/th>/)
      assert.match(t, /<td><code>a\|b<\/code><\/td><td style="text-align: end">2<\/td>/)
      assert.match(t, /^<div class="table-wrap" tabindex="0">/)
    }],
    ['code fences and inline code are escaped, never parsed', () => {
      assert.equal(html('```html\n<b>**x**</b>\n```'), '<pre data-lang="html" tabindex="0"><code class="language-html">&lt;b&gt;**x**&lt;/b&gt;</code></pre>')
      assert.equal(html('`<i>` and `` a`b ``'), '<p><code>&lt;i&gt;</code> and <code>a`b</code></p>')
    }],
    ['links, autolinks, parentheses and titles', () => {
      assert.equal(html('[x](a.md#b "T")'), '<p><a href="a.md#b" title="T">x</a></p>')
      assert.equal(html('[x](https://e.org/Foo_(bar))'), '<p><a href="https://e.org/Foo_(bar)">x</a></p>')
      assert.equal(html('<https://e.org/a> and https://e.org/b.'), '<p><a href="https://e.org/a">https://e.org/a</a> and <a href="https://e.org/b">https://e.org/b</a>.</p>')
      assert.equal(html('[`code` link](x.md)', { link: (h) => `/${h}` }), '<p><a href="/x.md"><code>code</code> link</a></p>')
    }],
    ['unsafe link schemes render as text', () => {
      assert.equal(html('[click](javascript:alert(1))'), '<p>click</p>')
      assert.equal(html('[d](data:text/html,x)'), '<p>d</p>')
      assert.equal(html('[m](mailto:a@b.c)'), '<p><a href="mailto:a@b.c">m</a></p>')
    }],
    ['raw HTML is escaped and comments are dropped', () => {
      assert.equal(html('<script>alert(1)</script>'), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>')
      assert.equal(html('a <!-- hidden --> b'), '<p>a  b</p>')
      assert.equal(html('<!-- whole\nline -->\ntext'), '<p>text</p>')
      assert.equal(html('P&L; &amp; &nbsp; "q"'), '<p>P&amp;L; &amp; &nbsp; &quot;q&quot;</p>')
    }],
    ['block quotes and rules', () => {
      assert.equal(html('> **Note.** x\n\n---'), '<blockquote>\n<p><strong>Note.</strong> x</p>\n</blockquote>\n<hr>')
    }],
    ['site links: pages, examples, queries, GitHub', () => {
      const pages = [{ src: 'docs/theming.md', path: '/docs/theming.html', group: 'reference' }, { src: 'docs/widgets/ts-grid.md', path: '/docs/widgets/ts-grid.html', group: 'widgets' }]
      const from = 'docs/widgets/ts-grid.md'
      assert.equal(rewriteLink('../theming.md#dark', from, pages), '/docs/theming.html#dark')
      assert.equal(rewriteLink('../../widgets.html?preset=calm#x', from, pages), '/widgets.html?preset=calm#x')
      assert.equal(rewriteLink('../../index.html', from, pages), '/playground.html')
      assert.equal(rewriteLink('../../examples/bare.html', from, pages), '/examples/bare.html')
      assert.equal(rewriteLink('./', from, pages), '/docs/index.html#widgets')
      assert.equal(rewriteLink('../rfc/0001-api.md', from, pages), 'https://github.com/shreeshyla-hanasoge/Tickslate/blob/master/docs/rfc/0001-api.md')
      assert.equal(rewriteLink('../../src/', from, pages), 'https://github.com/shreeshyla-hanasoge/Tickslate/tree/master/src')
      assert.equal(rewriteLink('../../../../x.md', from, pages), 'https://github.com/shreeshyla-hanasoge/Tickslate#readme')
      assert.equal(rewriteLink('#local', from, pages), '#local')
    }],
  ]
  let failed = 0
  for (const [name, run] of cases) {
    try {
      run()
    } catch (e) {
      failed++
      console.error(`md.mjs check failed: ${name}\n${e.message}`)
    }
  }
  if (failed) process.exit(1)
  console.log(`md.mjs: ${cases.length} self-checks pass`)
}

// Run as a script with --check; importing this module runs nothing. Not
// awaited, since site-docs.mjs, which the checks load, imports this module.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv.includes('--check')) {
  check().catch((e) => { console.error(e); process.exit(1) })
}
