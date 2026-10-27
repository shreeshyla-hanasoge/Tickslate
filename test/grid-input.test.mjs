import { test } from 'node:test'
import assert from 'node:assert/strict'
import { keyAction, tapAction } from '../src/elements/grid-input.js'

const free = { held: null }
const holding = { held: 'a' }

test('keys while nothing is held: pick up, resize, remove', () => {
  for (const key of [' ', 'Enter']) assert.deepEqual(keyAction(key, 'b', free), { type: 'pickUp', id: 'b' })
  for (const key of ['+', '=']) assert.deepEqual(keyAction(key, 'b', free), { type: 'resizeStep', id: 'b', dir: 1 })
  for (const key of ['-', '_']) assert.deepEqual(keyAction(key, 'b', free), { type: 'resizeStep', id: 'b', dir: -1 })
  for (const key of ['Delete', 'Backspace']) assert.deepEqual(keyAction(key, 'b', free), { type: 'remove', id: 'b' })
})

test('keys while nothing is held: arrows and Escape do nothing', () => {
  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Escape', 'Tab', 'a']) {
    assert.equal(keyAction(key, 'b', free), null, key)
  }
})

test('keys while holding: arrows move, Space and Enter drop, Escape cancels', () => {
  assert.deepEqual(keyAction('ArrowLeft', 'a', holding), { type: 'moveBy', id: 'a', dCol: -1, dRow: 0 })
  assert.deepEqual(keyAction('ArrowRight', 'a', holding), { type: 'moveBy', id: 'a', dCol: 1, dRow: 0 })
  assert.deepEqual(keyAction('ArrowUp', 'a', holding), { type: 'moveBy', id: 'a', dCol: 0, dRow: -1 })
  assert.deepEqual(keyAction('ArrowDown', 'a', holding), { type: 'moveBy', id: 'a', dCol: 0, dRow: 1 })
  for (const key of [' ', 'Enter']) assert.deepEqual(keyAction(key, 'a', holding), { type: 'drop', id: 'a' })
  assert.deepEqual(keyAction('Escape', 'a', holding), { type: 'cancel', id: 'a' })
})

test('P toggles the pin on the focused tile, and on the held one', () => {
  for (const key of ['p', 'P']) {
    assert.deepEqual(keyAction(key, 'b', free), { type: 'togglePin', id: 'b' })
    assert.deepEqual(keyAction(key, 'b', holding), { type: 'togglePin', id: 'a' })
  }
  assert.equal(keyAction('p', '', free), null)
})

test('keys while holding: resize and remove are off, and the held tile is the subject', () => {
  for (const key of ['+', '-', 'Delete', 'Backspace', 'x']) assert.equal(keyAction(key, 'a', holding), null, key)
  // Focus has moved to another handle; the keys still act on the held tile.
  assert.deepEqual(keyAction('ArrowDown', 'b', holding), { type: 'moveBy', id: 'a', dCol: 0, dRow: 1 })
  assert.deepEqual(keyAction(' ', 'b', holding), { type: 'drop', id: 'a' })
})

test('no focused tile and nothing held gives no action', () => {
  assert.equal(keyAction(' ', '', free), null)
  assert.equal(keyAction('Delete', '', free), null)
  assert.deepEqual(keyAction(' ', 'a', undefined), { type: 'pickUp', id: 'a' })
})

test('tap while nothing is held picks the tile up', () => {
  assert.deepEqual(tapAction('b', free), { type: 'pickUp', id: 'b' })
  assert.equal(tapAction(null, free), null)
})

test('tap while holding: the held tile drops, another is the destination, empty board cancels', () => {
  assert.deepEqual(tapAction('a', holding), { type: 'drop', id: 'a' })
  assert.deepEqual(tapAction('c', holding), { type: 'placeAt', id: 'a', targetId: 'c' })
  assert.deepEqual(tapAction(null, holding), { type: 'cancel', id: 'a' })
})

test('actions are plain data: no function or DOM reference in them', () => {
  const actions = [keyAction(' ', 'a', free), keyAction('ArrowUp', 'a', holding), tapAction('c', holding)]
  assert.deepEqual(JSON.parse(JSON.stringify(actions)), actions)
})
