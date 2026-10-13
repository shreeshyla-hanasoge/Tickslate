import { test } from 'node:test'
import assert from 'node:assert/strict'
import { persistLayout } from '../src/elements/persist.js'

function fakeGrid(columns = 4) {
  const grid = new EventTarget()
  grid.columns = columns
  grid.sets = []
  let layout = { version: 1, device: 'desktop', profiles: { market: [], closed: [] } }
  Object.defineProperty(grid, 'layout', {
    get: () => layout,
    set: (v) => { layout = v; grid.sets.push(v) },
  })
  return grid
}
const fire = (grid, type, detail) => grid.dispatchEvent(new CustomEvent(type, { detail }))
function fakeStorage(init = {}, { throwGet = false, throwSet = false, throwRemove = false } = {}) {
  const data = { ...init }
  return {
    data,
    getItem(k) { if (throwGet) throw new Error('denied'); return k in data ? data[k] : null },
    setItem(k, v) { if (throwSet) throw new Error('quota'); data[k] = v },
    removeItem(k) { if (throwRemove) throw new Error('denied'); delete data[k] },
  }
}
const item = (id, extra = {}) => ({ id, type: 'today-pnl', size: 'S', ...extra })
const stored = (ids, device = 'desktop') =>
  JSON.stringify({ version: 1, device, profiles: { market: ids.map((id) => item(id)), closed: [] } })
const ids = (layout) => layout.profiles.market.map((i) => i.id)

test('loads the stored layout for a measured grid', () => {
  const grid = fakeGrid(4)
  const storage = fakeStorage({ 'k:desktop': stored(['a', 'b']) })
  persistLayout(grid, { key: 'k', storage })
  assert.deepEqual(ids(grid.layout), ['a', 'b'])
})

test('waits for ts-columns-change when columns is 0', () => {
  const grid = fakeGrid(0)
  const storage = fakeStorage({ 'k:phone': stored(['p'], 'phone') })
  persistLayout(grid, { key: 'k', storage })
  assert.equal(grid.sets.length, 0)
  grid.columns = 2
  fire(grid, 'ts-columns-change', { columns: 2, device: 'phone', initial: true })
  assert.deepEqual(ids(grid.layout), ['p'])
})

test('nothing stored and no defaults leaves the grid alone', () => {
  const grid = fakeGrid(3)
  persistLayout(grid, { key: 'k', storage: fakeStorage() })
  assert.equal(grid.sets.length, 0)
})

test('nothing stored applies defaults in each accepted form', () => {
  let grid = fakeGrid(3)
  persistLayout(grid, { key: 'k', storage: fakeStorage(), defaults: [item('x')] })
  assert.deepEqual(ids(grid.layout), ['x'])

  grid = fakeGrid(3)
  persistLayout(grid, { key: 'k', storage: fakeStorage(), defaults: JSON.parse(stored(['y'])) })
  assert.deepEqual(ids(grid.layout), ['y'])

  grid = fakeGrid(2)
  persistLayout(grid, { key: 'k', storage: fakeStorage(), defaults: { desktop: [item('d')], phone: [item('p')] } })
  assert.deepEqual(ids(grid.layout), ['p'])

  grid = fakeGrid(2)
  persistLayout(grid, { key: 'k', storage: fakeStorage(), defaults: { desktop: [item('d')] } })
  assert.deepEqual(ids(grid.layout), ['d'])
})

test('saves the event layout under the current device key', () => {
  const grid = fakeGrid(4)
  const storage = fakeStorage()
  persistLayout(grid, { key: 'k', storage })
  const layout = JSON.parse(stored(['z']))
  fire(grid, 'ts-layout-change', { layout })
  assert.deepEqual(JSON.parse(storage.data['k:desktop']), layout)
})

test('corrupt JSON and wrong shapes fall back without throwing', () => {
  let grid = fakeGrid(4)
  persistLayout(grid, { key: 'k', storage: fakeStorage({ 'k:desktop': '{nope' }), defaults: [item('d')] })
  assert.deepEqual(ids(grid.layout), ['d'])

  grid = fakeGrid(4)
  persistLayout(grid, { key: 'k', storage: fakeStorage({ 'k:desktop': '42' }) })
  assert.deepEqual(ids(grid.layout), [])
  assert.equal(grid.layout.device, 'desktop')

  grid = fakeGrid(4)
  persistLayout(grid, { key: 'k', storage: fakeStorage({ 'k:desktop': JSON.stringify([item('arr')]) }) })
  assert.deepEqual(ids(grid.layout), ['arr'])
})

test('unknown widgets in stored data are kept', () => {
  const grid = fakeGrid(4)
  const raw = JSON.stringify({ version: 1, device: 'desktop', profiles: { market: [{ id: 'u', type: 'mystery', size: 'S' }], closed: [] } })
  persistLayout(grid, { key: 'k', storage: fakeStorage({ 'k:desktop': raw }) })
  assert.deepEqual(ids(grid.layout), ['u'])
})

test('throwing storage falls back to defaults and never throws', () => {
  const grid = fakeGrid(4)
  const storage = fakeStorage({}, { throwGet: true, throwSet: true, throwRemove: true })
  const handle = persistLayout(grid, { key: 'k', storage, defaults: [item('d')] })
  assert.deepEqual(ids(grid.layout), ['d'])
  assert.doesNotThrow(() => fire(grid, 'ts-layout-change', { layout: grid.layout }))
  assert.doesNotThrow(() => handle.reset())
})

test('no storage only applies defaults', () => {
  const grid = fakeGrid(4)
  persistLayout(grid, { key: 'k', storage: null, defaults: [item('d')] })
  assert.deepEqual(ids(grid.layout), ['d'])
  assert.doesNotThrow(() => fire(grid, 'ts-layout-change', { layout: grid.layout }))
})

test('a device switch loads the other entry and keeps the two apart', () => {
  const grid = fakeGrid(4)
  const storage = fakeStorage({ 'k:desktop': stored(['d']), 'k:phone': stored(['p'], 'phone') })
  persistLayout(grid, { key: 'k', storage })
  assert.deepEqual(ids(grid.layout), ['d'])
  grid.columns = 2
  fire(grid, 'ts-columns-change', { columns: 2, device: 'phone', initial: false })
  assert.deepEqual(ids(grid.layout), ['p'])
  fire(grid, 'ts-layout-change', { layout: JSON.parse(stored(['p2'], 'phone')) })
  assert.deepEqual(ids(JSON.parse(storage.data['k:phone'])), ['p2'])
  assert.deepEqual(ids(JSON.parse(storage.data['k:desktop'])), ['d'])
})

test('a columns change within one device does not reload', () => {
  const grid = fakeGrid(4)
  persistLayout(grid, { key: 'k', storage: fakeStorage({ 'k:desktop': stored(['d']) }) })
  const n = grid.sets.length
  fire(grid, 'ts-columns-change', { columns: 3, device: 'desktop', initial: false })
  assert.equal(grid.sets.length, n)
})

test('reset removes the entry and applies the defaults', () => {
  const grid = fakeGrid(4)
  const storage = fakeStorage({ 'k:desktop': stored(['mine']), 'k:phone': stored(['pm'], 'phone') })
  const handle = persistLayout(grid, { key: 'k', storage, defaults: [item('d')] })
  assert.deepEqual(ids(grid.layout), ['mine'])
  handle.reset()
  assert.equal('k:desktop' in storage.data, false)
  assert.deepEqual(ids(grid.layout), ['d'])
  handle.reset('phone')
  assert.equal('k:phone' in storage.data, false)
  assert.deepEqual(ids(grid.layout), ['d'])
})

test('reset without defaults removes the entry and leaves the grid', () => {
  const grid = fakeGrid(4)
  const storage = fakeStorage({ 'k:desktop': stored(['mine']) })
  const handle = persistLayout(grid, { key: 'k', storage })
  const n = grid.sets.length
  handle.reset()
  assert.equal(storage.data['k:desktop'], undefined)
  assert.equal(grid.sets.length, n)
})

test('dispose removes every listener', () => {
  const grid = fakeGrid(4)
  const storage = fakeStorage({ 'k:phone': stored(['p'], 'phone') })
  const added = []
  const removed = []
  const add = grid.addEventListener.bind(grid)
  const rem = grid.removeEventListener.bind(grid)
  grid.addEventListener = (t, f, o) => { added.push([t, f]); add(t, f, o) }
  grid.removeEventListener = (t, f, o) => { removed.push([t, f]); rem(t, f, o) }
  const handle = persistLayout(grid, { key: 'k', storage })
  handle.dispose()
  assert.equal(added.length, 2)
  for (const pair of added) assert.ok(removed.some(([t, f]) => t === pair[0] && f === pair[1]))
  const n = grid.sets.length
  fire(grid, 'ts-columns-change', { columns: 2, device: 'phone' })
  fire(grid, 'ts-layout-change', { layout: JSON.parse(stored(['q'])) })
  assert.equal(grid.sets.length, n)
  assert.equal(storage.data['k:desktop'], undefined)
})

test('a missing key is a clear error', () => {
  assert.throws(() => persistLayout(fakeGrid(), {}), TypeError)
})
