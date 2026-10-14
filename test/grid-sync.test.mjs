import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WIDGETS, place, resizeItem, readLayout, moveItem, typeForTag } from '../src/core/index.js'
import { elementSpec, itemsFromChildren, reconcile, specResolver } from '../src/elements/grid-geometry.js'

// The pure half of implicit mode (RFC 0002 §1.5), driven the way the grid drives it.
const resolve = (tag) => {
  const type = typeForTag(WIDGETS, tag) ?? tag
  return { type, spec: Object.prototype.hasOwnProperty.call(WIDGETS, type) ? WIDGETS[type] : null }
}
const kids = (...specs) => itemsFromChildren(specs.map((s) => (typeof s === 'string' ? { tag: s } : s)), resolve)
const ids = (items) => items.map((i) => i.id)
const none = new Set()

test('a new child is appended at the end', () => {
  const seeded = kids({ tag: 'ts-today-pnl', item: 'a' }, { tag: 'ts-edge-stats', item: 'b' })
  const next = reconcile(seeded, kids({ tag: 'ts-today-pnl', item: 'a' }, { tag: 'ts-edge-stats', item: 'b' }, { tag: 'ts-metric', item: 'c' }), none)
  assert.deepEqual(ids(next), ['a', 'b', 'c'])
})

test('a moved tile keeps its position after a child append', () => {
  const dom = [{ tag: 'ts-card', item: 'a' }, { tag: 'ts-card', item: 'b' }, { tag: 'ts-card', item: 'c' }]
  const moved = moveItem(kids(...dom), 'c', 0)
  assert.deepEqual(ids(moved), ['c', 'a', 'b'])
  const next = reconcile(moved, kids(...dom, { tag: 'ts-card', item: 'd' }), none)
  assert.deepEqual(ids(next), ['c', 'a', 'b', 'd'])
})

test('a child removed from the DOM is dropped', () => {
  const dom = [{ tag: 'ts-card', item: 'a' }, { tag: 'ts-card', item: 'b' }, { tag: 'ts-card', item: 'c' }]
  assert.deepEqual(ids(reconcile(kids(...dom), kids(dom[0], dom[2]), none)), ['a', 'c'])
})

test('a tile the user removed stays removed after any child mutation', () => {
  const dom = [{ tag: 'ts-card', item: 'a' }, { tag: 'ts-card', item: 'b' }]
  const removed = new Set(['b'])
  // The user removed b; its element is still in the DOM.
  let items = reconcile(kids(...dom).filter((i) => i.id !== 'b'), kids(...dom), removed)
  assert.deepEqual(ids(items), ['a'])
  items = reconcile(items, kids(...dom, { tag: 'ts-card', item: 'c' }), removed)
  assert.deepEqual(ids(items), ['a', 'c'])
  // Even from a list that still holds it.
  assert.deepEqual(ids(reconcile(kids(...dom), kids(...dom), removed)), ['a'])
})

test('a user resize survives a re-render, and a new id takes the declared size', () => {
  const dom = [{ tag: 'ts-card', item: 'a', declaredSize: 'S' }]
  const grown = resizeItem(kids(...dom), 'a', 'L', specResolver(new Map(), {}, WIDGETS))
  const next = reconcile(grown, kids(...dom, { tag: 'ts-card', item: 'b', declaredSize: 'M' }), none)
  assert.deepEqual(next.map((i) => i.size), ['L', 'M'])
})

test('an L tile survives 1300px, 390px, 1300px and a child append', () => {
  const resolver = specResolver(new Map(), {}, WIDGETS)
  const dom = [{ tag: 'ts-card', item: 'big', declaredSize: 'L' }, { tag: 'ts-card', item: 'small', declaredSize: 'S' }]
  let items = kids(...dom)
  const variantAt = (columns) => place(items, columns, resolver).placements.find((p) => p.id === 'big').variant
  assert.equal(variantAt(4), 'L')
  // The phone reflows L to its M design, and the grid writes M onto the element.
  assert.equal(variantAt(2), 'M')
  // The host re-renders with a new child; the declared sizes are read again,
  // but the list keeps L.
  items = reconcile(items, kids(...dom, { tag: 'ts-card', item: 'extra' }), none)
  assert.equal(items[0].size, 'L')
  assert.equal(variantAt(4), 'L')
})

test('two cards resize within their own size lists', () => {
  const dom = [{ tag: 'ts-card', item: 'a', declaredSize: 'S' }, { tag: 'ts-card', item: 'b', declaredSize: 'M' }]
  const specs = new Map([
    ['a', { label: '', sizes: ['S', 'Wide'] }],
    ['b', { label: '', sizes: ['M', 'L'] }],
  ])
  const resolver = specResolver(specs, {}, WIDGETS)
  const items = itemsFromChildren(dom.map((d) => ({ ...d, spec: specs.get(d.item) })), resolve)
  const resized = resizeItem(resizeItem(items, 'a', 'XL', resolver), 'b', 'S', resolver)
  assert.deepEqual(resized.map((i) => i.size), ['Wide', 'M'])
})

test('the L round trip through the core reads back unchanged', () => {
  const resolver = specResolver(new Map(), {}, WIDGETS)
  const items = kids({ tag: 'ts-card', item: 'a', declaredSize: 'L' })
  const { layout, issues } = readLayout(items, { catalog: resolver, unknown: 'keep' })
  assert.deepEqual(issues, [])
  assert.deepEqual(layout.profiles.market, items)
})

test('a layout item with no child is skipped in placement but a tile with an unknown tag is kept', () => {
  const resolver = specResolver(new Map(), {}, WIDGETS)
  const { layout, issues } = readLayout([{ id: 'a', type: 'card', size: 'S' }, { id: 'mystery', size: 'Tall' }], { catalog: resolver, unknown: 'keep' })
  assert.deepEqual(layout.profiles.market.map((i) => i.id), ['a', 'mystery'])
  assert.deepEqual(issues.map((i) => i.fixed), ['kept'])
  // The grid places only the items that have a child; the rest stay in the list.
  const shown = layout.profiles.market.filter((i) => i.id === 'a')
  assert.equal(place(shown, 4, resolver).placements.length, 1)
})

test('a profile looked up by an inherited name is empty, not a function', () => {
  const { layout } = readLayout([{ id: 'a', type: 'card', size: 'S' }])
  const own = (profiles, name) => (Object.prototype.hasOwnProperty.call(profiles, name) ? profiles[name] : [])
  assert.deepEqual(own(layout.profiles, 'toString'), [])
  assert.equal(own(layout.profiles, 'market').length, 1)
})

test('a child\'s own spec getter wins over its sizes and label attributes', () => {
  const attrs = { sizes: 'S M L', label: 'Attr' }
  const el = (own) => ({ spec: own, getAttribute: (n) => attrs[n] ?? null })
  assert.deepEqual(elementSpec(el({ label: 'Own', sizes: ['M'] })), { label: 'Own', sizes: ['M'] })
  // A getter that answers nothing usable is still the element's word.
  assert.equal(elementSpec(el(null)), null)
  const plain = { getAttribute: (n) => attrs[n] ?? null }
  assert.deepEqual(elementSpec(plain), { label: 'Attr', sizes: ['S', 'M', 'L'] })
})
