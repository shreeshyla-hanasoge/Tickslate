import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { WIDGETS, EN, createMessages } from '../src/core/index.js'
import { pickerItems } from '../src/elements/picker-model.js'

// The picker's model (RFC 0003 §18.3) is a pure function, so none of this needs a DOM.

const t = createMessages()
const names = (groups) => groups.map((g) => g.category)
const labels = (groups) => groups.flatMap((g) => g.items.map((i) => i.label))
const pick = (extra = {}) => pickerItems({ hidden: [], catalog: WIDGETS, addTypes: '*', t, locale: 'en', ...extra })

describe('the built-in catalog', () => {
  test('every entry has a description and a category, equal to the English messages', () => {
    for (const [key, spec] of Object.entries(WIDGETS)) {
      assert.equal(spec.description, EN[`widget.${key}.description`], key)
      assert.ok(`category.${spec.category}` in EN, `${key}: ${spec.category}`)
      assert.ok(spec.description.length > 0 && !spec.description.includes('\n'), key)
    }
  })

  test('the categories are the four of RFC 0003 §18.1', () => {
    const by = (category) => Object.entries(WIDGETS).filter(([, s]) => s.category === category).map(([k]) => k).sort()
    assert.deepEqual(by('General'), ['card', 'chart', 'metric', 'table'])
    assert.deepEqual(by('Performance'), ['edgeStats', 'equityCurve', 'pnlCalendar', 'todayPnl'])
    assert.deepEqual(by('Accounts'), ['capitalFunding', 'openPositions'])
    assert.deepEqual(by('Markets'), ['miniChart', 'sessionClock', 'watchlist'])
  })
})

describe('pickerItems', () => {
  test('offers catalog types only for the types the host answers', () => {
    assert.deepEqual(pick({ addTypes: null }), [])
    assert.deepEqual(labels(pick({ addTypes: ['metric', 'card'] })), ['Card', 'Metric'])
    assert.equal(labels(pick({ addTypes: '*' })).length, Object.keys(WIDGETS).length)
    // A listed type the catalog does not know is not offered, and a type listed twice is offered once.
    assert.deepEqual(labels(pick({ addTypes: ['nope', 'card', 'card'] })), ['Card'])
  })

  test('an add item carries the type, its sentence and every supported size, in the spec order', () => {
    const [group] = pick({ addTypes: ['todayPnl'] })
    assert.deepEqual(group.items, [{
      kind: 'add',
      type: 'todayPnl',
      label: "Today's P&L",
      description: EN['widget.todayPnl.description'],
      category: 'Performance',
      sizes: ['S', 'Wide', 'M'],
    }])
  })

  test('groups are ordered by their translated category name, and items by label', () => {
    assert.deepEqual(names(pick()), ['Accounts', 'General', 'Markets', 'Performance'])
    const de = createMessages({ 'category.Accounts': 'Konten', 'category.General': 'Allgemein', 'category.Markets': 'Märkte', 'category.Performance': 'Leistung' }, 'de')
    assert.deepEqual(names(pick({ t: de, locale: 'de' })), ['Allgemein', 'Konten', 'Leistung', 'Märkte'])
    assert.deepEqual(pick().find((g) => g.category === 'Markets').items.map((i) => i.label), ['Mini chart', 'Session clock', 'Watchlist'])
  })

  test('hidden children are restores, listed first and under their type’s category', () => {
    const hidden = [{ id: 'sales', type: 'metric', label: 'Sales' }, { id: 'zeta', type: 'card', label: 'Zeta' }]
    const general = pick({ hidden, addTypes: ['card', 'metric'] }).find((g) => g.category === 'General')
    assert.deepEqual(general.items.map((i) => `${i.kind}:${i.label}`), ['restore:Sales', 'restore:Zeta', 'add:Card', 'add:Metric'])
    const sales = general.items[0]
    assert.deepEqual({ id: sales.id, type: sales.type, kind: sales.kind }, { id: 'sales', type: 'metric', kind: 'restore' })
    assert.equal(sales.description, EN['widget.metric.description'])
  })

  test('with no addTypes only the restores show, and with neither there is nothing', () => {
    const hidden = [{ id: 'sales', type: 'metric', label: 'Sales' }]
    assert.deepEqual(labels(pick({ hidden, addTypes: null })), ['Sales'])
    assert.deepEqual(pick({ hidden: [], addTypes: null }), [])
  })

  test('a type may be added again while another of it is hidden: two instances', () => {
    const hidden = [{ id: 'card-2', type: 'card', label: 'Card 2' }]
    const items = pick({ hidden, addTypes: ['card'] })[0].items
    assert.deepEqual(items.map((i) => [i.kind, i.label]), [['restore', 'Card 2'], ['add', 'Card']])
  })

  test('search matches the label and the description, ignoring case', () => {
    assert.deepEqual(labels(pick({ query: 'WATCH' })), ['Watchlist'])
    // "drawdown" is only in the equity curve's sentence.
    assert.deepEqual(labels(pick({ query: 'DrawDown' })), ['Equity curve'])
    assert.deepEqual(pick({ query: 'no such widget' }), [])
    assert.equal(labels(pick({ query: '   ' })).length, Object.keys(WIDGETS).length, 'a blank query is no query')
    assert.deepEqual(labels(pick({ query: '  mini ' })), ['Mini chart'])
  })

  test('search covers restores too, and matches in the locale', () => {
    const hidden = [{ id: 'x', type: 'metric', label: 'Signups' }]
    assert.deepEqual(labels(pick({ hidden, addTypes: null, query: 'sign' })), ['Signups'])
    assert.deepEqual(labels(pick({ hidden, addTypes: null, query: 'zzz' })), [])
    // Turkish: dotless ı and dotted İ fold to each other only under the locale's own rules.
    const catalog = { istanbul: { tag: 'x-i', label: 'İstanbul', sizes: ['S'], category: 'Yer' } }
    assert.deepEqual(labels(pick({ catalog, addTypes: '*', query: 'istanbul', locale: 'tr' })), ['İstanbul'])
  })

  test('a host’s own entry is offered with its words, and a missing category is General', () => {
    const catalog = {
      ...WIDGETS,
      news: { tag: 'my-news', label: 'News', sizes: ['Tall', 'M'], description: 'Headlines for your watchlist.', category: 'Research' },
      plain: { tag: 'my-plain', label: 'Plain', sizes: ['S'] },
    }
    const groups = pick({ catalog, addTypes: ['news', 'plain'] })
    assert.deepEqual(names(groups), ['General', 'Research'])
    const news = groups.find((g) => g.category === 'Research').items[0]
    assert.deepEqual([news.label, news.description, news.sizes], ['News', 'Headlines for your watchlist.', ['Tall', 'M']])
    const plain = groups.find((g) => g.category === 'General').items[0]
    assert.equal(plain.description, '', 'no sentence, and none invented')
  })

  test('text falls back to the messages, and a translation reaches the built-ins', () => {
    const fr = createMessages({
      'widget.card.label': 'Carte',
      'widget.card.description': 'Une carte titrée.',
      'category.General': 'Général',
    }, 'fr')
    const [group] = pick({ addTypes: ['card'], t: fr, locale: 'fr' })
    assert.equal(group.category, 'Général')
    assert.deepEqual([group.items[0].label, group.items[0].description], ['Carte', 'Une carte titrée.'])
    // A spec's own words that differ from the English default beat the message.
    const own = { card: { ...WIDGETS.card, label: 'My card', description: 'Mine.' } }
    const [g2] = pick({ catalog: own, addTypes: ['card'], t: fr, locale: 'fr' })
    assert.deepEqual([g2.items[0].label, g2.items[0].description], ['My card', 'Mine.'])
  })

  test('types and ids that look like Object.prototype members are unknown, not matches', () => {
    assert.deepEqual(pick({ addTypes: ['toString', '__proto__', 'constructor'] }), [])
    const hidden = [{ id: 'toString', type: 'toString', label: 'Odd' }]
    assert.deepEqual(labels(pick({ hidden, addTypes: null })), ['Odd'])
  })

  test('a spec with no sizes cannot be placed, so it is not offered', () => {
    const catalog = { empty: { tag: 'x-e', label: 'Empty', sizes: [] }, ok: { tag: 'x-o', label: 'Ok', sizes: ['S'] } }
    assert.deepEqual(labels(pick({ catalog, addTypes: '*' })), ['Ok'])
  })

  test('does not change its input, and returns fresh arrays', () => {
    const hidden = Object.freeze([Object.freeze({ id: 'a', type: 'card', label: 'A' })])
    const first = pick({ hidden, addTypes: ['card'] })
    first[0].items[1].sizes.push('XL')
    assert.deepEqual(pick({ hidden, addTypes: ['card'] })[0].items[1].sizes, ['S', 'Wide', 'Tall', 'M', 'L', 'Banner', 'XL'])
    assert.equal(WIDGETS.card.sizes.length, 7)
  })
})
