import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  WIDGETS,
  EN,
  DEFAULT_PROFILE,
  typeForTag,
  place,
  addItem,
  resizeItem,
  dropIndex,
  readLayout,
} from '../src/core/index.js'
import { specFor } from '../src/core/catalog.js'
import { placeFirst } from '../src/core/place.js'

describe('specFor', () => {
  test('an object catalog is looked up by own property', () => {
    assert.equal(specFor({ id: 'todayPnl' }, WIDGETS), WIDGETS.todayPnl)
    assert.equal(specFor({ id: 'a', type: 'watchlist' }, WIDGETS), WIDGETS.watchlist)
    assert.equal(specFor({ id: 'toString' }, WIDGETS), null)
    assert.equal(specFor({ id: 'x', type: '__proto__' }, WIDGETS), null)
  })

  test('a function catalog resolves each item, and undefined or null mean unknown', () => {
    const seen = []
    const fn = (item) => (seen.push(item.id), item.id === 'a' ? WIDGETS.card : item.id === 'b' ? undefined : null)
    assert.equal(specFor({ id: 'a' }, fn), WIDGETS.card)
    assert.equal(specFor({ id: 'b' }, fn), null)
    assert.equal(specFor({ id: 'c' }, fn), null)
    assert.deepEqual(seen, ['a', 'b', 'c'])
  })
})

describe('function catalogs in the core', () => {
  const sizesById = { one: ['S', 'Wide'], two: ['M', 'XL'] }
  const catalog = (item) => ({ tag: 'ts-card', label: 'Card', sizes: sizesById[item.id] })

  test('two cards of one type snap to different size lists', () => {
    const items = [
      { id: 'one', type: 'card', size: 'M' },
      { id: 'two', type: 'card', size: 'Wide' },
    ]
    const sized = readLayout(items, { catalog }).layout.profiles.market
    assert.deepEqual(sized.map((i) => i.size), ['Wide', 'M'])
    // The same two cards under the object catalog both keep what they asked for.
    assert.deepEqual(readLayout(items).layout.profiles.market.map((i) => i.size), ['M', 'Wide'])
  })

  test('place, placeFirst, addItem, resizeItem and dropIndex take a function', () => {
    const items = [{ id: 'one', type: 'card', size: 'S' }, { id: 'two', type: 'card', size: 'M' }]
    assert.equal(place(items, 4, catalog).placements.length, 2)
    assert.equal(placeFirst(items, 4, catalog, 1).placements.length, 1)
    const added = addItem([], { id: 'one', type: 'card', size: 'L' }, catalog)
    assert.notEqual(added[0].size, 'L')
    assert.ok(sizesById.one.includes(added[0].size))
    assert.equal(resizeItem(items, 'two', 'S', catalog).find((i) => i.id === 'two').size, 'M')
    assert.equal(typeof dropIndex(items, 'one', { col: 3, row: 0 }, 4, catalog), 'number')
  })
})

describe('DEFAULT_PROFILE and typeForTag', () => {
  test('the default profile is market', () => assert.equal(DEFAULT_PROFILE, 'market'))

  test('typeForTag finds the key whose spec has the tag', () => {
    assert.equal(typeForTag(WIDGETS, 'ts-today-pnl'), 'todayPnl')
    assert.equal(typeForTag(WIDGETS, 'ts-card'), 'card')
    assert.equal(typeForTag(WIDGETS, 'ts-nope'), null)
    assert.equal(typeForTag({ news: { tag: 'my-news', label: 'N', sizes: ['S'] } }, 'my-news'), 'news')
  })

  test('typeForTag checks own entries only and ignores function catalogs', () => {
    assert.equal(typeForTag(WIDGETS, 'toString'), null)
    assert.equal(typeForTag(WIDGETS, '__proto__'), null)
    assert.equal(typeForTag(() => WIDGETS.card, 'ts-card'), null)
    const inherited = Object.create({ x: { tag: 'ts-x' } })
    assert.equal(typeForTag(inherited, 'ts-x'), null)
  })

  test('typeForTag returns null for a missing catalog instead of throwing', () => {
    assert.equal(typeForTag(null, 'ts-card'), null)
    assert.equal(typeForTag(undefined, 'ts-card'), null)
  })
})

describe('the generic WIDGETS entries', () => {
  test('card, metric and chart', () => {
    // description and category are the picker's (RFC 0003 §18.1); the other fields are what each entry always had.
    const core = ({ tag, label, sizes }) => ({ tag, label, sizes })
    assert.deepEqual(core(WIDGETS.card), { tag: 'ts-card', label: 'Card', sizes: ['S', 'Wide', 'Tall', 'M', 'L', 'Banner', 'XL'] })
    assert.deepEqual(core(WIDGETS.metric), { tag: 'ts-metric', label: 'Metric', sizes: ['S', 'Wide', 'M'] })
    assert.deepEqual(core(WIDGETS.chart), { tag: 'ts-chart', label: 'Chart', sizes: ['Wide', 'M', 'L', 'XL'] })
    assert.ok(Object.isFrozen(WIDGETS.card) && Object.isFrozen(WIDGETS.card.sizes))
  })
})

describe('the picker metadata of the built-in entries (RFC 0003 §18.1)', () => {
  const CATEGORIES = ['General', 'Performance', 'Accounts', 'Markets']

  test('every entry has a description and one of the four categories', () => {
    for (const [key, spec] of Object.entries(WIDGETS)) {
      assert.equal(typeof spec.description, 'string', `${key} description`)
      assert.ok(spec.description.length > 0, `${key} description`)
      assert.ok(CATEGORIES.includes(spec.category), `${key}: ${spec.category}`)
    }
  })

  test('the messages the picker falls back to exist for every entry', () => {
    for (const [key, spec] of Object.entries(WIDGETS)) {
      assert.equal(EN[`widget.${key}.description`], spec.description, `widget.${key}.description`)
      assert.equal(typeof EN[`category.${spec.category}`], 'string', `category.${spec.category}`)
    }
  })
})
