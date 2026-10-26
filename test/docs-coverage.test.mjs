import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { nonWidgetTags } from './non-widget-defines.mjs'

// Keeps the reference docs honest: anything a user can reach in the code has to
// be written up. It fails when an export of the core, a tag, an event, an action,
// a --ts-* token or a key in a widget's static dataShape is missing from docs/,
// and when the docs' own links or token values have gone stale. Only node:fs
// is used, so CI runs this without `npm install`.

const root = new URL('../', import.meta.url).pathname
const read = (path) => readFileSync(join(root, path), 'utf8')
const has = (path) => existsSync(join(root, path))
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// ── What the code exposes ──────────────────────────────────────────────────

/** Names exported by src/core/index.js, from `export const x` and `export { a, b } from`. */
export function coreExports(source = read('src/core/index.js')) {
  const code = stripComments(source)
  const names = new Set()
  for (const m of code.matchAll(/export\s+(?:const|function|class|let)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1])
  for (const m of code.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()
      if (name) names.add(name)
    }
  }
  return [...names]
}

const elementFiles = () => readdirSync(join(root, 'src/elements')).filter((f) => f.endsWith('.js')).map((f) => `src/elements/${f}`)

const defineFiles = () => readdirSync(join(root, 'src/elements/define')).filter((f) => f.endsWith('.js')).map((f) => `src/elements/define/${f}`)

/** { tag, className } for every define('ts-x', Class) call under src/elements, which are in its define/ modules (RFC 0003 §2.1). */
export function definedTags() {
  const out = []
  for (const file of [...elementFiles(), ...defineFiles()]) {
    for (const m of stripComments(read(file)).matchAll(/\bdefine\(\s*'([a-z][\w]*-[\w-]*)'\s*,\s*([A-Za-z_$][\w$]*)\s*\)/g)) {
      out.push({ tag: m[1], className: m[2] })
    }
  }
  return out
}

/** Events dispatched under src/elements: _emit('ts-x') and new CustomEvent('ts-x'). */
export function firedEvents() {
  const names = new Set()
  for (const file of elementFiles()) {
    for (const m of stripComments(read(file)).matchAll(/(?:\b_emit|new CustomEvent)\(\s*'(ts-[\w-]+)'/g)) names.add(m[1])
  }
  return [...names]
}

/** Action names a widget passes to this.emit('name'). */
export function emittedActions() {
  const names = new Set()
  for (const file of elementFiles()) {
    for (const m of stripComments(read(file)).matchAll(/\bthis\.emit\(\s*'([\w-]+)'/g)) names.add(m[1])
  }
  return [...names]
}

/** The top-level keys of a class's `static dataShape = { ... }`, found by balancing braces. */
export function dataShapeKeys(source) {
  const code = stripComments(source)
  const at = code.search(/static\s+dataShape\s*=/)
  if (at < 0) return []
  const open = code.indexOf('{', at)
  if (open < 0) return []
  const keys = []
  let depth = 0
  let i = open
  for (; i < code.length; i++) {
    const c = code[i]
    if (c === '{' || c === '(' || c === '[') depth++
    else if (c === '}' || c === ')' || c === ']') {
      depth--
      if (depth === 0) break
    }
  }
  const body = code.slice(open + 1, i)
  // Top-level keys only: blank out everything nested before reading `key:`.
  let level = 0
  let flat = ''
  for (const c of body) {
    if (c === '{' || c === '(' || c === '[') level++
    if (level === 0) flat += c
    else flat += c === '\n' ? '\n' : ' '
    if (c === '}' || c === ')' || c === ']') level--
  }
  for (const m of flat.matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*:/g)) keys.push(m[1])
  return keys
}

/** Widget classes: className -> { file, keys } for each `export class X extends TsWidget`. */
export function widgetShapes() {
  const out = new Map()
  for (const file of elementFiles()) {
    const source = read(file)
    for (const m of source.matchAll(/export\s+class\s+(\w+)\s+extends\s+TsWidget\b/g)) {
      out.set(m[1], { file, keys: dataShapeKeys(source.slice(m.index)) })
    }
  }
  return out
}

/** Tokens declared by a block of src/themes/tokens.css, by exact selector. */
function tokenBlock(css, selector) {
  const at = css.indexOf(`${selector} {`)
  assert.ok(at >= 0, `tokens.css has no block ${selector}`)
  const body = css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at))
  const vars = {}
  for (const m of body.matchAll(/(--ts-[\w-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].trim()
  return vars
}

const tokensCss = stripComments(read('src/themes/tokens.css'))
const paper = tokenBlock(tokensCss, ':where(:root)')
const graphite = tokenBlock(tokensCss, ':where([data-theme="dark"], .dark)')

// ── Self-checks of the parsers, so a quiet regex can't make the rest vacuous ──

describe('the scanners', () => {
  test('find the things they are meant to find', () => {
    assert.ok(coreExports().length >= 40, 'core exports')
    assert.ok(coreExports().includes('version') && coreExports().includes('equityStats'))
    assert.ok(definedTags().length >= 7, 'defined tags')
    assert.ok(firedEvents().includes('ts-layout-change') && firedEvents().includes('ts-action'))
    assert.ok(emittedActions().includes('retry') && emittedActions().includes('range'))
    assert.ok(Object.keys(paper).length >= 30, 'tokens')
    assert.deepEqual(dataShapeKeys('static dataShape = { a: "x", b: { kind: "y", of: { c: 1 } }, d: [1, 2] }'), ['a', 'b', 'd'])
    assert.deepEqual(dataShapeKeys('static dataShape = Object.freeze({ a: Object.freeze({ k: 1 }), b: 2 })'), ['a', 'b'])
  })
})

// ── Coverage ────────────────────────────────────────────────────────────────

describe('docs/reference/core.md', () => {
  const doc = read('docs/reference/core.md')
  for (const name of coreExports()) {
    test(`documents ${name}`, () => {
      assert.match(doc, new RegExp(`^#{2,4} \`${escapeRe(name)}[\`(]`, 'm'), `add a heading for \`${name}\` to docs/reference/core.md`)
    })
  }
})

describe('docs/widgets', () => {
  const widgetClasses = widgetShapes()
  const tags = definedTags()

  test('every defined tag has a page', () => {
    assert.ok(tags.length > 0)
    for (const { tag } of tags) {
      // The render-failure message links docs/widgets/<tag>.md, so the file must exist.
      assert.ok(has(`docs/widgets/${tag}.md`), `docs/widgets/${tag}.md is missing`)
      assert.ok(read(`docs/widgets/${tag}.md`).includes(`<${tag}>`), `docs/widgets/${tag}.md should name <${tag}>`)
    }
  })

  // Elements that are not widgets (test/non-widget-defines.mjs): no data shape, no states and no ts-action. Their pages are checked below.
  const NOT_WIDGETS = nonWidgetTags()
  for (const tag of NOT_WIDGETS) {
    describe(tag, () => {
      const page = has(`docs/widgets/${tag}.md`) ? read(`docs/widgets/${tag}.md`) : ''
      for (const heading of ['Attributes and properties', 'Parts', 'Accessibility']) {
        test(`has "${heading}"`, () => assert.match(page, new RegExp(`^## ${heading}\\b`, 'm')))
      }
    })
  }

  for (const { tag, className } of tags) {
    if (tag === 'ts-grid' || NOT_WIDGETS.includes(tag)) continue
    const shape = widgetClasses.get(className)
    describe(tag, () => {
      const page = has(`docs/widgets/${tag}.md`) ? read(`docs/widgets/${tag}.md`) : ''
      // Only the ```ts blocks count, so a key used in an example doesn't stand in for the data shape.
      const typed = [...page.matchAll(/```ts\n([\s\S]*?)```/g)].map((m) => m[1]).join('\n')
      test('is a TsWidget with a data shape', () => {
        assert.ok(shape, `${className} should extend TsWidget`)
        assert.ok(shape.keys.length > 0, `${className} has no static dataShape keys`)
      })
      for (const heading of ['Sizes', 'Data shape', 'Minimal example', 'Attributes and properties', 'Actions', 'Parts', 'States', 'Accessibility']) {
        test(`has "${heading}"`, () => assert.match(page, new RegExp(`^## ${heading}\\b`, 'm')))
      }
      test('lists the three non-content states and the content', () => {
        for (const state of ['Loading', 'Empty', 'Error']) assert.match(page, new RegExp(`\\| ${state} \\|`), `states table has no ${state} row`)
      })
      test('has a TypeScript data shape', () => assert.match(page, /```ts\n[\s\S]*?```/))
      test('names the ts-action detail', () => assert.match(page, /\/\/ ts-action|ts-action/))
      for (const key of shape ? shape.keys : []) {
        test(`data key ${key} is in the TypeScript shape`, () => {
          assert.match(typed, new RegExp(`^\\s*${escapeRe(key)}\\??:`, 'm'), `add \`${key}\` to the data shape block in docs/widgets/${tag}.md`)
        })
      }
    })
  }

  describe('ts-grid', () => {
    const page = has('docs/widgets/ts-grid.md') ? read('docs/widgets/ts-grid.md') : ''
    const topics = [
      'Implicit mode', 'Explicit mode', 'Per-item spec resolution', 'Long press', 'Edit layout', 'Keyboard',
      'Tap to place', 'The edit pill and Add back', 'Undo, the toast and restore', 'The empty board',
      'hiddenItems', 'restore(id)', 'undo()', '`locked`', '`edit-controls="off"`', '`undo-toast="off"`', 'slot="empty"',
    ]
    for (const topic of topics) test(`covers ${topic}`, () => assert.ok(page.includes(topic), `docs/widgets/ts-grid.md should mention ${topic}`))
    for (const part of ['board', 'placeholder', 'toast', 'edit-pill', 'empty']) {
      test(`documents part ${part}`, () => assert.ok(page.includes(`\`${part}\``)))
    }
  })

  test('the pages cover each widget part in the source', () => {
    for (const file of elementFiles()) {
      for (const m of read(file).matchAll(/\bpart="([\w-]+)"/g)) {
        const owner = file.endsWith('grid.js') ? 'ts-grid' : null
        const pages = owner ? [owner] : tags.map((t) => t.tag)
        const found = pages.some((tag) => has(`docs/widgets/${tag}.md`) && read(`docs/widgets/${tag}.md`).includes(`\`${m[1]}\``))
        assert.ok(found, `part "${m[1]}" in ${file} is not documented`)
      }
    }
  })
})

describe('docs/reference/events.md', () => {
  const doc = read('docs/reference/events.md')
  for (const name of firedEvents()) {
    test(`documents ${name}`, () => {
      assert.match(doc, new RegExp(`^## \`${escapeRe(name)}\``, 'm'))
      assert.match(doc, new RegExp(`\\[\`${escapeRe(name)}\`\\]\\(#${escapeRe(name)}\\)`), `the summary table should link ${name}`)
    })
  }
  for (const name of emittedActions()) {
    test(`documents the ${name} action`, () => assert.match(doc, new RegExp(`\\| \`${escapeRe(name)}\` \\|`)))
  }
  test('says every event bubbles and is composed', () => {
    assert.match(doc, /bubbles and is composed/)
    assert.match(doc, /\| Bubbles \| Composed \|/)
  })
})

describe('docs/theming.md', () => {
  const doc = read('docs/theming.md')
  const row = (token) => doc.split('\n').find((line) => line.startsWith(`| \`${token}\` |`) && line.split('|').length >= 7)
  for (const token of Object.keys(paper)) {
    test(`documents ${token} with its Paper and Graphite values`, () => {
      const line = row(token)
      assert.ok(line, `add a row for ${token} to the token table in docs/theming.md`)
      const cells = line.split('|').map((c) => c.trim())
      // | token | purpose | paper | graphite | used by |
      assert.equal(cells[3], `\`${paper[token]}\``, `${token}: the Paper column is out of date`)
      const dark = Object.prototype.hasOwnProperty.call(graphite, token) ? `\`${graphite[token]}\`` : 'same'
      assert.equal(cells[4], dark, `${token}: the Graphite column is out of date`)
      assert.ok(cells[2].length > 0 && cells[5].length > 0, `${token}: say what it is for and where it is used`)
    })
  }
  test('covers dark mode, islands, layers, fonts, parts, a brand theme, Tailwind and shadcn/ui', () => {
    for (const topic of ['data-theme="auto"', 'data-theme="light"', '.dark', 'Islands', '@layer tickslate.defaults', '## Fonts', '## Parts', 'six variables', '## Tailwind', '## shadcn/ui']) {
      assert.ok(doc.includes(topic), `docs/theming.md should mention ${topic}`)
    }
  })
  test('the brand recipe sets exactly six variables per theme', () => {
    const fences = [...doc.split('## A brand theme in six variables')[1].split('\n## ')[0].matchAll(/```css\n([\s\S]*?)```/g)]
    assert.equal(fences.length, 1)
    const blocks = [...fences[0][1].matchAll(/\{([^}]*)\}/g)]
    assert.equal(blocks.length, 2)
    for (const b of blocks) assert.equal([...b[1].matchAll(/--ts-[\w-]+\s*:/g)].length, 6)
  })
})

describe('docs/guide/your-own-widget.md', () => {
  const doc = read('docs/guide/your-own-widget.md')
  const snippet = (doc.match(/## A widget in about 40 lines\n\n```html\n([\s\S]*?)```/) || [])[1] || ''
  test('shows a TsWidget subclass in an implicit grid', () => {
    for (const piece of ['extends TsWidget', 'static spec', 'static dataShape', 'customElements.define', '<ts-grid>', 'static template', 'static viewModel', 'update(']) {
      assert.ok(snippet.includes(piece), `the example should contain ${piece}`)
    }
    assert.ok(!/\blayout\s*=/.test(snippet), 'the grid is implicit: no layout is set')
  })
  test('is about 40 lines', () => {
    const lines = snippet.trim().split('\n').length
    assert.ok(lines >= 25 && lines <= 55, `the example is ${lines} lines`)
  })
})

describe('links', () => {
  const pages = ['docs/theming.md', 'docs/reference/core.md', 'docs/reference/events.md', 'docs/guide/your-own-widget.md', 'docs/guide/trading-dashboard.md']
  for (const f of readdirSync(join(root, 'docs/widgets'))) if (f.endsWith('.md')) pages.push(`docs/widgets/${f}`)

  for (const page of pages) {
    test(`${page} has no broken relative links`, () => {
      const text = read(page).replace(/```[\s\S]*?```/g, '')
      for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
        const target = m[1]
        if (/^(https?:|mailto:|#)/.test(target)) continue
        const file = join(root, dirname(page), target.split('#')[0])
        assert.ok(existsSync(file) && statSync(file).size >= 0, `${page} links to ${target}, which does not exist`)
      }
    })
  }

  test('in-page anchors of the events summary resolve to headings', () => {
    const doc = read('docs/reference/events.md')
    for (const m of doc.matchAll(/\]\(#([\w-]+)\)/g)) {
      assert.match(doc, new RegExp(`^## \`${escapeRe(m[1])}\``, 'm'), `no heading for #${m[1]}`)
    }
  })
})

describe('the trading dashboard example and guide', () => {
  test('every example page is linked from the examples index and built into the site', () => {
    const index = read('examples/index.html')
    const site = read('vite.site.config.js')
    // The site config builds every examples/*.html it finds (public-site), so a page is built without being named there.
    const scansExamples = /readdirSync\(src\('examples'\)\)[^\n]*\.html/.test(site)
    for (const f of readdirSync(join(root, 'examples')).filter((n) => n.endsWith('.html') && n !== 'index.html')) {
      assert.ok(index.includes(`href="${f}"`), `examples/index.html should link ${f}`)
      assert.ok(scansExamples || site.includes(`examples/${f}`), `vite.site.config.js should build examples/${f}`)
    }
  })
  test('the README and the guide point at the example, and the guide at its widgets', () => {
    assert.ok(read('README.md').includes('examples/trading.html'))
    const guide = read('docs/guide/trading-dashboard.md')
    assert.ok(guide.includes('examples/trading.html'))
    for (const tag of ['ts-today-pnl', 'ts-equity-curve', 'ts-session-clock', 'ts-watchlist', 'ts-open-positions', 'ts-pnl-calendar', 'ts-edge-stats', 'ts-capital-funding']) {
      assert.ok(guide.includes(tag), `the guide should cover <${tag}>`)
    }
  })
  // emittedActions() only sees this.emit('literal'); most actions go through
  // ACTION_* constants, so the page test reads both. The list is also kept by hand:
  // a new action fails the first test until it is added here and handled in the page.
  const ACTIONS = ['add-instrument', 'exit-all', 'exit-position', 'open', 'range', 'rebalance', 'retry', 'select', 'sort', 'timeframe']
  // <ts-mini-chart> draws with the optional peer Emberwick and has its own entry, so the example (which imports the all-in
  // entry) has no such tile and nothing to handle (RFC 0004 §6.1).
  const NOT_IN_THE_EXAMPLE = ['timeframe']
  const widgetActions = () => {
    const names = new Set(emittedActions())
    for (const file of elementFiles()) {
      for (const m of stripComments(read(file)).matchAll(/\bconst\s+ACTION_\w+\s*=\s*'([\w-]+)'/g)) names.add(m[1])
    }
    return [...names].sort()
  }
  test('the widgets emit exactly the actions this test lists', () => {
    assert.deepEqual(widgetActions(), ACTIONS)
  })
  test('every action but open is in the events reference (open is only in widget.d.ts and the widget pages)', () => {
    const events = read('docs/reference/events.md')
    for (const action of ACTIONS.filter((a) => a !== 'open')) assert.match(events, new RegExp(`\\| \`${action}\` \\|`), `docs/reference/events.md should list ${action}`)
  })
  for (const action of ACTIONS.filter((a) => !NOT_IN_THE_EXAMPLE.includes(a))) {
    test(`the page handles the ${action} action`, () => {
      const page = stripComments(read('examples/trading.html'))
      assert.ok(new RegExp(`action === '${action}'`).test(page), `examples/trading.html should handle the ${action} action in its ts-action listener`)
    })
  }
})
