import { test } from 'node:test'
import assert from 'node:assert/strict'
import { metrics, boxOf, boardHeight, cellAt, extentOf, mergeOrder, px } from '../src/elements/grid-geometry.js'
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
