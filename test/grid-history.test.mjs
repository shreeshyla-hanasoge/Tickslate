import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHistory } from '../src/elements/grid-history.js'

const layout = (n) => ({ version: 1, profiles: { market: [{ id: `t${n}`, size: 'S' }] } })

test('undo pops in last-in first-out order', () => {
  const h = createHistory()
  const a = layout(1)
  const b = layout(2)
  h.push('market', a)
  h.push('market', b)
  assert.equal(h.undo('market'), b)
  assert.equal(h.undo('market'), a)
  assert.equal(h.undo('market'), null)
})

test('profiles keep separate stacks', () => {
  const h = createHistory()
  const a = layout(1)
  h.push('market', a)
  assert.equal(h.undo('closed'), null)
  assert.equal(h.undo('market'), a)
})

test('holds 20 entries per profile by default and drops the oldest', () => {
  const h = createHistory()
  for (let i = 0; i < 25; i++) h.push('market', layout(i))
  const got = []
  for (let l = h.undo('market'); l; l = h.undo('market')) got.push(l)
  assert.equal(got.length, 20)
  assert.equal(got[0].profiles.market[0].id, 't24')
  assert.equal(got[19].profiles.market[0].id, 't5')
})

test('the cap applies to each profile on its own', () => {
  const h = createHistory(2)
  for (let i = 0; i < 3; i++) {
    h.push('market', layout(i))
    h.push('closed', layout(i))
  }
  assert.equal(h.undo('market').profiles.market[0].id, 't2')
  assert.equal(h.undo('market').profiles.market[0].id, 't1')
  assert.equal(h.undo('market'), null)
  assert.equal(h.undo('closed').profiles.market[0].id, 't2')
})

test('clear forgets every profile', () => {
  const h = createHistory()
  h.push('market', layout(1))
  h.push('closed', layout(2))
  h.clear()
  assert.equal(h.undo('market'), null)
  assert.equal(h.undo('closed'), null)
})

test('a profile named like an Object.prototype member is an ordinary key', () => {
  const h = createHistory()
  assert.equal(h.undo('toString'), null)
  assert.equal(h.undo('__proto__'), null)
  const a = layout(1)
  h.push('__proto__', a)
  assert.equal(h.undo('__proto__'), a)
})
