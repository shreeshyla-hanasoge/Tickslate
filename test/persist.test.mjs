import { test, describe, before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { readLayout, configure } from '../src/core/index.js'
import { resetWarnings } from '../src/elements/dev.js'
import { persistLayout } from '../src/elements/persist.js'
import { FakeElement, FakeDocument } from './fake-dom.mjs'

function fakeGrid(columns = 4) {
  const grid = new EventTarget()
  grid.columns = columns
  grid.sets = []
  let layout = { version: 1, device: 'desktop', profiles: { market: [], closed: [] } }
  Object.defineProperty(grid, 'layout', {
    configurable: true,
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

test('the phone top strip is saved with a change and comes back on load', () => {
  const storage = fakeStorage()
  const grid = fakeGrid(2)
  persistLayout(grid, { key: 'k', storage })
  const layout = { version: 1, device: 'phone', profiles: { market: ['a', 'b', 'c'].map((id) => item(id)), closed: [] }, topStrip: ['c', 'a'] }
  fire(grid, 'ts-layout-change', { layout, items: layout.profiles.market, previous: layout, profile: 'market', reason: 'strip', id: 'c' })
  assert.deepEqual(JSON.parse(storage.data['k:phone']).topStrip, ['c', 'a'])
  const next = fakeGrid(2)
  persistLayout(next, { key: 'k', storage })
  assert.deepEqual(next.layout.topStrip, ['c', 'a'])
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

test('reset without defaults removes the entry and returns to the layout the grid had when attached', () => {
  const grid = fakeGrid(4)
  const before = grid.layout
  const storage = fakeStorage({ 'k:desktop': stored(['mine']) })
  const handle = persistLayout(grid, { key: 'k', storage })
  assert.deepEqual(ids(grid.layout), ['mine'])
  handle.reset()
  assert.equal(storage.data['k:desktop'], undefined)
  assert.deepEqual(grid.layout, before, 'the saved layout is gone and the layout from before it is back')
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

// ── Adapters (RFC 0003 §4.2) ────────────────────────────────────────────────

const deferred = () => {
  const d = {}
  d.promise = new Promise((resolve, reject) => Object.assign(d, { resolve, reject }))
  return d
}
// One macrotask: every promise callback queued so far has run.
const settle = () => new Promise((resolve) => setImmediate(resolve))
const layoutOf = (list, device = 'desktop') => JSON.parse(stored(list, device))

describe('adapters', () => {
  let warns
  beforeEach((t) => {
    resetWarnings()
    warns = []
    t.mock.method(console, 'warn', (m) => warns.push(m))
  })

  // An adapter that records its calls and answers from per-device deferreds.
  function fakeAdapter({ remove = true } = {}) {
    const a = { loads: [], saves: [], removes: [], pending: [] }
    a.load = (device) => {
      const d = deferred()
      a.loads.push(device)
      a.pending.push(d)
      return d.promise
    }
    a.save = (device, layout) => {
      a.saves.push([device, layout])
    }
    if (remove) a.remove = (device) => void a.removes.push(device)
    return a
  }

  test('a synchronous adapter applies at once, through readLayout', () => {
    const grid = fakeGrid(4)
    const calls = []
    persistLayout(grid, { adapter: { load: (d) => (calls.push(d), [item('a'), item('b')]), save() {} } })
    assert.deepEqual(calls, ['desktop'])
    assert.deepEqual(ids(grid.layout), ['a', 'b'])
    assert.equal(grid.layout.device, 'desktop')
  })

  test('no key is needed with an adapter, and a bad adapter is a clear error', () => {
    assert.doesNotThrow(() => persistLayout(fakeGrid(), { adapter: fakeAdapter() }))
    assert.throws(() => persistLayout(fakeGrid(), { adapter: { load() {} } }), TypeError)
    assert.throws(() => persistLayout(fakeGrid(), { adapter: 'nope' }), TypeError)
  })

  test('a pending load shows the defaults, then the saved layout replaces them', async () => {
    const grid = fakeGrid(4)
    const adapter = fakeAdapter()
    persistLayout(grid, { adapter, defaults: [item('d')] })
    assert.deepEqual(ids(grid.layout), ['d'])
    adapter.pending[0].resolve(layoutOf(['saved']))
    await settle()
    assert.deepEqual(ids(grid.layout), ['saved'])
  })

  test('a load that finds nothing (null or undefined) leaves the defaults up', async () => {
    for (const nothing of [null, undefined]) {
      const grid = fakeGrid(4)
      const adapter = fakeAdapter()
      persistLayout(grid, { adapter, defaults: [item('d')] })
      const sets = grid.sets.length
      adapter.pending[0].resolve(nothing)
      await settle()
      assert.deepEqual(ids(grid.layout), ['d'])
      assert.equal(grid.sets.length, sets, 'the board is not drawn a second time')
    }
  })

  test('a pending load for a new device shows that device’s defaults, not the last device’s layout', async () => {
    const grid = fakeGrid(4)
    const adapter = fakeAdapter()
    persistLayout(grid, { adapter, defaults: { desktop: [item('dd')], phone: [item('pd')] } })
    adapter.pending[0].resolve(layoutOf(['mine']))
    await settle()
    assert.deepEqual(ids(grid.layout), ['mine'])
    grid.columns = 2
    fire(grid, 'ts-columns-change', { columns: 2, device: 'phone', initial: false })
    assert.deepEqual(adapter.loads, ['desktop', 'phone'])
    assert.deepEqual(ids(grid.layout), ['pd'])
  })

  test('results that arrive out of order: only the latest request is applied', async () => {
    const grid = fakeGrid(4)
    const adapter = fakeAdapter()
    persistLayout(grid, { adapter })
    grid.columns = 2
    fire(grid, 'ts-columns-change', { columns: 2, device: 'phone', initial: false })
    grid.columns = 4
    fire(grid, 'ts-columns-change', { columns: 4, device: 'desktop', initial: false })
    assert.deepEqual(adapter.loads, ['desktop', 'phone', 'desktop'])
    const [first, second, third] = adapter.pending
    // The newest answers first, then the older two straggle in.
    third.resolve(layoutOf(['third']))
    await settle()
    assert.deepEqual(ids(grid.layout), ['third'])
    first.resolve(layoutOf(['first']))
    second.resolve(layoutOf(['second'], 'phone'))
    await settle()
    assert.deepEqual(ids(grid.layout), ['third'])
  })

  test('the older load answering first is ignored too', async () => {
    const grid = fakeGrid(4)
    const adapter = fakeAdapter()
    persistLayout(grid, { adapter })
    grid.columns = 2
    fire(grid, 'ts-columns-change', { columns: 2, device: 'phone', initial: false })
    adapter.pending[0].resolve(layoutOf(['desk']))
    await settle()
    assert.equal(grid.sets.length, 0)
    adapter.pending[1].resolve(layoutOf(['ph'], 'phone'))
    await settle()
    assert.deepEqual(ids(grid.layout), ['ph'])
  })

  test('a load that resolves after reset() or dispose() is ignored', async () => {
    let grid = fakeGrid(4)
    let adapter = fakeAdapter()
    let handle = persistLayout(grid, { adapter, defaults: [item('d')] })
    handle.reset()
    adapter.pending[0].resolve(layoutOf(['late']))
    await settle()
    assert.deepEqual(ids(grid.layout), ['d'])

    grid = fakeGrid(4)
    adapter = fakeAdapter()
    handle = persistLayout(grid, { adapter })
    handle.dispose()
    adapter.pending[0].resolve(layoutOf(['late']))
    await settle()
    assert.equal(grid.sets.length, 0)
  })

  test('an edit while a load is pending wins: the late result is ignored', async () => {
    const grid = fakeGrid(4)
    const adapter = fakeAdapter()
    persistLayout(grid, { adapter, defaults: [item('d')] })
    const edited = layoutOf(['d', 'edit'])
    fire(grid, 'ts-layout-change', { layout: edited })
    adapter.pending[0].resolve(layoutOf(['server']))
    await settle()
    assert.deepEqual(ids(grid.layout), ['d'], 'the server layout did not replace the edit')
    assert.deepEqual(adapter.saves, [['desktop', edited]], 'the edit is what gets saved')
  })

  test('an edit on one device does not stale a load for the next', async () => {
    const grid = fakeGrid(4)
    const adapter = fakeAdapter()
    persistLayout(grid, { adapter })
    adapter.pending[0].resolve(null)
    await settle()
    fire(grid, 'ts-layout-change', { layout: layoutOf(['x']) })
    grid.columns = 2
    fire(grid, 'ts-columns-change', { columns: 2, device: 'phone', initial: false })
    adapter.pending[1].resolve(layoutOf(['p'], 'phone'))
    await settle()
    assert.deepEqual(ids(grid.layout), ['p'])
  })

  test('save is called with the device and layout on every event, in order, and never awaited', () => {
    const grid = fakeGrid(4)
    const saves = []
    persistLayout(grid, { adapter: { load: () => null, save: (d, l) => (saves.push([d, ids(l)]), new Promise(() => {})) } })
    fire(grid, 'ts-layout-change', { layout: layoutOf(['a']) })
    fire(grid, 'ts-layout-change', { layout: layoutOf(['a', 'b']) })
    grid.columns = 2
    fire(grid, 'ts-columns-change', { columns: 2, device: 'phone', initial: false })
    fire(grid, 'ts-layout-change', { layout: layoutOf(['p'], 'phone') })
    assert.deepEqual(saves, [['desktop', ['a']], ['desktop', ['a', 'b']], ['phone', ['p']]])
  })

  test('a rejected or throwing save is caught and warns once', async () => {
    const grid = fakeGrid(4)
    let n = 0
    const adapter = { load: () => null, save: () => (++n % 2 ? Promise.reject(new Error('503')) : (() => { throw new Error('offline') })()) }
    persistLayout(grid, { adapter })
    for (const name of ['a', 'b', 'c']) assert.doesNotThrow(() => fire(grid, 'ts-layout-change', { layout: layoutOf([name]) }))
    await settle()
    assert.equal(n, 3)
    assert.equal(warns.length, 1)
    // The synchronous throw is the first failure to be noticed; the rejection is the same warning, so it is not repeated.
    assert.match(warns[0], /^tickslate: persistLayout adapter save\(\) failed \(offline\)/)
  })

  test('a rejected or throwing load counts as nothing stored and warns once', async () => {
    let grid = fakeGrid(4)
    const adapter = fakeAdapter()
    persistLayout(grid, { adapter, defaults: [item('d')] })
    adapter.pending[0].reject(new Error('404'))
    await settle()
    assert.deepEqual(ids(grid.layout), ['d'])
    assert.equal(warns.length, 1)
    assert.match(warns[0], /^tickslate: persistLayout adapter load\(\) failed \(404\)/)

    grid = fakeGrid(4)
    persistLayout(grid, { adapter: { load: () => { throw new Error('boom') }, save() {} }, defaults: [item('d')] })
    assert.deepEqual(ids(grid.layout), ['d'])
    assert.equal(warns.length, 2)
  })

  test('a rejection never reaches the process as an unhandled rejection', async () => {
    const seen = []
    const onUnhandled = (e) => seen.push(e)
    process.on('unhandledRejection', onUnhandled)
    try {
      const grid = fakeGrid(4)
      persistLayout(grid, { adapter: { load: () => Promise.reject(new Error('x')), save: () => Promise.reject(new Error('y')), remove: () => Promise.reject(new Error('z')) } })
      fire(grid, 'ts-layout-change', { layout: layoutOf(['a']) })
      await settle()
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
    assert.deepEqual(seen, [])
  })

  test('the adapter wins over storage, and giving both warns once', () => {
    const grid = fakeGrid(4)
    const storage = fakeStorage({ 'k:desktop': stored(['from-storage']) })
    const saves = []
    persistLayout(grid, { key: 'k', storage, adapter: { load: () => [item('from-adapter')], save: (d, l) => saves.push(d) } })
    assert.deepEqual(ids(grid.layout), ['from-adapter'])
    fire(grid, 'ts-layout-change', { layout: layoutOf(['z']) })
    assert.deepEqual(saves, ['desktop'])
    assert.equal(storage.data['k:desktop'], stored(['from-storage']), 'storage was not written')
    assert.equal(warns.length, 1)
    assert.match(warns[0], /both an adapter and storage/)
  })

  test('reset() calls remove, applies the defaults, and tolerates an adapter without remove', async () => {
    const grid = fakeGrid(4)
    const adapter = fakeAdapter()
    const handle = persistLayout(grid, { adapter, defaults: [item('d')] })
    adapter.pending[0].resolve(layoutOf(['mine']))
    await settle()
    handle.reset()
    assert.deepEqual(adapter.removes, ['desktop'])
    assert.deepEqual(ids(grid.layout), ['d'])
    handle.reset('phone')
    assert.deepEqual(adapter.removes, ['desktop', 'phone'])

    const bare = fakeAdapter({ remove: false })
    const g2 = fakeGrid(4)
    const h2 = persistLayout(g2, { adapter: bare, defaults: [item('d')] })
    bare.pending[0].resolve(layoutOf(['mine']))
    await settle()
    assert.doesNotThrow(() => h2.reset())
    assert.deepEqual(ids(g2.layout), ['d'])
  })

  test('a rejected remove warns once and reset still applies the defaults', async () => {
    const grid = fakeGrid(4)
    const handle = persistLayout(grid, { adapter: { load: () => layoutOf(['mine']), save() {}, remove: () => Promise.reject(new Error('403')) }, defaults: [item('d')] })
    handle.reset()
    handle.reset()
    await settle()
    assert.deepEqual(ids(grid.layout), ['d'])
    assert.equal(warns.length, 1)
    assert.match(warns[0], /remove\(\) failed \(403\)/)
  })

  test('reset() of the other device leaves this device’s pending load alone', async () => {
    const grid = fakeGrid(4)
    const adapter = fakeAdapter()
    const handle = persistLayout(grid, { adapter, defaults: [item('d')] })
    handle.reset('phone')
    assert.deepEqual(adapter.removes, ['phone'])
    adapter.pending[0].resolve(layoutOf(['mine']))
    await settle()
    assert.deepEqual(ids(grid.layout), ['mine'])
  })

  test('a load that is not a layout counts as nothing stored, with one warning, and never blanks the board', async () => {
    for (const garbage of ['<html>502</html>', 42, true, { error: 'nope' }]) {
      resetWarnings()
      warns.length = 0
      for (const how of ['sync', 'async']) {
        const grid = fakeGrid(4)
        const load = how === 'sync' ? () => garbage : () => Promise.resolve(garbage)
        persistLayout(grid, { adapter: { load, save() {} }, defaults: [item('d')] })
        await settle()
        assert.deepEqual(ids(grid.layout), ['d'], `${how} ${JSON.stringify(garbage)}`)
      }
      assert.equal(warns.length, 2, 'one per attachment')
      assert.match(warns[0], /not a layout/)
    }
  })

  test('a saved empty layout, and an item array, still load', async () => {
    let grid = fakeGrid(4)
    persistLayout(grid, { adapter: { load: () => layoutOf([]), save() {} }, defaults: [item('d')] })
    assert.deepEqual(ids(grid.layout), [])
    grid = fakeGrid(4)
    persistLayout(grid, { adapter: { load: () => Promise.resolve([item('a')]), save() {} }, defaults: [item('d')] })
    await settle()
    assert.deepEqual(ids(grid.layout), ['a'])
    assert.equal(warns.length, 0)
  })

  test('a layout that cannot be applied warns once and is not an unhandled rejection', async () => {
    const seen = []
    const onUnhandled = (e) => seen.push(e)
    process.on('unhandledRejection', onUnhandled)
    try {
      const grid = new EventTarget()
      grid.columns = 4
      Object.defineProperty(grid, 'layout', { get: () => ({ profiles: {} }), set: () => { throw new Error('cannot draw') } })
      persistLayout(grid, { adapter: { load: () => Promise.resolve(layoutOf(['a'])), save() {} } })
      await settle()
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
    assert.deepEqual(seen, [])
    assert.equal(warns.length, 1)
    assert.match(warns[0], /could not apply .*cannot draw/)
  })

  test('defaults may be a function, asked each time they are needed, and the layout on show is never assigned back', () => {
    const grid = fakeGrid(2)
    let live = grid.layout
    persistLayout(grid, { key: 'k', storage: fakeStorage(), defaults: () => live })
    assert.equal(grid.sets.length, 0)
    live = readLayout([item('later')], { unknown: 'keep' }).layout
    grid.columns = 4
    fire(grid, 'ts-columns-change', { columns: 4, device: 'desktop', initial: false })
    assert.deepEqual(ids(grid.layout), ['later'])
  })

  test('the grid is flagged as saved while attached, and one grid wired twice says so', () => {
    const grid = fakeGrid(4)
    const one = persistLayout(grid, { key: 'a', storage: fakeStorage() })
    assert.ok(grid._persisted)
    assert.equal(warns.length, 0)
    const two = persistLayout(grid, { key: 'b', storage: fakeStorage() })
    assert.equal(warns.length, 1)
    assert.match(warns[0], /more than one persistLayout/)
    one.dispose()
    assert.ok(grid._persisted, 'the other attachment still counts')
    one.dispose()
    assert.ok(grid._persisted, 'disposing twice counts once')
    two.dispose()
    assert.ok(!grid._persisted)
  })

  test('without an adapter nothing changes: a promise-free path stays synchronous', () => {
    const grid = fakeGrid(4)
    persistLayout(grid, { key: 'k', storage: fakeStorage({ 'k:desktop': stored(['a']) }) })
    assert.deepEqual(ids(grid.layout), ['a'])
  })
})

// ── A layout the host sets after connecting (RFC 0004 §11.2), on a fake grid ──

// The grid announces host assignments through _watchLayout, as <ts-grid> does; the fake's own setter is the host's.
function watchedGrid(columns = 4) {
  const grid = fakeGrid(columns)
  const watchers = new Set()
  const descriptor = Object.getOwnPropertyDescriptor(grid, 'layout')
  Object.defineProperty(grid, 'layout', {
    configurable: true,
    get: descriptor.get,
    set: (v) => {
      descriptor.set(v)
      for (const fn of [...watchers]) fn()
    },
  })
  grid._watchLayout = (fn) => {
    watchers.add(fn)
    return () => watchers.delete(fn)
  }
  grid.watching = () => watchers.size
  return grid
}
const userEditOn = (grid, device, list) => {
  const layout = readLayout(list, { unknown: 'keep', device }).layout
  // The commit comes first so the assignment that puts it on screen is not mistaken for the host's.
  fire(grid, 'ts-layout-change', { layout })
  grid.layout = layout
}
const hostSets = (grid, list) => {
  grid.layout = readLayout(list, { unknown: 'keep', device: grid.columns === 2 ? 'phone' : 'desktop' }).layout
}

describe('the host sets the layout after persist', () => {
  for (const [device, columns] of [['desktop', 4], ['phone', 2]]) {
    describe(`on ${device}`, () => {
      const key = `k:${device}`
      const savedFor = (ids_) => stored(ids_, device)
      const userEdit = (grid, list) => {
        const layout = readLayout(list, { unknown: 'keep', device }).layout
        fire(grid, 'ts-layout-change', { layout })
      }

      test('is captured as the defaults, and reset() returns to it', () => {
        const grid = watchedGrid(columns)
        const storage = fakeStorage()
        const handle = persistLayout(grid, { key: 'k', storage })
        hostSets(grid, [item('h1'), item('h2')])
        assert.deepEqual(ids(grid.layout), ['h1', 'h2'])
        userEdit(grid, [item('mine')])
        grid.layout = readLayout([item('mine')], { unknown: 'keep', device }).layout
        handle.reset()
        assert.deepEqual(ids(grid.layout), ['h1', 'h2'])
        assert.equal(storage.data[key], undefined)
      })

      test('captures again each time, until the first edit', () => {
        const grid = watchedGrid(columns)
        const handle = persistLayout(grid, { key: 'k', storage: fakeStorage() })
        hostSets(grid, [item('one')])
        hostSets(grid, [item('two')])
        handle.reset()
        assert.deepEqual(ids(grid.layout), ['two'])
        userEdit(grid, [item('edited')])
        hostSets(grid, [item('three')])
        handle.reset()
        // The assignment after the edit was the host replacing the board by hand, not a new default.
        assert.deepEqual(ids(grid.layout), ['two'])
      })

      test('a saved layout still wins over it, and a later host layout does not beat the saved one', () => {
        const grid = watchedGrid(columns)
        const storage = fakeStorage({ [key]: savedFor(['saved']) })
        const handle = persistLayout(grid, { key: 'k', storage })
        assert.deepEqual(ids(grid.layout), ['saved'])
        hostSets(grid, [item('fetched')])
        assert.deepEqual(ids(grid.layout), ['saved'])
        // With the saved layout removed, what the host set last is shown.
        handle.reset()
        assert.deepEqual(ids(grid.layout), ['fetched'])
      })

      test('with nothing saved the host layout is what stays on screen, assigned once', () => {
        const grid = watchedGrid(columns)
        persistLayout(grid, { key: 'k', storage: fakeStorage() })
        grid.sets.length = 0
        hostSets(grid, [item('h')])
        assert.equal(grid.sets.length, 1, 'only the host assigned: persist did not write it back')
        assert.deepEqual(ids(grid.layout), ['h'])
      })

      test('the grid’s own writes are not captured', () => {
        const grid = watchedGrid(columns)
        const storage = fakeStorage({ [key]: savedFor(['saved']) })
        const handle = persistLayout(grid, { key: 'k', storage, defaults: [item('given')] })
        assert.deepEqual(ids(grid.layout), ['saved'])
        // The load assigned the saved layout; if that were captured, reset() would return to it.
        handle.reset()
        assert.deepEqual(ids(grid.layout), ['given'], 'the saved layout was not taken for the defaults')
        const hostGrid = watchedGrid(columns)
        const h2 = persistLayout(hostGrid, { key: 'k', storage: fakeStorage(), defaults: [item('given')] })
        hostSets(hostGrid, [item('fetched')])
        h2.reset()
        assert.deepEqual(ids(hostGrid.layout), ['fetched'])
        h2.reset()
        assert.deepEqual(ids(hostGrid.layout), ['fetched'], 'reset twice is the same')
      })

      test('disposing stops listening', () => {
        const grid = watchedGrid(columns)
        const handle = persistLayout(grid, { key: 'k', storage: fakeStorage() })
        assert.equal(grid.watching(), 1)
        handle.dispose()
        assert.equal(grid.watching(), 0)
      })
    })
  }

  test('the other device keeps its own capture and its own edits', () => {
    const grid = watchedGrid(4)
    const handle = persistLayout(grid, { key: 'k', storage: fakeStorage() })
    hostSets(grid, [item('desk')])
    grid.columns = 2
    fire(grid, 'ts-columns-change', { columns: 2, device: 'phone', initial: false })
    hostSets(grid, [item('ph')])
    handle.reset()
    assert.deepEqual(ids(grid.layout), ['ph'])
    grid.columns = 4
    fire(grid, 'ts-columns-change', { columns: 4, device: 'desktop', initial: false })
    assert.deepEqual(ids(grid.layout), ['desk'])
  })

  test('a layout set before the grid is measured counts as the first one', () => {
    const grid = watchedGrid(0)
    const handle = persistLayout(grid, { key: 'k', storage: fakeStorage() })
    hostSets(grid, [item('early')])
    grid.columns = 4
    fire(grid, 'ts-columns-change', { columns: 4, device: 'desktop', initial: true })
    // The user changes the board; reset() has to go back to the early layout, so it is only passing if that was captured.
    userEditOn(grid, 'desktop', [item('mine')])
    assert.deepEqual(ids(grid.layout), ['mine'])
    handle.reset()
    assert.deepEqual(ids(grid.layout), ['early'])
  })

  test('attached after the host layout, with no defaults, reset() returns to that layout', () => {
    const grid = watchedGrid(4)
    hostSets(grid, [item('host')])
    const handle = persistLayout(grid, { key: 'k', storage: fakeStorage() })
    userEditOn(grid, 'desktop', [item('mine')])
    handle.reset()
    assert.deepEqual(ids(grid.layout), ['host'])
    // An explicit defaults option still wins over what the grid showed.
    const given = watchedGrid(4)
    hostSets(given, [item('host')])
    const h2 = persistLayout(given, { key: 'k', storage: fakeStorage(), defaults: [item('given')] })
    assert.deepEqual(ids(given.layout), ['given'])
    h2.reset()
    assert.deepEqual(ids(given.layout), ['given'])
  })

  test('a saved layout shown at attach is not taken for the defaults of the other device', () => {
    const grid = watchedGrid(4)
    hostSets(grid, [item('host')])
    const storage = fakeStorage({ 'k:desktop': stored(['saved']) })
    persistLayout(grid, { key: 'k', storage })
    assert.deepEqual(ids(grid.layout), ['saved'])
    grid.columns = 2
    fire(grid, 'ts-columns-change', { columns: 2, device: 'phone', initial: false })
    assert.deepEqual(ids(grid.layout), ['saved'], 'nothing is defined for the phone, so the grid is left as it is')
  })

  test('an adapter’s pending load: the host layout is on screen meanwhile, and the late result still applies unless the user edited', async () => {
    const grid = watchedGrid(4)
    const loads = []
    const adapter = { load: () => new Promise((resolve) => loads.push(resolve)), save() {} }
    persistLayout(grid, { adapter })
    hostSets(grid, [item('host')])
    assert.deepEqual(ids(grid.layout), ['host'])
    // The load for that assignment is the one that counts; the first is stale.
    loads[0](layoutOf(['first']))
    await settle()
    assert.deepEqual(ids(grid.layout), ['host'])
    loads[1](layoutOf(['late']))
    await settle()
    assert.deepEqual(ids(grid.layout), ['late'])

    const edited = watchedGrid(4)
    const pending = []
    persistLayout(edited, { adapter: { load: () => new Promise((resolve) => pending.push(resolve)), save() {} } })
    hostSets(edited, [item('host')])
    fire(edited, 'ts-layout-change', { layout: readLayout([item('mine')], { unknown: 'keep' }).layout })
    pending[pending.length - 1](layoutOf(['late']))
    await settle()
    assert.deepEqual(ids(edited.layout), ['host'], 'the user edited, so the late result is ignored')
  })

  test('a grid without the hook still works, and only misses the later captures', () => {
    const grid = fakeGrid(4)
    const handle = persistLayout(grid, { key: 'k', storage: fakeStorage(), defaults: [item('given')] })
    assert.deepEqual(ids(grid.layout), ['given'])
    handle.reset()
    assert.deepEqual(ids(grid.layout), ['given'])
  })
})

// ── <ts-grid persist> and the unsaved-edits warning (RFC 0003 §4.1, §4.3) ───

// A DOM just big enough to construct a grid, connect it and let it commit an
// edit. It is a function so a child process can run the same source.
function makeDom(FakeElement, FakeDocument) {
  class Node {
    constructor() {
      this.attrs = new Map()
      this.kids = new Map()
      this.children = []
      this.style = {}
      this.dataset = {}
      this.classList = { toggle() {}, add() {}, remove() {}, contains: () => false }
      this.textContent = ''
    }
    setAttribute(k, v) { this.attrs.set(k, String(v)) }
    getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null }
    hasAttribute(k) { return this.attrs.has(k) }
    removeAttribute(k) { this.attrs.delete(k) }
    toggleAttribute(k, force) { if (force) this.attrs.set(k, ''); else this.attrs.delete(k); return Boolean(force) }
    addEventListener() {}
    appendChild(n) { this.children.push(n); return n }
    append(...n) { this.children.push(...n) }
    replaceChildren(...n) { this.children = n }
    querySelectorAll() { return [] }
    querySelector(sel) {
      if (!this.kids.has(sel)) this.kids.set(sel, new Node())
      return this.kids.get(sel)
    }
  }
  class Shadowed extends FakeElement {
    attachShadow() {
      this.shadowRoot = new Node()
      return this.shadowRoot
    }
  }
  const document = Object.assign(new FakeDocument(), {
    createElement: (tag) => Object.assign(new Node(), tag === 'template' ? { content: { cloneNode: () => new Node() } } : {}),
  })
  class Observer {
    constructor(callback) {
      this.callback = callback
    }
    observe() {}
    disconnect() {}
  }
  return { Shadowed, document, Observer }
}

// Wires the grid's browser-only parts to stand-ins, and returns a factory.
// `measure` stands in for _measure: the first call reports the device the way
// the real one does, and `_apply` for the layout being drawn.
// With `real`, the grid keeps its own _reconcile and _apply, so the children
// it is given (`g.children`) decide its implicit layout, as in a browser;
// only measuring, which needs real layout, is stood in for.
function gridFactory(Grid, readLayout, real = false) {
  return (attrs = {}, columns = 4) => {
    const g = new Grid()
    g.localName = 'ts-grid'
    g._columnsWanted = columns
    g.children = []
    g._syncControls = () => {}
    g._reschedule = () => {}
    if (!real) {
      g._reconcile = () => {}
      g._apply = function (value) {
        this._layout = readLayout(value, { unknown: 'keep' }).layout
      }
    }
    g._measure = function () {
      const columns = this._columnsWanted
      const initial = !this._columnsSeen
      this._columnsSeen = true
      this._columns = columns
      if (initial) this._emit('ts-columns-change', { columns, device: columns === 2 ? 'phone' : 'desktop', initial })
    }
    for (const [k, v] of Object.entries(attrs)) g.setAttribute(k, v)
    return g
  }
}

describe('<ts-grid persist>', () => {
  let Grid
  let make
  let warns
  const realStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  let storage

  before(async () => {
    const dom = makeDom(FakeElement, FakeDocument)
    globalThis.HTMLElement = dom.Shadowed
    globalThis.document = dom.document
    globalThis.ResizeObserver = dom.Observer
    globalThis.MutationObserver = dom.Observer
    globalThis.requestAnimationFrame = () => 0
    globalThis.cancelAnimationFrame = () => {}
    Grid = (await import('../src/elements/grid.js')).TsGrid
    make = gridFactory(Grid, readLayout)
  })
  after(() => {
    for (const name of ['HTMLElement', 'document', 'ResizeObserver', 'MutationObserver', 'requestAnimationFrame', 'cancelAnimationFrame']) delete globalThis[name]
  })
  beforeEach((t) => {
    resetWarnings()
    warns = []
    t.mock.method(console, 'warn', (m) => warns.push(m))
    storage = fakeStorage()
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true })
  })
  afterEach(() => {
    if (realStorage) Object.defineProperty(globalThis, 'localStorage', realStorage)
    else delete globalThis.localStorage
    globalThis.document.reset()
  })

  // What the user does: change the items, and let the grid report it as it does.
  // 'keep': the fake catalog is empty, and readLayout would drop every item it doesn't know.
  const read = (list) => readLayout(list, { unknown: 'keep' }).layout
  const edit = (g, list) => {
    g._layout = read(list)
    g._emit('ts-layout-change', { layout: g._layout, items: list, reason: 'move', id: list[0].id })
  }
  const seed = (g, list) => {
    g._layout = read(list)
  }
  const keys = () => Object.keys(storage.data).sort()
  const START = [item('a'), item('b')]

  test('persist="key" loads the saved layout on connect and saves edits per device', () => {
    storage.data['dash:desktop'] = stored(['saved'])
    const g = make({ persist: 'dash' })
    seed(g, START)
    g.connect()
    assert.deepEqual(ids(g.layout), ['saved'])
    edit(g, [item('x'), item('y')])
    assert.deepEqual(ids(JSON.parse(storage.data['dash:desktop'])), ['x', 'y'])
    assert.deepEqual(keys(), ['dash:desktop'])
  })

  test('on a phone-width grid it uses the phone entry', () => {
    storage.data['dash:phone'] = stored(['p'], 'phone')
    const g = make({ persist: 'dash' }, 2)
    seed(g, START)
    g.connect()
    assert.deepEqual(ids(g.layout), ['p'])
    edit(g, [item('q')])
    assert.deepEqual(keys(), ['dash:phone'])
  })

  test('nothing saved leaves the implicit layout alone, and it stays implicit', () => {
    const g = make({ persist: 'dash' })
    seed(g, START)
    const before = g.layout
    g.connect()
    assert.equal(g.layout, before)
    assert.equal(g._explicit, false)
  })

  test('the layout on show at connect is what a device with nothing saved falls back to', () => {
    storage.data['dash:desktop'] = stored(['saved'])
    const g = make({ persist: 'dash' })
    seed(g, START)
    g.connect()
    assert.deepEqual(ids(g.layout), ['saved'])
    // The phone has nothing saved, so it gets the defaults, not the desktop's saved layout.
    g._columnsWanted = 2
    g._emit('ts-columns-change', { columns: 2, device: 'phone', initial: false })
    assert.deepEqual(ids(g.layout), ['a', 'b'])
    // Which is also what reset() returns to.
    g._persistHandle.reset('desktop')
    g._emit('ts-columns-change', { columns: 4, device: 'desktop', initial: false })
    assert.deepEqual(ids(g.layout), ['a', 'b'])
  })

  test('an explicitly set layout is the defaults', () => {
    const g = make({ persist: 'dash' })
    g.layout = [item('mine')]
    g.connect()
    assert.deepEqual(ids(g.layout), ['mine'])
    edit(g, [item('moved')])
    g._persistHandle.reset()
    assert.deepEqual(ids(g.layout), ['mine'])
  })

  test('persist set before connect attaches at connect, not at upgrade', () => {
    const g = make({ persist: 'dash' })
    seed(g, START)
    assert.equal(g._persistHandle, null)
    assert.equal(g._persisted, undefined)
    g.connect()
    assert.ok(g._persisted)
  })

  test('disconnect disposes it, so a removed grid leaves no listeners and no saves', () => {
    const g = make({ persist: 'dash' })
    seed(g, START)
    g.connect()
    assert.ok(g._persisted)
    g.disconnect()
    assert.ok(!g._persisted)
    assert.equal(g._persistHandle, null)
    edit(g, [item('late')])
    assert.deepEqual(keys(), [])
  })

  test('reconnecting attaches again, and loads what was saved', () => {
    const g = make({ persist: 'dash' })
    seed(g, START)
    g.connect()
    edit(g, [item('x')])
    g.disconnect()
    g.connect()
    assert.deepEqual(ids(g.layout), ['x'])
    edit(g, [item('y')])
    assert.deepEqual(ids(JSON.parse(storage.data['dash:desktop'])), ['y'])
  })

  test('changing the attribute disposes the old attachment and attaches the new key', () => {
    const g = make({ persist: 'one' })
    seed(g, START)
    g.connect()
    edit(g, [item('x')])
    g.setAttribute('persist', 'two')
    assert.ok(g._persisted)
    edit(g, [item('y')])
    assert.deepEqual(keys(), ['one:desktop', 'two:desktop'])
    assert.deepEqual(ids(JSON.parse(storage.data['one:desktop'])), ['x'], 'the old key is no longer written')
    assert.deepEqual(ids(JSON.parse(storage.data['two:desktop'])), ['y'])
  })

  test('setting the same key again does not re-attach', () => {
    const g = make({ persist: 'one' })
    seed(g, START)
    g.connect()
    const handle = g._persistHandle
    g.setAttribute('persist', 'one')
    assert.equal(g._persistHandle, handle)
  })

  test('removing the attribute disposes, and adding it back attaches', () => {
    const g = make({ persist: 'one' })
    seed(g, START)
    g.connect()
    g.removeAttribute('persist')
    assert.ok(!g._persisted)
    assert.equal(g.persist, null)
    edit(g, [item('x')])
    assert.deepEqual(keys(), [])
    g.persist = 'one'
    assert.ok(g._persisted)
    edit(g, [item('y')])
    assert.deepEqual(keys(), ['one:desktop'])
  })

  test('the property reflects the attribute, and null removes it', () => {
    const g = make()
    assert.equal(g.persist, null)
    g.persist = 'k'
    assert.equal(g.getAttribute('persist'), 'k')
    g.persist = null
    assert.equal(g.hasAttribute('persist'), false)
    assert.ok(Grid.observedAttributes.includes('persist'))
  })

  test('persist="" is off, with one development warning', () => {
    const g = make({ persist: '' })
    seed(g, START)
    g.connect()
    assert.ok(!g._persisted)
    assert.equal(g._persistHandle, null)
    edit(g, [item('x')])
    assert.deepEqual(keys(), [])
    g.setAttribute('persist', '')
    const other = make({ persist: '' })
    other.connect()
    const empty = warns.filter((w) => /persist attribute is empty/.test(w))
    assert.equal(empty.length, 1)
    assert.match(empty[0], /^tickslate: <ts-grid> persist attribute is empty/)
  })

  test('persist="" after a key turns saving off', () => {
    const g = make({ persist: 'one' })
    seed(g, START)
    g.connect()
    g.setAttribute('persist', '')
    assert.ok(!g._persisted)
    assert.equal(g._persistHandle, null)
  })

  test('a persist property set before the element was defined becomes the attribute', () => {
    const g = make()
    Object.defineProperty(g, 'persist', { value: 'early', configurable: true, writable: true })
    seed(g, START)
    g.connect()
    assert.equal(g.getAttribute('persist'), 'early')
    assert.ok(g._persisted)
  })

  test('persistLayout with an adapter works on a grid, and the attribute can sit beside it with one warning', async () => {
    const g = make({ persist: 'dash' })
    seed(g, START)
    const saves = []
    const handle = persistLayout(g, { adapter: { load: () => null, save: (d) => saves.push(d) } })
    g.connect()
    assert.equal(warns.filter((w) => /more than one persistLayout/.test(w)).length, 1)
    edit(g, [item('x')])
    assert.deepEqual(saves, ['desktop'])
    assert.deepEqual(keys(), ['dash:desktop'])
    handle.dispose()
  })

  // ── A layout the host sets after connecting (RFC 0004 §11.2), on the real grid ──

  describe('a host layout after connect', () => {
    for (const [device, columns] of [['desktop', 4], ['phone', 2]]) {
      const hostLayout = (list) => readLayout(list, { unknown: 'keep', device }).layout
      const commits = (g) => {
        const events = []
        g.addEventListener('ts-layout-change', (e) => events.push(e.detail))
        return events
      }

      test(`${device}: persist, then layout: it is the defaults and reset() returns to it`, () => {
        const g = make({ persist: 'dash' }, columns)
        seed(g, START)
        g.connect()
        const events = commits(g)
        g.layout = hostLayout([item('h1'), item('h2')])
        assert.deepEqual(ids(g.layout), ['h1', 'h2'])
        assert.equal(events.length, 0, 'applying the host layout fires no ts-layout-change')
        edit(g, [item('mine')])
        g._persistHandle.reset()
        assert.deepEqual(ids(g.layout), ['h1', 'h2'])
        assert.equal(events.length, 1, 'only the user edit committed; reset() fired nothing')
      })

      test(`${device}: layout, then persist: the same`, () => {
        const g = make({}, columns)
        seed(g, START)
        g.connect()
        g.layout = hostLayout([item('h1'), item('h2')])
        g.setAttribute('persist', 'dash')
        edit(g, [item('mine')])
        g._persistHandle.reset()
        assert.deepEqual(ids(g.layout), ['h1', 'h2'])
      })

      test(`${device}: a saved layout still wins over a later host layout, and reset() shows the host's`, () => {
        storage.data[`dash:${device}`] = stored(['saved'], device)
        const g = make({ persist: 'dash' }, columns)
        seed(g, START)
        g.connect()
        g.layout = hostLayout([item('fetched')])
        assert.deepEqual(ids(g.layout), ['saved'])
        g._persistHandle.reset()
        assert.deepEqual(ids(g.layout), ['fetched'])
      })

      test(`${device}: after the first edit an assignment is not captured`, () => {
        const g = make({ persist: 'dash' }, columns)
        seed(g, START)
        g.connect()
        g.layout = hostLayout([item('first')])
        edit(g, [item('mine')])
        g.layout = hostLayout([item('later')])
        g._persistHandle.reset()
        assert.deepEqual(ids(g.layout), ['first'])
      })
    }

    test('the other device, with nothing saved, starts from the host layout too', () => {
      const g = make({ persist: 'dash' })
      seed(g, START)
      g.connect()
      g.layout = readLayout([item('host')], { unknown: 'keep' }).layout
      phone(g)
      assert.deepEqual(ids(g.layout), ['host'])
    })

    test('persistLayout’s own assignments never become the defaults the grid falls back to', () => {
      storage.data['dash:desktop'] = stored(['saved'])
      const g = make({ persist: 'dash' })
      seed(g, START)
      g.connect()
      assert.deepEqual(ids(g.layout), ['saved'])
      phone(g)
      assert.deepEqual(ids(g.layout), ['a', 'b'])
    })
  })

  // ── Implicit grids, with the grid's own _reconcile and _apply ─────────────

  // A child as the grid reads it: a tag, an item attribute and a style.
  const kid = (id, tag = 'ts-card') => {
    const attrs = new Map(id ? [['item', id]] : [])
    return {
      localName: tag,
      style: {},
      getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
      setAttribute: (k, v) => attrs.set(k, String(v)),
    }
  }
  // What the grid's MutationObserver does when the host adds or removes children.
  const childrenChanged = (g, ...list) => {
    g.children = list
    g._mutationObserver.callback([{ type: 'childList', target: g }])
  }
  const phone = (g) => {
    g._columnsWanted = 2
    g._emit('ts-columns-change', { columns: 2, device: 'phone', initial: false })
  }
  const desktop = (g) => {
    g._columnsWanted = 4
    g._emit('ts-columns-change', { columns: 4, device: 'desktop', initial: false })
  }

  describe('with the real reconcile', () => {
    let real
    before(() => {
      real = gridFactory(Grid, readLayout, true)
    })

    test('a grid that connected empty, got children later and then crossed the breakpoint still shows them', () => {
      const g = real({ persist: 'dash' })
      g.connect()
      assert.deepEqual(ids(g.layout), [])
      childrenChanged(g, kid('a'), kid('b'))
      assert.deepEqual(ids(g.layout), ['a', 'b'])
      phone(g)
      assert.deepEqual(ids(g.layout), ['a', 'b'])
      assert.equal(g._explicit, false, 'nothing was assigned, so it is still implicit')
      childrenChanged(g, kid('a'), kid('b'), kid('c'))
      desktop(g)
      assert.deepEqual(ids(g.layout), ['a', 'b', 'c'])
      assert.equal(g._explicit, false)
    })

    test('the same, with children that were there at connect and more that come later', () => {
      const g = real({ persist: 'dash' })
      g.children = [kid('a')]
      g.connect()
      childrenChanged(g, kid('a'), kid('late'))
      phone(g)
      assert.deepEqual(ids(g.layout), ['a', 'late'])
      assert.equal(g._explicit, false)
    })

    test('an edit on an implicit grid is kept across a device change with nothing saved', () => {
      const g = real({ persist: 'dash' })
      g.children = [kid('a'), kid('b')]
      g.connect()
      g._order = [...g.layout.profiles.market].reverse()
      g._commit('move', 'b')
      assert.deepEqual(ids(g.layout), ['b', 'a'])
      phone(g)
      assert.deepEqual(ids(g.layout), ['b', 'a'])
    })

    test('after a saved layout loads, a device with nothing saved gets the first defaults, not the saved layout', () => {
      storage.data['dash:desktop'] = stored(['a'])
      const g = real({ persist: 'dash' })
      g.children = [kid('a'), kid('b')]
      g.connect()
      assert.deepEqual(ids(g.layout), ['a'])
      assert.equal(g._explicit, true)
      phone(g)
      assert.deepEqual(ids(g.layout), ['a', 'b'])
    })

    test('a reconnect keeps the first defaults rather than taking the saved layout as them', () => {
      storage.data['dash:desktop'] = stored(['a'])
      const g = real({ persist: 'dash' })
      g.children = [kid('a'), kid('b')]
      g.connect()
      g.disconnect()
      g.connect()
      assert.deepEqual(ids(g.layout), ['a'])
      phone(g)
      assert.deepEqual(ids(g.layout), ['a', 'b'])
    })

    test('a re-key keeps the first defaults too', () => {
      storage.data['one:desktop'] = stored(['a'])
      const g = real({ persist: 'one' })
      g.children = [kid('a'), kid('b')]
      g.connect()
      g.setAttribute('persist', 'two')
      // Nothing is saved under the new key, so the first defaults come back, not the layout "one" loaded.
      phone(g)
      assert.deepEqual(ids(g.layout), ['a', 'b'])
    })
  })

  // ── The page clock (RFC 0004 §11.4) ───────────────────────────────────────

  describe('the page clock reaches a grid', () => {
    afterEach(() => configure({ clock: null }))
    const watch = (g) => {
      const calls = []
      g._reschedule = (...args) => calls.push(args)
      return calls
    }

    test('grid.clock is a function that follows configure({ clock }), and Date.now() without one', () => {
      const g = make()
      assert.equal(typeof g.clock, 'function')
      assert.ok(Math.abs(g.clock() - Date.now()) < 1000)
      configure({ clock: () => 42 })
      assert.equal(g.clock(), 42)
      assert.equal(typeof g.clock, 'function')
      configure({ clock: null })
      assert.ok(Math.abs(g.clock() - Date.now()) < 1000)
    })

    test('the grid’s own clock wins, and null gives the page clock back', () => {
      const g = make()
      configure({ clock: () => 42 })
      const calls = watch(g)
      g.clock = () => 7
      assert.equal(g.clock(), 7)
      assert.equal(calls.length, 1, 'setting it reschedules')
      g.clock = null
      assert.equal(g.clock(), 42)
      g.clock = 'nope'
      assert.equal(g.clock(), 42, 'only a function counts')
    })

    test('changing the page clock re-runs the schedule, quietly, unless the grid has its own clock', () => {
      const g = make()
      g.schedule = { calendar: {}, market: { sessions: [] } }
      g.connect()
      const calls = watch(g)
      configure({ clock: () => 1 })
      assert.deepEqual(calls, [[true, 'schedule', true]])
      g.clock = () => 2
      calls.length = 0
      configure({ clock: () => 3 })
      assert.deepEqual(calls, [], 'an element with its own clock is left alone')
    })

    test('a grid without a schedule has nothing to re-run', () => {
      const g = make()
      g.connect()
      const calls = watch(g)
      configure({ clock: () => 1 })
      assert.deepEqual(calls, [])
    })

    test('a disconnected grid stops listening', () => {
      const g = make()
      g.schedule = { calendar: {}, market: { sessions: [] } }
      g.connect()
      const calls = watch(g)
      g.disconnect()
      configure({ clock: () => 1 })
      assert.deepEqual(calls, [])
    })
  })

  // ── The "edits will be lost" warning ──────────────────────────────────────

  const LOST = 'tickslate: <ts-grid> edits will be lost on reload: add a persist attribute, or call persistLayout(). See docs/guide/saving-layouts.md'
  const lost = () => warns.filter((w) => w.includes('edits will be lost'))

  test('the first committed edit on an unsaved grid warns once, with the guide link', () => {
    const g = make()
    seed(g, START)
    g.connect()
    assert.deepEqual(lost(), [], 'connecting is not an edit')
    edit(g, [item('x')])
    assert.deepEqual(lost(), [LOST])
    edit(g, [item('y')])
    assert.equal(lost().length, 1)
  })

  test('each grid warns for itself', () => {
    for (let i = 0; i < 2; i++) {
      const g = make()
      seed(g, START)
      g.connect()
      edit(g, [item('x')])
    }
    assert.equal(lost().length, 2)
  })

  test('the real commit path warns', () => {
    const g = make()
    seed(g, START)
    g.connect()
    g._order = ['a', 'b']
    g._commit('move', 'a')
    assert.equal(lost().length, 1)
  })

  test('the persist attribute suppresses it', () => {
    const g = make({ persist: 'dash' })
    seed(g, START)
    g.connect()
    edit(g, [item('x')])
    assert.deepEqual(lost(), [])
  })

  test('persistLayout() suppresses it, with a key or an adapter, until it is disposed', () => {
    for (const options of [{ key: 'k', storage: fakeStorage() }, { adapter: { load: () => null, save() {} } }]) {
      const g = make()
      seed(g, START)
      g.connect()
      const handle = persistLayout(g, options)
      edit(g, [item('x')])
      assert.deepEqual(lost(), [])
      handle.dispose()
      edit(g, [item('y')])
      assert.equal(lost().length, 1)
      warns.length = 0
      resetWarnings()
    }
  })

  test('removing the persist attribute lets the next edit warn', () => {
    const g = make({ persist: 'dash' })
    seed(g, START)
    g.connect()
    g.removeAttribute('persist')
    edit(g, [item('x')])
    assert.equal(lost().length, 1)
  })

  test('a locked grid never warns', () => {
    const g = make({ locked: '' })
    seed(g, START)
    g.connect()
    edit(g, [item('x')])
    assert.deepEqual(lost(), [])
  })

  test('other events do not warn', () => {
    const g = make()
    seed(g, START)
    g.connect()
    g._emit('ts-edit-change', { editing: true })
    g._emit('ts-columns-change', { columns: 4, device: 'desktop', initial: false })
    assert.deepEqual(lost(), [])
  })
})

// ── Production ──────────────────────────────────────────────────────────────

describe('the production switch', () => {
  const source = (file) => readFileSync(new URL(`../src/elements/${file}`, import.meta.url), 'utf8')

  test('every warning call site in the grid and persistLayout is guarded by DEV, and neither calls console.warn', () => {
    for (const file of ['grid.js', 'persist.js']) {
      const lines = source(file).split('\n')
      lines.forEach((line, i) => {
        if (!/warnOnce\(/.test(line) || /^\s*(\*|\/\/)/.test(line)) return
        // Guarded means this line, or a block that encloses it, starts with `if (DEV)` or `DEV &&`.
        const indent = (l) => l.length - l.trimStart().length
        let guarded = /if \(DEV\)|DEV &&/.test(line)
        let at = indent(line)
        for (let j = i - 1; j >= 0 && !guarded && at > 0; j--) {
          if (!lines[j].trim() || indent(lines[j]) >= at) continue
          at = indent(lines[j])
          guarded = /if \(DEV\)|DEV &&/.test(lines[j])
        }
        assert.ok(guarded, `${file}:${i + 1} calls warnOnce outside if (DEV)`)
      })
      assert.doesNotMatch(lines.join('\n'), /console\.warn/, `${file} must not call console.warn directly`)
    }
  })

  test('the unsaved-edits string is only reachable through the guard', () => {
    const text = source('grid.js')
    assert.equal(text.match(/UNSAVED_WARNING/g).length, 2, 'declared once, used once')
    assert.match(text, /if \(DEV && name === 'ts-layout-change' && !this\._persisted[^\n]*\{\n[^\n]*\n\s*warnOnce\(`grid-unsaved:\$\{\+\+unsavedSerial\}`, UNSAVED_WARNING\)/)
  })

  test('with __TS_DEV__ false nothing warns, no flag is set, and behaviour is unchanged', () => {
    // A child process, because dev.js reads the switch once, when first loaded.
    const code = `
      import { FakeElement, FakeDocument } from ${JSON.stringify(new URL('./fake-dom.mjs', import.meta.url).href)}
      import { readLayout } from ${JSON.stringify(new URL('../src/core/index.js', import.meta.url).href)}
      globalThis.__TS_DEV__ = false
      const makeDom = ${makeDom.toString()}
      const gridFactory = ${gridFactory.toString()}
      const dom = makeDom(FakeElement, FakeDocument)
      Object.assign(globalThis, { HTMLElement: dom.Shadowed, document: dom.document, ResizeObserver: dom.Observer, MutationObserver: dom.Observer, requestAnimationFrame: () => 0, cancelAnimationFrame: () => {} })
      const { DEV } = await import(${JSON.stringify(new URL('../src/elements/dev.js', import.meta.url).href)})
      const { TsGrid } = await import(${JSON.stringify(new URL('../src/elements/grid.js', import.meta.url).href)})
      const { persistLayout } = await import(${JSON.stringify(new URL('../src/elements/persist.js', import.meta.url).href)})
      const calls = []
      console.warn = (m) => calls.push(m)
      const make = gridFactory(TsGrid, readLayout)
      const item = (id) => ({ id, type: 'today-pnl', size: 'S' })

      // An unsaved grid, an empty persist, a failing adapter, both adapter and storage.
      const plain = make()
      plain.connect()
      plain._layout = readLayout([item('x')]).layout
      plain._emit('ts-layout-change', { layout: plain._layout })
      const empty = make({ persist: '' })
      empty.connect()
      const failing = make()
      failing.connect()
      const store = new Map()
      persistLayout(failing, {
        key: 'k',
        storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) },
        adapter: { load: () => Promise.reject(new Error('x')), save: () => Promise.reject(new Error('y')) },
      })
      failing._emit('ts-layout-change', { layout: failing._layout })
      await new Promise((r) => setImmediate(r))

      // The attribute still works.
      const saved = make({ persist: 'dash' })
      saved.connect()
      saved._layout = readLayout([item('y')]).layout
      saved._emit('ts-layout-change', { layout: saved._layout })
      console.log(JSON.stringify({ DEV, calls, flag: failing._persisted ?? null, stored: [...store.keys()].length, unsavedFlag: plain._unsavedWarned ?? null }))
    `
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' })
    assert.equal(run.status, 0, run.stderr)
    const out = JSON.parse(run.stdout.trim().split('\n').pop())
    assert.equal(out.DEV, false)
    assert.deepEqual(out.calls, [])
    assert.equal(out.flag, null, 'persistLayout sets no flag in production')
    assert.equal(out.unsavedFlag, null)
  })
})
