import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildManifests, readDeclarations } from '../scripts/gen-manifest.mjs'
import { elementEntries, describeEntry } from '../scripts/entries.mjs'

// RFC 0003 §22.3: the manifest is generated from the declaration files with no analyzer, lists
// every tag with its attributes, properties, events, parts and slots, and refuses an element
// that nobody documented. These tests read src/ only; the built files are checked by
// scripts/verify-package.mjs, and the typings by npm run check:types.

const entries = elementEntries().map(describeEntry)
const { cem, vscode } = buildManifests()
const declarations = cem.modules.flatMap((m) => m.declarations)
const byTag = new Map(declarations.filter((d) => d.tagName).map((d) => [d.tagName, d]))

describe('custom elements manifest', () => {
  test('uses schemaVersion 1.0.0 and lists every tag a define module registers, with no list in the generator', () => {
    assert.equal(cem.schemaVersion, '1.0.0')
    for (const tag of entries.flatMap((e) => e.tags)) assert.ok(byTag.has(tag), `${tag} is in custom-elements.json`)
    assert.equal(byTag.size, entries.flatMap((e) => e.tags).length)
  })

  test('every tag has attributes, events, parts and slots, and the inherited ones are there', () => {
    for (const [tag, d] of byTag) {
      assert.ok(d.attributes.length > 0, `${tag} attributes`)
      assert.ok(d.events.length > 0, `${tag} events`)
      assert.ok(d.cssParts.length > 0, `${tag} parts`)
      assert.ok(d.slots.length > 0, `${tag} slots`)
      assert.ok(d.members.length > 0, `${tag} members`)
    }
    const metric = byTag.get('ts-metric')
    for (const attr of ['size', 'label', 'locale', 'time-zone', 'href', 'activatable']) assert.ok(metric.attributes.some((a) => a.name === attr), `ts-metric has attribute ${attr}`)
    assert.ok(metric.events.some((e) => e.name === 'ts-action'))
    assert.ok(metric.cssParts.some((p) => p.name === 'value') && metric.cssParts.some((p) => p.name === 'tile'))
    assert.ok(metric.members.some((m) => m.kind === 'field' && m.name === 'data'), 'the data property is inherited')
    assert.ok(metric.members.some((m) => m.kind === 'method' && m.name === 'emit'))
  })

  test('maps an attribute to its property and keeps the tag-only ones', () => {
    const card = byTag.get('ts-card')
    assert.ok(card.slots.some((s) => s.name === 'footer') && card.slots.some((s) => s.name === ''), 'the default slot has the empty name')
    assert.equal(card.attributes.find((a) => a.name === 'size').fieldName, 'size')
    assert.equal(byTag.get('ts-equity-curve').attributes.find((a) => a.name === 'range').fieldName, 'range')
    assert.equal(card.attributes.find((a) => a.name === 'as-of').fieldName, undefined)
  })

  test('documents the grid from a block in index.d.ts and its class in grid.d.ts', () => {
    const grid = byTag.get('ts-grid')
    for (const e of ['ts-layout-change', 'ts-edit-change', 'ts-reading-order-change']) assert.ok(grid.events.some((x) => x.name === e), e)
    assert.ok(grid.cssParts.some((p) => p.name === 'edit-pill'))
    assert.ok(grid.members.some((m) => m.name === 'readingOrder' && m.readonly))
    assert.ok(grid.members.some((m) => m.name === 'undo' && m.kind === 'method'))
    assert.ok(!grid.attributes.some((a) => a.name === 'size'), 'a grid is not a widget')
  })

  test('the VS Code data lists the same tags, with values for a literal union', () => {
    assert.deepEqual(vscode.tags.map((t) => t.name).sort(), [...byTag.keys()].sort())
    const size = vscode.tags.find((t) => t.name === 'ts-metric').attributes.find((a) => a.name === 'size')
    assert.deepEqual(size.values.map((v) => v.name), ['S', 'Wide', 'Tall', 'M', 'L', 'XL', 'Banner'])
  })
})

describe('the attribute tables that type the frameworks', () => {
  const text = readFileSync(new URL('../src/elements/index.d.ts', import.meta.url), 'utf8')
  const names = (body) => [...body.matchAll(/(?:^|[{;\n])\s*(?:'([\w-]+)'|([A-Za-z]\w*))\?:/g)].map((m) => m[1] || m[2])
  const base = text.slice(text.indexOf('interface TsWidgetAttributes {'))
  const widgetAttrs = names(base.slice(base.indexOf('{') + 1, base.indexOf('\n}')))
  const table = text.slice(text.indexOf('interface TsElementAttributes {'))
  const own = new Map()
  for (const m of table.slice(0, table.indexOf('\n}\n')).matchAll(/^ {2}'(ts-[a-z-]+)': \{([\s\S]*?)\}(?=\n {2}'|$)/gm)) own.set(m[1], names(m[2]))

  test('TsWidgetAttributes matches the @base block, bar `data`, which is a property', () => {
    const documented = byTag.get('ts-metric').attributes.map((a) => a.name).filter((n) => n !== 'data')
    assert.deepEqual([...widgetAttrs].sort(), [...documented].sort())
  })

  test('each TsElementAttributes entry matches its tag\'s own @attr lines', () => {
    assert.ok(own.size >= 3, 'the table was read')
    for (const [tag, d] of byTag) {
      const isWidget = d.superclass?.name === 'TsWidget'
      // A widget's `data` is a property the typings give its own type; the table lists the rest.
      const expected = d.attributes.map((a) => a.name).filter((n) => !isWidget || (n !== 'data' && !widgetAttrs.includes(n)))
      assert.deepEqual([...(own.get(tag) || [])].sort(), expected.sort(), `${tag}'s attributes beyond the widget base`)
    }
  })
})

describe('the generator on a tree that gains an element', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tickslate-manifest-'))
  for (const f of ['index.d.ts', 'widget.d.ts', 'grid.d.ts']) copyFileSync(new URL(`../src/elements/${f}`, import.meta.url), join(dir, f))
  const entry = { file: 'gauge', name: 'gauge', input: '', tags: ['ts-gauge'], exports: ['TsGauge'] }

  test('fails the build for a tag with no @element block', () => {
    writeFileSync(join(dir, 'gauge.d.ts'), `import { TsWidget } from './widget.js'\nexport declare class TsGauge extends TsWidget<{ value: number }> {}\ndeclare global { interface HTMLElementTagNameMap { 'ts-gauge': TsGauge } }\n`)
    const real = readDeclarations()
    assert.throws(() => buildManifests({ entries: [...entries, entry], declarations: readDeclarations(dir) }), /ts-gauge .*@element ts-gauge/)
    assert.doesNotThrow(() => buildManifests({ entries, declarations: real }))
  })

  test('picks the element up from its own declaration, with no edit to the generator', () => {
    writeFileSync(
      join(dir, 'gauge.d.ts'),
      `import { TsWidget } from './widget.js'
/**
 * <ts-gauge>, a dial.
 *
 * @element ts-gauge
 * @attr {number} max - The top of the scale.
 * @fires {CustomEvent<{ action: 'zero' }>} ts-action - Fired at zero.
 * @csspart needle - The pointer.
 * @slot caption - Text under the dial.
 */
export declare class TsGauge extends TsWidget<{ value: number }> {
  /** The scale's top. */
  max: number
  reset(to?: number): void
}
declare global { interface HTMLElementTagNameMap { 'ts-gauge': TsGauge } }
`
    )
    const { cem: out } = buildManifests({ entries: [...entries, entry], declarations: readDeclarations(dir) })
    const gauge = out.modules.flatMap((m) => m.declarations).find((d) => d.tagName === 'ts-gauge')
    assert.ok(gauge.attributes.some((a) => a.name === 'max' && a.fieldName === 'max'))
    assert.ok(gauge.attributes.some((a) => a.name === 'size'), 'inherits the widget attributes')
    assert.ok(gauge.cssParts.some((p) => p.name === 'needle') && gauge.cssParts.some((p) => p.name === 'tile'))
    assert.ok(gauge.slots.some((s) => s.name === 'caption'))
    assert.ok(gauge.members.some((m) => m.name === 'max' && !m.inheritedFrom))
    assert.ok(gauge.members.some((m) => m.name === 'reset' && m.parameters[0].name === 'to'))
    rmSync(dir, { recursive: true, force: true })
  })
})
