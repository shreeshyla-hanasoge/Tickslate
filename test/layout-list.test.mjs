import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { WIDGETS, EN, createMessages } from '../src/core/index.js'
import { listRows, editRow, layoutState } from '../src/elements/layout-list.js'

// The layout list's row model and its edits (RFC 0003 §20). Both are pure or take the grid's public API,
// so a fake grid with the same move/resize/remove/undo and ts-layout-change stands in for the real one.
// The element itself, in a real engine, is test/browser/layout-list.spec.mjs.

const t = createMessages()
const items = () => [
  { id: 'sales', type: 'metric', size: 'Wide' },
  { id: 'notes', type: 'card', size: 'S' },
  { id: 'traffic', type: 'chart', size: 'M' },
]
const rows = (list = items(), extra) => listRows(list, WIDGETS, t, extra)

/** A grid that keeps a list and fires what the real one fires for each public edit. */
class FakeGrid extends EventTarget {
  constructor(list = items()) {
    super()
    this.items = list
    this.history = []
    this.calls = []
    this.profile = 'market'
  }
  // What the real grid exposes, so an edit can be checked by reading it back.
  get layout() {
    return { profiles: { market: this.items } }
  }
  _commit(reason, id, next) {
    this.history.push(this.items)
    this.items = next
    this.dispatchEvent(new CustomEvent('ts-layout-change', { detail: { reason, id, items: next }, bubbles: true, composed: true }))
  }
  move(id, to) {
    this.calls.push(['move', id, to])
    const at = this.items.findIndex((i) => i.id === id)
    if (at < 0) return false
    const next = this.items.filter((i) => i.id !== id)
    next.splice(Math.max(0, Math.min(to, next.length)), 0, this.items[at])
    this._commit('move', id, next)
    return true
  }
  resize(id, size) {
    this.calls.push(['resize', id, size])
    if (!this.items.some((i) => i.id === id)) return false
    this._commit('resize', id, this.items.map((i) => (i.id === id ? { ...i, size } : i)))
    return true
  }
  remove(id) {
    this.calls.push(['remove', id])
    if (!this.items.some((i) => i.id === id)) return false
    this._commit('remove', id, this.items.filter((i) => i.id !== id))
    return true
  }
  undo() {
    const prev = this.history.pop()
    if (!prev) return false
    this.items = prev
    this.dispatchEvent(new CustomEvent('ts-layout-change', { detail: { reason: 'undo', id: '', items: prev } }))
    return true
  }
}

describe('listRows', () => {
  test('is one row per item, in order, with the catalog label and the current size', () => {
    const r = rows()
    assert.deepEqual(r.map((x) => x.id), ['sales', 'notes', 'traffic'])
    assert.deepEqual(r.map((x) => x.label), ['Metric', 'Card', 'Chart'])
    assert.deepEqual(r.map((x) => x.size), ['Wide', 'S', 'M'])
  })

  test('the first row cannot move up and the last cannot move down', () => {
    const r = rows()
    assert.deepEqual(r.map((x) => x.canMoveUp), [false, true, true])
    assert.deepEqual(r.map((x) => x.canMoveDown), [true, true, false])
    // A single row is both ends.
    assert.deepEqual(rows([items()[0]]).map((x) => [x.canMoveUp, x.canMoveDown]), [[false, false]])
  })

  test('lists a button for each size the spec supports, in spec order, one pressed and named in full', () => {
    const [sales] = rows()
    assert.deepEqual(sales.sizes, [
      { size: 'S', name: 'Small, 1 by 1', pressed: false },
      { size: 'Wide', name: 'Wide, 2 by 1', pressed: true },
      { size: 'M', name: 'Medium, 2 by 2', pressed: false },
    ])
    const names = rows([{ id: 'c', type: 'card', size: 'M' }])[0].sizes.map((s) => s.name)
    assert.ok(names.includes('Medium, 2 by 2'))
    assert.equal(rows([{ id: 'c', type: 'card', size: 'M' }])[0].sizes.filter((s) => s.pressed).length, 1)
  })

  test('size names come from the messages, so a translation is spoken', () => {
    const de = createMessages({ 'size.M': 'Mittel', 'size.name': '{name}, {cols} mal {rows}' }, 'de')
    const [row] = listRows([{ id: 'c', type: 'card', size: 'M' }], WIDGETS, de)
    assert.equal(row.sizes.find((s) => s.size === 'M').name, 'Mittel, 2 mal 2')
  })

  test("a tile's own label wins, and a host's spec label is read as the grid reads it", () => {
    assert.equal(rows(items(), (item) => (item.id === 'sales' ? 'Revenue' : ''))[0].label, 'Revenue')
    assert.equal(rows(items(), () => '')[0].label, 'Metric')
    const own = { gauge: { tag: 'x-gauge', label: 'Gauge', sizes: ['S', 'M'] } }
    const [row] = listRows([{ id: 'g1', type: 'gauge', size: 'S' }], own, t)
    assert.equal(row.label, 'Gauge')
    assert.deepEqual(row.sizes.map((s) => s.size), ['S', 'M'])
  })

  test('a tile the catalog does not know has no size buttons and is named by its id, as the grid names it', () => {
    const [a, b] = listRows([{ id: 'x1', type: 'mystery', size: 'M' }, { id: 'toString', size: 'S' }], WIDGETS, t)
    assert.deepEqual(a.sizes, [])
    assert.equal(a.label, 'x1')
    assert.deepEqual(b.sizes, [])
    assert.equal(b.label, 'toString')
  })

  test('a function catalog resolves each item, as the core takes one', () => {
    const [row] = listRows([{ id: 'a', type: 'card', size: 'S' }], (item) => (item.id === 'a' ? { sizes: ['S', 'Wide'], label: 'Mine' } : null), t)
    assert.equal(row.label, 'Mine')
    assert.deepEqual(row.sizes.map((s) => s.size), ['S', 'Wide'])
  })

  test('nothing, or a bad list, is no rows', () => {
    assert.deepEqual(listRows([], WIDGETS, t), [])
    assert.deepEqual(listRows(undefined, WIDGETS, t), [])
    assert.deepEqual(listRows([null, { size: 'S' }], WIDGETS, t), [])
  })
})

describe('editRow, through the grid', () => {
  const labelled = (grid) => rows(grid.items, (item) => ({ sales: 'Revenue', notes: 'Notes', traffic: 'Traffic' })[item.id])
  const seen = (grid) => {
    const events = []
    grid.addEventListener('ts-layout-change', (e) => events.push(e.detail))
    return events
  }

  test('Move down calls grid.move one place on, fires ts-layout-change and says where the tile went', () => {
    const grid = new FakeGrid()
    const events = seen(grid)
    const text = editRow(grid, labelled(grid), 'down', 'sales', t)
    assert.deepEqual(grid.calls, [['move', 'sales', 1]])
    assert.equal(text, 'Revenue moved to position 2 of 3')
    assert.deepEqual(events.map((e) => [e.reason, e.id]), [['move', 'sales']])
    assert.deepEqual(grid.items.map((i) => i.id), ['notes', 'sales', 'traffic'])
  })

  test('Move up goes one place back', () => {
    const grid = new FakeGrid()
    assert.equal(editRow(grid, labelled(grid), 'up', 'traffic', t), 'Traffic moved to position 2 of 3')
    assert.deepEqual(grid.calls, [['move', 'traffic', 1]])
  })

  test('the ends do nothing: no call, no event, no words', () => {
    const grid = new FakeGrid()
    const events = seen(grid)
    assert.equal(editRow(grid, labelled(grid), 'up', 'sales', t), '')
    assert.equal(editRow(grid, labelled(grid), 'down', 'traffic', t), '')
    assert.deepEqual(grid.calls, [])
    assert.deepEqual(events, [])
  })

  test('a size button calls grid.resize and names the size in full; the size already set does nothing', () => {
    const grid = new FakeGrid()
    const events = seen(grid)
    assert.equal(editRow(grid, labelled(grid), 'size', 'notes', t, 'Wide'), 'Notes resized to Wide, 2 by 1')
    assert.deepEqual(grid.calls, [['resize', 'notes', 'Wide']])
    assert.equal(events[0].reason, 'resize')
    assert.equal(editRow(grid, labelled(grid), 'size', 'notes', t, 'Wide'), '')
    assert.equal(grid.calls.length, 1)
  })

  test('Remove calls grid.remove, and Undo then brings the tile back', () => {
    const grid = new FakeGrid()
    const events = seen(grid)
    assert.equal(editRow(grid, labelled(grid), 'remove', 'notes', t), 'Notes removed')
    assert.deepEqual(grid.items.map((i) => i.id), ['sales', 'traffic'])
    assert.equal(grid.undo(), true)
    assert.deepEqual(grid.items.map((i) => i.id), ['sales', 'notes', 'traffic'])
    assert.deepEqual(events.map((e) => e.reason), ['remove', 'undo'])
    assert.equal(grid.undo(), false)
  })

  test('an unknown id or action does nothing', () => {
    const grid = new FakeGrid()
    assert.equal(editRow(grid, labelled(grid), 'remove', 'nope', t), '')
    assert.equal(editRow(grid, labelled(grid), 'fly', 'sales', t), '')
    assert.deepEqual(grid.calls, [])
  })
})

describe('editRow does not announce an edit that did not happen', () => {
  // The real move() answers true for a tile that is already where it was asked to go, and a stale row can name a tile that is gone.
  const labelled = (grid) => rows(grid.items, () => '')

  test('a move that left the order as it was says nothing', () => {
    const grid = new FakeGrid()
    grid.move = (id, to) => {
      grid.calls.push(['move', id, to])
      return true
    }
    assert.equal(editRow(grid, labelled(grid), 'down', 'sales', t), '')
    assert.equal(grid.calls.length, 1)
  })

  test('a resize and a remove that changed nothing say nothing', () => {
    const grid = new FakeGrid()
    grid.resize = () => true
    grid.remove = () => true
    assert.equal(editRow(grid, labelled(grid), 'size', 'notes', t, 'Wide'), '')
    assert.equal(editRow(grid, labelled(grid), 'remove', 'notes', t), '')
  })

  test('a row the grid no longer has (stale rows) is not edited at all', () => {
    const grid = new FakeGrid()
    const stale = labelled(grid)
    grid.items = grid.items.filter((i) => i.id !== 'notes')
    assert.equal(editRow(grid, stale, 'remove', 'notes', t), '')
    assert.deepEqual(grid.items.map((i) => i.id), ['sales', 'traffic'])
  })

  test('a grid that exposes no layout is trusted on its return value', () => {
    const grid = new FakeGrid()
    Object.defineProperty(grid, 'layout', { value: undefined })
    assert.equal(layoutState(grid), null)
    assert.equal(editRow(grid, labelled(grid), 'remove', 'notes', t), 'Card removed')
  })

  test('layoutState reads the active profile as id and size, in order', () => {
    assert.equal(layoutState(new FakeGrid()), 'sales:Wide|notes:S|traffic:M')
    const grid = new FakeGrid()
    grid.profile = 'closed'
    assert.equal(layoutState(grid), null)
  })

  test('the position and total go through the formatter that is passed in', () => {
    const grid = new FakeGrid()
    const arabic = new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 0 })
    const text = editRow(grid, labelled(grid), 'down', 'sales', t, undefined, (n) => arabic.format(n))
    assert.equal(text, `Metric moved to position ${arabic.format(2)} of ${arabic.format(3)}`)
    assert.notEqual(arabic.format(2), '2')
  })
})

describe('the messages', () => {
  test('every list.* key the element reads exists in English', () => {
    for (const key of ['label', 'sizes', 'moveUp', 'moveUpItem', 'moveDown', 'moveDownItem', 'remove', 'removeItem', 'undo', 'undone', 'nothingToUndo', 'moved', 'resized', 'removed', 'empty', 'noGrid', 'locked']) {
      assert.ok(typeof EN[`list.${key}`] === 'string' && EN[`list.${key}`], `list.${key}`)
    }
    assert.equal(EN['list.undone'], 'Undone')
    assert.equal(EN['list.nothingToUndo'], 'Nothing to undo')
  })

  test('a row name that wraps a visible word keeps the word, so it can be said by voice (WCAG 2.5.3)', () => {
    assert.ok(t('list.moveUpItem', { label: 'Revenue' }).includes(t('list.moveUp')))
    assert.ok(t('list.moveDownItem', { label: 'Revenue' }).includes(t('list.moveDown')))
    assert.ok(t('list.removeItem', { label: 'Revenue' }).includes(t('list.remove')))
  })
})
