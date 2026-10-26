import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Pins the public surface (RFC 0004 §9.2): core and element exports, each tag's
// observed attributes, events and parts, the --ts-* tokens and the package
// entries. It reads source with regular expressions and imports only node:*, so
// CI runs it without `npm install`, a build or TypeScript.
//
// Any difference fails, with the added and removed names. Review it, run
// `npm run api:update`, and commit the snapshot in the SAME PR with a changelog
// line under Added or Breaking (docs/VERSIONING.md says which).
//
// The reader is a deliberate copy of the small scanners in
// docs-coverage.test.mjs: importing that file would register its tests twice.

const root = new URL('../', import.meta.url).pathname
const SNAPSHOT = 'test/api-surface.snapshot.json'
const read = (path) => readFileSync(join(root, path), 'utf8')
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const sorted = (iterable) => [...new Set(iterable)].sort()

// ── The reader ──────────────────────────────────────────────────────────────

/** Names an entry file exports: `export const|function|class|let x` and `export { a, b as c }`. */
export function exportsOf(source) {
  const code = stripComments(source)
  const names = new Set()
  for (const m of code.matchAll(/export\s+(?:const|function|class|let)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1])
  for (const m of code.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()
      if (name) names.add(name)
    }
  }
  return sorted(names)
}

const elementFiles = () => readdirSync(join(root, 'src/elements')).filter((f) => f.endsWith('.js')).map((f) => `src/elements/${f}`)
const defineFiles = () => readdirSync(join(root, 'src/elements/define')).filter((f) => f.endsWith('.js')).map((f) => `src/elements/define/${f}`)

/** Every `define('ts-x', Class)` call under src/elements, as { tag, className }. */
export function definedTags() {
  const out = []
  for (const file of [...elementFiles(), ...defineFiles()]) {
    for (const m of stripComments(read(file)).matchAll(/\bdefine\(\s*'([a-z][\w]*-[\w-]*)'\s*,\s*([A-Za-z_$][\w$]*)\s*\)/g)) out.push({ tag: m[1], className: m[2] })
  }
  return out
}

/** className -> { file, parent } for every `export class X extends Y` (parent is '' without one). */
export function classes() {
  const out = new Map()
  for (const file of elementFiles()) {
    for (const m of stripComments(read(file)).matchAll(/export\s+class\s+(\w+)(?:\s+extends\s+(\w+))?/g)) out.set(m[1], { file, parent: m[2] || '' })
  }
  return out
}

/** The returned array of `static get observedAttributes()` of one class, with its parent's list merged for a `...super.observedAttributes` spread. */
export function attributesOf(className, table = classes()) {
  const info = table.get(className)
  if (!info) return []
  const source = stripComments(read(info.file))
  const start = source.search(new RegExp(`class\\s+${className}\\b`))
  const rest = source.slice(start + 1)
  // Up to the next class declaration, so a file holding two classes cannot lend its neighbour's list.
  const next = rest.search(/\bclass\s+\w+/)
  const body = next < 0 ? rest : rest.slice(0, next)
  const m = body.match(/static\s+get\s+observedAttributes\s*\(\s*\)\s*\{\s*return\s*\[([^\]]*)\]/)
  if (!m) return info.parent ? attributesOf(info.parent, table) : []
  const own = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
  return sorted([...own, ...(/\.\.\.\s*super\.observedAttributes/.test(m[1]) && info.parent ? attributesOf(info.parent, table) : [])])
}

/** `const NAME = 'value'` string constants in src/elements, for `this.emit(ACTION_X)`. */
function stringConstants() {
  const out = new Map()
  for (const file of elementFiles()) {
    for (const m of stripComments(read(file)).matchAll(/\bconst\s+([A-Z][A-Z0-9_]*)\s*=\s*'([\w-]+)'/g)) out.set(m[1], m[2])
  }
  return out
}

/** The files a tag draws on: its class file and the element modules that file imports directly (widget.js, list-parts.js, rows.js...). */
function filesFor(className, table) {
  const info = table.get(className)
  if (!info) return []
  const files = new Set([info.file])
  for (const m of stripComments(read(info.file)).matchAll(/from\s+'\.\/([\w-]+)\.js'/g)) files.add(`src/elements/${m[1]}.js`)
  return [...files]
}

/** Event names a set of files fires, with `ts-action:<name>` for every action. */
export function eventsIn(files, constants = stringConstants()) {
  const names = new Set()
  for (const file of files) {
    const code = stripComments(read(file))
    for (const m of code.matchAll(/(?:\b_emit|new CustomEvent)\(\s*'(ts-[\w-]+)'/g)) names.add(m[1])
    for (const m of code.matchAll(/\bthis\.emit\(\s*(?:'([\w-]+)'|([A-Z][A-Z0-9_]*))/g)) {
      const action = m[1] || constants.get(m[2])
      if (action) names.add(`ts-action:${action}`)
    }
  }
  return sorted(names)
}

/** Every `part="a b"` token in the template strings of a set of files. */
export function partsIn(files) {
  const names = new Set()
  for (const file of files) {
    for (const m of read(file).matchAll(/\bpart="([^"$`]+)"/g)) for (const p of m[1].trim().split(/\s+/)) names.add(p)
  }
  return sorted(names)
}

/** The --ts-* custom properties declared (name followed by a colon) in tokens.css. */
export function tokensIn(css) {
  return sorted([...stripComments(css).matchAll(/(--ts-[\w-]+)\s*:/g)].map((m) => m[1]))
}

/** The whole surface, with sorted keys so the snapshot file is stable. */
export function surface() {
  const table = classes()
  const constants = stringConstants()
  const tags = {}
  for (const { tag, className } of definedTags().sort((a, b) => a.tag.localeCompare(b.tag))) {
    const files = filesFor(className, table)
    tags[tag] = { class: className, attributes: attributesOf(className, table), events: eventsIn(files, constants), parts: partsIn(files) }
  }
  return {
    core: { exports: exportsOf(read('src/core/index.js')) },
    elements: { exports: exportsOf(read('src/elements/index.js')), tags },
    tokens: tokensIn(read('src/themes/tokens.css')),
    entries: Object.keys(JSON.parse(read('package.lib.json')).exports).sort(),
  }
}

// ── Comparing ───────────────────────────────────────────────────────────────

/** One `section: name` line per leaf, so a diff reads as added and removed lines. */
function flatten(value, path = '', out = []) {
  if (Array.isArray(value)) value.forEach((name) => out.push(`${path}: ${name}`))
  else if (typeof value === 'string') out.push(`${path}: ${value}`)
  else for (const key of Object.keys(value)) flatten(value[key], path ? `${path}.${key}` : key, out)
  return out
}

export function difference(expected, actual) {
  const before = new Set(flatten(expected))
  const after = new Set(flatten(actual))
  return { added: [...after].filter((x) => !before.has(x)).sort(), removed: [...before].filter((x) => !after.has(x)).sort() }
}

const current = surface()

// ── Self-checks, so a quiet regex cannot make the snapshot vacuous ──────────

describe('the reader', () => {
  test('finds the things it is meant to find', () => {
    assert.ok(current.core.exports.length >= 40 && current.core.exports.includes('equityStats'))
    assert.ok(current.elements.exports.includes('TsMetric') && current.elements.exports.includes('persistLayout'))
    assert.ok(Object.keys(current.elements.tags).length >= 14, 'tags')
    assert.ok(current.tokens.length >= 30 && current.tokens.includes('--ts-accent'), 'tokens')
    assert.ok(current.entries.includes('.') && current.entries.includes('./tokens.css'))
    const metric = current.elements.tags['ts-metric']
    assert.ok(metric.attributes.includes('size'), 'the base class list is merged in')
    assert.ok(metric.parts.includes('value'), 'parts')
    assert.ok(current.elements.tags['ts-table'].events.includes('ts-action:sort'), 'actions named through a constant')
    assert.ok(current.elements.tags['ts-grid'].events.includes('ts-layout-change'), 'events')
  })

  test('reads exports, spreads and parts from a sample', () => {
    assert.deepEqual(exportsOf("export const a = 1\n// export const no = 2\nexport { b, c as d } from './x.js'"), ['a', 'b', 'd'])
    assert.deepEqual(tokensIn(':root { --ts-a: 1; --ts-b: var(--ts-a); } /* --ts-c: 2; */'), ['--ts-a', '--ts-b'])
  })

  test('reports what changed, name by name', () => {
    const { added, removed } = difference({ a: { exports: ['x', 'y'] } }, { a: { exports: ['y', 'z'] } })
    assert.deepEqual(added, ['a.exports: z'])
    assert.deepEqual(removed, ['a.exports: x'])
  })
})

// ── The snapshot ────────────────────────────────────────────────────────────

describe('the public API surface', () => {
  test(`matches ${SNAPSHOT}`, () => {
    if (process.env.UPDATE_API_SNAPSHOT) {
      writeFileSync(join(root, SNAPSHOT), `${JSON.stringify(current, null, 2)}\n`)
      return
    }
    const expected = JSON.parse(read(SNAPSHOT))
    const { added, removed } = difference(expected, current)
    assert.ok(
      !added.length && !removed.length,
      [
        'The public API surface changed.',
        ...removed.map((x) => `  - ${x}`),
        ...added.map((x) => `  + ${x}`),
        'If this is intended, run `npm run api:update`, review the diff of test/api-surface.snapshot.json,',
        'and commit it in this PR with a changelog line under Added or Breaking (docs/VERSIONING.md).',
      ].join('\n'),
    )
  })
})
