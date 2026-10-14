import { test } from 'node:test'
import assert from 'node:assert/strict'
import { metrics, boxOf, boardHeight, cellAt, extentOf, mergeOrder, px, itemsFromChildren, specResolver, hostResizes, keepInPlace, visualOrder } from '../src/elements/grid-geometry.js'
import { WIDGETS, place, typeForTag } from '../src/core/index.js'
import { TsGrid } from '../src/elements/index.js'

const desktop = metrics(1264, 4, 150, 16)

test('metrics split the width into equal columns between gaps', () => {
  assert.equal(desktop.colWidth, 304)
  assert.equal(desktop.pitchX, 320)
  assert.equal(desktop.pitchY, 166)
})

test('a box spans its cells and the gaps between them', () => {
  assert.deepEqual(boxOf({ col: 1, row: 2, cols: 2, rows: 2 }, desktop), { x: 320, y: 332, w: 624, h: 316 })
  assert.deepEqual(boxOf({ col: 0, row: 0, cols: 1, rows: 1 }, desktop), { x: 0, y: 0, w: 304, h: 150 })
})

test('the board is as tall as its rows, with no trailing gap', () => {
  assert.equal(boardHeight(0, desktop), 0)
  assert.equal(boardHeight(1, desktop), 150)
  assert.equal(boardHeight(3, desktop), 482)
})

test('cellAt turns a tile position into fractional cells, kept on the grid', () => {
  assert.deepEqual(cellAt(480, 83, 1, desktop), { col: 1.5, row: 0.5 })
  assert.deepEqual(cellAt(-40, -10, 1, desktop), { col: 0, row: 0 })
  // A 2-column tile can't target the last column.
  assert.deepEqual(cellAt(5000, 0, 2, desktop), { col: 2, row: 0 })
})

test('extentOf turns a dragged box back into cells', () => {
  assert.deepEqual(extentOf(624, 316, desktop), { cols: 2, rows: 2 })
  assert.deepEqual(extentOf(10, 10, desktop), { cols: 1, rows: 1 })
  assert.equal(extentOf(9000, 150, desktop).cols, 4)
})

test('mergeOrder reorders visible items and leaves the rest in their slots', () => {
  const full = ['a', 'hidden', 'b', 'c'].map((id) => ({ id, size: 'S' }))
  const visible = ['c', 'a', 'b'].map((id) => ({ id, size: id === 'c' ? 'M' : 'S' }))
  assert.deepEqual(mergeOrder(full, visible).map((i) => `${i.id}:${i.size}`), ['c:M', 'hidden:S', 'a:S', 'b:S'])
})

test('px reads px lengths and falls back otherwise', () => {
  assert.equal(px(' 150px', 0), 150)
  assert.equal(px('', 16), 16)
  assert.equal(px('10rem', 16), 16)
})

test('the elements entry imports cleanly without a DOM', () => {
  assert.equal(typeof TsGrid, 'function')
})

// What the grid does for a tag: its type from the built-in catalog, else the tag itself.
const resolve = (tag) => {
  const type = typeForTag(WIDGETS, tag) ?? tag
  return { type, spec: Object.prototype.hasOwnProperty.call(WIDGETS, type) ? WIDGETS[type] : null }
}

test('itemsFromChildren types, sizes and ids two plain children', () => {
  const items = itemsFromChildren([{ tag: 'ts-today-pnl', declaredSize: 'Wide' }, { tag: 'ts-session-clock' }], resolve)
  assert.deepEqual(items, [{ id: 'todayPnl', size: 'Wide' }, { id: 'sessionClock', size: 'S' }])
})

test('itemsFromChildren takes the first supported size when none is declared or the declared one is bad', () => {
  const items = itemsFromChildren([{ tag: 'ts-equity-curve' }, { tag: 'ts-metric', declaredSize: 'huge' }], resolve)
  assert.deepEqual(items.map((i) => i.size), ['Wide', 'S'])
})

test('itemsFromChildren snaps a declared size the widget does not support', () => {
  assert.equal(itemsFromChildren([{ tag: 'ts-session-clock', declaredSize: 'L' }], resolve)[0].size, 'Banner')
})

test('itemsFromChildren numbers repeated types and skips ids already taken', () => {
  const items = itemsFromChildren([{ tag: 'ts-card' }, { tag: 'ts-card' }, { tag: 'ts-card', item: 'card-2' }, { tag: 'ts-card' }], resolve)
  // The explicit card-2 is claimed first, so the generated ones step around it.
  assert.deepEqual(items.map((i) => i.id), ['card', 'card-3', 'card-2', 'card-4'])
  assert.deepEqual(items.map((i) => i.type), [undefined, 'card', 'card', 'card'])
})

test('an explicit item that differs from its type carries the type', () => {
  assert.deepEqual(itemsFromChildren([{ tag: 'ts-chart', item: 'revenue', declaredSize: 'L' }], resolve), [{ id: 'revenue', type: 'chart', size: 'L' }])
})

test('a repeated explicit id gives the later child an id of its own', () => {
  const items = itemsFromChildren([{ tag: 'ts-card', item: 'a' }, { tag: 'ts-card', item: 'a' }], resolve)
  assert.deepEqual(items.map((i) => i.id), ['a', 'card'])
})

test('a tag no catalog knows is its own type and keeps a declared size', () => {
  assert.deepEqual(itemsFromChildren([{ tag: 'my-news', declaredSize: 'Tall' }, { tag: 'my-news' }], resolve), [
    { id: 'my-news', size: 'Tall' },
    { id: 'my-news-2', type: 'my-news', size: 'S' },
  ])
})

test('generated ids avoid ids the user removed', () => {
  const [item] = itemsFromChildren([{ tag: 'ts-card' }], resolve, new Set(['card']))
  assert.equal(item.id, 'card-2')
})

test('a child spec decides the size list over the catalog', () => {
  const items = itemsFromChildren([{ tag: 'ts-card', declaredSize: 'XL', spec: { label: '', sizes: ['S', 'Wide'] } }], resolve)
  assert.equal(items[0].size, 'Wide')
})

test('specResolver goes element, then host catalog, then the built-ins', () => {
  const own = { label: 'Own', sizes: ['S', 'Wide'] }
  const host = { news: { tag: 'my-news', label: 'News', sizes: ['Tall'] }, card: { tag: 'ts-card', label: 'Host card', sizes: ['M'] } }
  const spec = specResolver(new Map([['a', own]]), host, WIDGETS)
  assert.equal(spec({ id: 'a', type: 'card' }), own)
  assert.equal(spec({ id: 'b', type: 'card' }), host.card)
  assert.equal(spec({ id: 'news' }), host.news)
  assert.equal(spec({ id: 'metric' }), WIDGETS.metric)
  assert.equal(spec({ id: 'nothing' }), null)
  assert.equal(spec({ id: 'toString' }), null)
})

test('specResolver accepts a function catalog', () => {
  const spec = specResolver(new Map(), () => ({ label: 'F', sizes: ['M'] }), WIDGETS)
  assert.equal(spec({ id: 'x' }).label, 'F')
})

test('hostResizes picks only values that differ from what the grid wrote', () => {
  const found = hostResizes([
    { id: 'a', size: 'M', written: 'M' }, // the grid's own write
    { id: 'b', size: 'L', written: 'M' }, // the host asked for L
    { id: 'c', size: 'L', written: undefined }, // never written: a declared size, read elsewhere
    { id: 'd', size: 'giant', written: 'M' }, // not a size
    { id: 'e', size: null, written: 'M' },
  ])
  assert.deepEqual([...found], [['b', 'L']])
})

const at = (id, col, row, cols = 1, rows = 1) => ({ id, col, row, cols, rows })

test('visualOrder reads row by row, left to right, by each tile\'s top-left cell', () => {
  assert.deepEqual(visualOrder([at('d', 1, 1), at('b', 1, 0), at('c', 0, 1), at('a', 0, 0)]), ['a', 'b', 'c', 'd'])
  assert.deepEqual(visualOrder([]), [])
})

test('visualOrder sorts a tile that spans rows by where it starts', () => {
  // t is two rows tall at column 0; b sits beside its second row, c below both.
  assert.deepEqual(visualOrder([at('c', 0, 2), at('b', 1, 1), at('t', 0, 0, 1, 2), at('a', 1, 0)]), ['t', 'a', 'b', 'c'])
  // A wide tile starting left of its neighbour reads first, though it ends to its right.
  assert.deepEqual(visualOrder([at('r', 2, 0), at('w', 0, 0, 3, 1)]), ['w', 'r'])
})

test('visualOrder keeps input order for tiles that share a cell, and does not change its input', () => {
  const placements = [at('x', 0, 0), at('y', 0, 0), at('z', 0, 0)]
  assert.deepEqual(visualOrder(placements), ['x', 'y', 'z'])
  assert.deepEqual(placements.map((p) => p.id), ['x', 'y', 'z'])
})

test('visualOrder follows what place() makes of a rearranged layout, backfill included', () => {
  const card = (id, size) => ({ id, type: 'card', size })
  // A tall tile first, so a small tile later in the array backfills beside it.
  const items = [card('tall', 'Tall'), card('wide', 'Wide'), card('s1', 'S'), card('s2', 'S')]
  const order = (list, columns) => visualOrder(place(list, columns, WIDGETS).placements)
  const four = order(items, 4)
  assert.deepEqual([...four].sort(), ['s1', 's2', 'tall', 'wide'])
  assert.equal(four[0], 'tall')
  // Tile 'tall' moved from first to third: the read order moves with it.
  const moved = [items[1], items[2], items[0], items[3]]
  const after = order(moved, 4)
  assert.deepEqual(after.slice(0, 2), ['wide', 's1'])
  assert.notDeepEqual(after, order(items, 4))
})

// Apply the moves keepInPlace leaves, from the end, the way the grid does, and count them.
function reorder(current, wanted) {
  const keep = keepInPlace(current, wanted)
  const list = [...current]
  let moves = 0
  for (let i = wanted.length - 1; i >= 0; i--) {
    if (keep.has(wanted[i])) continue
    list.splice(list.indexOf(wanted[i]), 1)
    list.splice(i + 1 < wanted.length ? list.indexOf(wanted[i + 1]) : list.length, 0, wanted[i])
    moves++
  }
  return { list, moves }
}

test('keepInPlace moves one slot when the last goes first, and one when the first goes last', () => {
  assert.deepEqual(reorder(['a', 'b', 'c', 'd', 'e'], ['e', 'a', 'b', 'c', 'd']), { list: ['e', 'a', 'b', 'c', 'd'], moves: 1 })
  assert.deepEqual(reorder(['a', 'b', 'c', 'd', 'e'], ['b', 'c', 'd', 'e', 'a']), { list: ['b', 'c', 'd', 'e', 'a'], moves: 1 })
})

test('keepInPlace moves nothing for an unchanged order and all but one for a reversal', () => {
  assert.equal(keepInPlace(['a', 'b', 'c'], ['a', 'b', 'c']).size, 3)
  assert.deepEqual(reorder(['a', 'b', 'c', 'd'], ['d', 'c', 'b', 'a']), { list: ['d', 'c', 'b', 'a'], moves: 3 })
  assert.equal(keepInPlace([], []).size, 0)
})

test('keepInPlace reaches the wanted order for any shuffle, moving at most all but one', () => {
  let seed = 7
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
  for (let round = 0; round < 200; round++) {
    const current = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].slice(0, 1 + Math.floor(next() * 7))
    const wanted = [...current].sort(() => next() - 0.5)
    const { list, moves } = reorder(current, wanted)
    assert.deepEqual(list, wanted)
    assert.ok(moves <= Math.max(0, current.length - 1))
  }
})
