import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readsOf } from './ops.mjs'
import {
  SIZES,
  SIZE_NAMES,
  WIDGETS,
  columnsFor,
  deviceFor,
  footprint,
  snapSize,
  place,
  readLayout,
  emptyLayout,
  addItem,
  removeItem,
  moveItem,
  resizeItem,
  stepSize,
  sizeForExtent,
  dropIndex,
  withProfile,
  setTopStrip,
} from '../src/core/index.js'

// Positions as [id, col, row] so expectations read like a picture of the grid.
const at = (result) => result.placements.map((p) => [p.id, p.col, p.row])
const s = (id, size, type) => (type ? { id, size, type } : { id, size })

describe('breakpoints', () => {
  test('columns follow the 1200 and 700 px thresholds', () => {
    assert.equal(columnsFor(1440), 4)
    assert.equal(columnsFor(1200), 4)
    assert.equal(columnsFor(1199), 3)
    assert.equal(columnsFor(700), 3)
    assert.equal(columnsFor(699), 2)
    assert.equal(columnsFor(0), 2)
    assert.equal(columnsFor(Infinity), 4)
  })

  test('a missing or NaN width falls to the phone grid', () => {
    assert.equal(columnsFor(NaN), 2)
    assert.equal(columnsFor(undefined), 2)
  })

  test('tablets use the desktop layout', () => {
    assert.equal(deviceFor(900), 'desktop')
    assert.equal(deviceFor(390), 'phone')
  })
})

describe('footprint', () => {
  test('four columns render every size as designed', () => {
    for (const name of SIZE_NAMES) {
      assert.deepEqual(footprint(name, 4, [name]), { ...SIZES[name], variant: name })
    }
  })

  test('three columns cap the width at 3 and keep the design', () => {
    assert.deepEqual(footprint('XL', 3, ['XL']), { cols: 3, rows: 2, variant: 'XL' })
    assert.deepEqual(footprint('Banner', 3, ['Banner']), { cols: 3, rows: 1, variant: 'Banner' })
    assert.deepEqual(footprint('M', 3, ['M']), { cols: 2, rows: 2, variant: 'M' })
  })

  test('phones keep S and Tall at half width', () => {
    assert.deepEqual(footprint('S', 2, WIDGETS.watchlist.sizes), { cols: 1, rows: 1, variant: 'S' })
    assert.deepEqual(footprint('Tall', 2, WIDGETS.watchlist.sizes), { cols: 1, rows: 2, variant: 'Tall' })
  })

  test('phones run Wide and M full width', () => {
    assert.deepEqual(footprint('Wide', 2, WIDGETS.todayPnl.sizes), { cols: 2, rows: 1, variant: 'Wide' })
    assert.deepEqual(footprint('M', 2, WIDGETS.todayPnl.sizes), { cols: 2, rows: 2, variant: 'M' })
  })

  test('phones swap L and XL for M when the widget has one', () => {
    assert.deepEqual(footprint('L', 2, WIDGETS.openPositions.sizes), { cols: 2, rows: 2, variant: 'M' })
    assert.deepEqual(footprint('XL', 2, WIDGETS.miniChart.sizes), { cols: 2, rows: 2, variant: 'M' })
  })

  test('Banner stays full width with its own design at every width', () => {
    const cal = WIDGETS.pnlCalendar
    assert.deepEqual(footprint('Banner', 4, cal.sizes, cal.phoneRows), { cols: 4, rows: 1, variant: 'Banner' })
    assert.deepEqual(footprint('Banner', 3, cal.sizes, cal.phoneRows), { cols: 3, rows: 1, variant: 'Banner' })
    // The year heat map wraps into two half-year bands on a phone.
    assert.deepEqual(footprint('Banner', 2, cal.sizes, cal.phoneRows), { cols: 2, rows: 2, variant: 'Banner' })
    // Without phoneRows it keeps one row, as the session clock does.
    assert.deepEqual(footprint('Banner', 2, WIDGETS.sessionClock.sizes), { cols: 2, rows: 1, variant: 'Banner' })
    assert.deepEqual(footprint('Banner', 2, cal.sizes, { Banner: 0 }), { cols: 2, rows: 1, variant: 'Banner' })
  })

  test('phones keep the design, full width, when there is no M', () => {
    assert.deepEqual(footprint('L', 2, WIDGETS.capitalFunding.sizes), { cols: 2, rows: 2, variant: 'L' })
    assert.deepEqual(footprint('Banner', 2, WIDGETS.sessionClock.sizes), { cols: 2, rows: 1, variant: 'Banner' })
  })

  test('an unsupported size snaps before reflowing', () => {
    assert.deepEqual(footprint('XL', 4, WIDGETS.todayPnl.sizes), { cols: 2, rows: 2, variant: 'M' })
  })

  test('a tile with no catalog entry supports the size it was given', () => {
    assert.deepEqual(footprint('Tall', 4, null), { cols: 1, rows: 2, variant: 'Tall' })
  })

  test('columns other than 2, 3 or 4 are a programming error', () => {
    assert.throws(() => footprint('S', 5, ['S']), RangeError)
    assert.throws(() => place([], 1), RangeError)
  })
})

describe('snapSize', () => {
  test('keeps a supported size', () => {
    assert.equal(snapSize('Tall', WIDGETS.watchlist.sizes), 'Tall')
  })

  test('moves to the nearest supported size', () => {
    assert.equal(snapSize('L', ['S', 'Tall', 'M']), 'M')
    assert.equal(snapSize('XL', WIDGETS.todayPnl.sizes), 'M')
  })

  test('breaks a tie towards the smaller size', () => {
    // Banner (4×1) is 3 steps from both S (1×1) and M (2×2).
    assert.equal(snapSize('Banner', ['S', 'Tall', 'M']), 'S')
  })

  test('treats an unknown name as the smallest size', () => {
    assert.equal(snapSize('huge', WIDGETS.pnlCalendar.sizes), 'Tall')
  })

  test('does not depend on the order sizes are listed in', () => {
    assert.equal(snapSize('Banner', ['M', 'Tall', 'S']), 'S')
  })
})

describe('place', () => {
  test('fills rows left to right, top to bottom', () => {
    const result = place([s('a', 'Wide'), s('b', 'S'), s('c', 'S'), s('d', 'M'), s('e', 'Tall'), s('f', 'Tall')], 4, {})
    assert.deepEqual(at(result), [['a', 0, 0], ['b', 2, 0], ['c', 3, 0], ['d', 0, 1], ['e', 2, 1], ['f', 3, 1]])
    assert.equal(result.rows, 3)
  })

  test('backfills a gap with a later, smaller tile', () => {
    // b cannot fit beside a, so it drops a row; c goes back up into the gap.
    const result = place([s('a', 'S'), s('b', 'XL'), s('c', 'S')], 4, {})
    assert.deepEqual(at(result), [['a', 0, 0], ['b', 0, 1], ['c', 1, 0]])
    assert.equal(result.rows, 3)
  })

  test('puts a tile in the first spot it fits, even below the first row', () => {
    const result = place([s('a', 'Tall'), s('b', 'Wide'), s('c', 'Wide'), s('d', 'S')], 4, {})
    assert.deepEqual(at(result), [['a', 0, 0], ['b', 1, 0], ['c', 1, 1], ['d', 3, 0]])
  })

  test('closes the gap when a tile is removed', () => {
    const items = [s('a', 'Wide'), s('b', 'Wide'), s('c', 'Wide')]
    assert.deepEqual(at(place(removeItem(items, 'a'), 4, {})), [['b', 0, 0], ['c', 2, 0]])
  })

  test('reflows the market layout onto a phone', () => {
    const items = [
      s('todayPnl', 'Wide'),
      s('sessionClock', 'S'),
      s('capitalFunding', 'Tall'),
      s('watchlist', 'Tall'),
      s('openPositions', 'L'),
    ]
    const result = place(items, 2)
    assert.deepEqual(at(result), [
      ['todayPnl', 0, 0],
      ['sessionClock', 0, 1],
      ['capitalFunding', 1, 1],
      ['watchlist', 0, 2],
      ['openPositions', 0, 4],
    ])
    assert.equal(result.placements[4].variant, 'M')
    assert.equal(result.rows, 6)
  })

  test('caps XL at three columns on a tablet', () => {
    const result = place([s('chart', 'XL', 'miniChart'), s('watchlist', 'S')], 3)
    assert.deepEqual(result.placements[0], { id: 'chart', col: 0, row: 0, cols: 3, rows: 2, variant: 'XL' })
    assert.deepEqual(at(result)[1], ['watchlist', 0, 2])
  })

  test('uses the catalog for the variant and the item type when given', () => {
    const result = place([s('c1', 'XL', 'miniChart'), s('c2', 'XL', 'miniChart')], 2)
    assert.deepEqual(result.placements.map((p) => p.variant), ['M', 'M'])
  })

  test('an empty profile has no rows', () => {
    assert.deepEqual(place([], 4), { placements: [], rows: 0 })
  })

  test('matches a cell-by-cell reference on random layouts', () => {
    const random = prng(7)
    for (let run = 0; run < 300; run++) {
      const columns = [2, 3, 4][run % 3]
      const count = 1 + Math.floor(random() * 24)
      const items = Array.from({ length: count }, (_, i) => s(`t${i}`, SIZE_NAMES[Math.floor(random() * SIZE_NAMES.length)]))
      assert.deepEqual(place(items, columns, {}), referencePlace(items, columns), `run ${run}`)
    }
  })
})

describe('readLayout', () => {
  const brief = {
    version: 1,
    device: 'desktop',
    profiles: { market: [s('todayPnl', 'Wide'), s('sessionClock', 'S')], closed: [] },
    topStrip: ['todayPnl', 'sessionClock'],
  }

  test("reads the brief's example with no issues", () => {
    const { layout, issues } = readLayout(brief)
    assert.deepEqual(issues, [])
    assert.deepEqual(layout, brief)
  })

  test('copies rather than sharing the input', () => {
    const input = structuredClone(brief)
    const { layout } = readLayout(input)
    assert.notEqual(layout.profiles.market, input.profiles.market)
    assert.notEqual(layout.profiles.market[0], input.profiles.market[0])
    assert.deepEqual(input, brief)
  })

  test('its output reads back unchanged', () => {
    const { layout } = readLayout({ profiles: { market: [s('x', 'S'), s('todayPnl', 'XL')] }, topStrip: 'no' })
    const again = readLayout(JSON.parse(JSON.stringify(layout)))
    assert.deepEqual(again.issues, [])
    assert.deepEqual(again.layout, layout)
  })

  test('replaces input that is not an object with an empty layout', () => {
    for (const input of [null, undefined, 'layout', 42]) {
      const { layout, issues } = readLayout(input, { device: 'phone' })
      assert.deepEqual(layout, emptyLayout('phone'))
      assert.deepEqual(issues.map((i) => i.code), ['bad-shape'])
    }
  })

  test('reads a layout with no version or an unknown one as version 1', () => {
    const { layout, issues } = readLayout({ ...brief, version: undefined })
    assert.equal(layout.version, 1)
    assert.deepEqual(issues.map((i) => [i.code, i.fixed]), [['unknown-version', 'migrated']])
    assert.equal(readLayout({ ...brief, version: 2 }).issues[0].code, 'unknown-version')
  })

  test('falls back to the given device', () => {
    const { layout, issues } = readLayout({ ...brief, device: 'tv' }, { device: 'phone' })
    assert.equal(layout.device, 'phone')
    assert.deepEqual(issues.map((i) => i.path), ['device'])
  })

  test('always has the built-in profiles and keeps others', () => {
    const { layout } = readLayout({ version: 1, device: 'desktop', profiles: { weekend: [s('watchlist', 'M')] } })
    assert.deepEqual(Object.keys(layout.profiles), ['weekend', 'market', 'closed'])
  })

  test('drops unknown widgets and duplicate ids', () => {
    const { layout, issues } = readLayout({
      ...brief,
      profiles: { market: [s('todayPnl', 'S'), s('lossLimit', 'S'), s('todayPnl', 'Wide')], closed: [s('todayPnl', 'M')] },
      topStrip: [],
    })
    assert.deepEqual(layout.profiles.market, [s('todayPnl', 'S')])
    assert.deepEqual(layout.profiles.closed, [s('todayPnl', 'M')], 'the same tile may appear in two profiles')
    assert.deepEqual(issues.map((i) => [i.path, i.code, i.fixed]), [
      ['profiles.market[1]', 'unknown-widget', 'dropped'],
      ['profiles.market[2]', 'duplicate-id', 'dropped'],
    ])
    assert.equal(issues[0].message, 'No widget called "lossLimit" is in the catalog.')
  })

  test('snaps unsupported sizes and replaces unknown ones', () => {
    const { layout, issues } = readLayout({
      ...brief,
      profiles: { market: [s('todayPnl', 'XL'), s('watchlist', 'huge'), s('sessionClock')] },
      topStrip: [],
    })
    assert.deepEqual(layout.profiles.market, [s('todayPnl', 'M'), s('watchlist', 'S'), s('sessionClock', 'S')])
    assert.deepEqual(issues.map((i) => [i.path, i.code, i.fixed]), [
      ['profiles.market[0].size', 'unsupported-size', 'replaced'],
      ['profiles.market[1].size', 'unsupported-size', 'replaced'],
      ['profiles.market[2].size', 'unsupported-size', 'replaced'],
    ])
  })

  test('lets one widget appear twice through type', () => {
    const market = [s('chart-nifty', 'M', 'miniChart'), s('chart-crude', 'L', 'miniChart')]
    const { layout, issues } = readLayout({ ...brief, profiles: { market }, topStrip: [] })
    assert.deepEqual(issues, [])
    assert.deepEqual(layout.profiles.market, market)
  })

  test('drops malformed items', () => {
    const { layout, issues } = readLayout({
      ...brief,
      profiles: { market: [null, 'todayPnl', { size: 'S' }, { id: '' }, { id: 'x', type: 3, size: 'S' }] },
      topStrip: [],
    })
    assert.deepEqual(layout.profiles.market, [])
    assert.equal(issues.length, 5)
    assert.ok(issues.every((i) => i.code === 'bad-shape' && i.fixed === 'dropped'))
  })

  test('never matches a type against Object.prototype', () => {
    const { layout, issues } = readLayout({ ...brief, profiles: { market: [s('a', 'S', 'toString'), s('constructor', 'S')] }, topStrip: [] })
    assert.deepEqual(layout.profiles.market, [])
    assert.deepEqual(issues.map((i) => i.code), ['unknown-widget', 'unknown-widget'])
  })

  test('refuses a "__proto__" profile without touching the prototype', () => {
    const { layout, issues } = readLayout(JSON.parse('{"version":1,"device":"desktop","profiles":{"__proto__":[{"id":"todayPnl","size":"S"}]}}'))
    assert.equal(Object.getPrototypeOf(layout.profiles), Object.prototype)
    assert.deepEqual(Object.keys(layout.profiles), ['market', 'closed'])
    assert.equal(issues[0].code, 'bad-shape')
  })

  test('replaces profiles that are not lists', () => {
    const { layout, issues } = readLayout({ ...brief, profiles: { market: {} }, topStrip: [] })
    assert.deepEqual(layout.profiles.market, [])
    assert.deepEqual(issues.map((i) => [i.path, i.fixed]), [['profiles.market', 'replaced']])
    assert.equal(readLayout({ ...brief, profiles: [] }).issues[0].path, 'profiles')
  })

  test('keeps the top strip to three known, distinct ids', () => {
    const market = ['todayPnl', 'sessionClock', 'watchlist', 'edgeStats'].map((id) => s(id, 'S'))
    const { layout, issues } = readLayout({
      ...brief,
      profiles: { market },
      topStrip: ['todayPnl', 'nope', 'todayPnl', 7, 'sessionClock', 'watchlist', 'edgeStats'],
    })
    assert.deepEqual(layout.topStrip, ['todayPnl', 'sessionClock', 'watchlist'])
    assert.deepEqual(issues.map((i) => i.code), ['top-strip-unknown-id', 'duplicate-id', 'bad-shape', 'top-strip-too-long'])
  })

  test('accepts a host catalog with its own tiles', () => {
    const catalog = { ...WIDGETS, news: { tag: 'my-news', label: 'News', sizes: ['Tall'] } }
    const { layout, issues } = readLayout({ ...brief, profiles: { market: [s('news', 'Tall')] }, topStrip: [] }, { catalog })
    assert.deepEqual(issues, [])
    assert.deepEqual(layout.profiles.market, [s('news', 'Tall')])
  })
})

describe('editing', () => {
  const items = [s('todayPnl', 'Wide'), s('sessionClock', 'S'), s('watchlist', 'Tall')]

  test('addItem appends, snaps the size and leaves the input alone', () => {
    const next = addItem(items, s('edgeStats', 'XL'))
    assert.deepEqual(next.at(-1), s('edgeStats', 'M'))
    assert.equal(items.length, 3)
  })

  test('addItem keeps type and refuses a duplicate id', () => {
    assert.deepEqual(addItem([], s('c2', 'M', 'miniChart')), [s('c2', 'M', 'miniChart')])
    assert.throws(() => addItem(items, s('watchlist', 'S')), /already/)
    assert.throws(() => addItem(items, { size: 'S' }), TypeError)
  })

  test('a new tile goes in the first gap it fits', () => {
    const next = addItem([s('a', 'S'), s('b', 'XL')], s('c', 'S'))
    assert.deepEqual(at(place(next, 4, {})).at(-1), ['c', 1, 0])
  })

  test('removeItem', () => {
    assert.deepEqual(removeItem(items, 'sessionClock').map((i) => i.id), ['todayPnl', 'watchlist'])
  })

  test('moveItem reorders and clamps the index', () => {
    assert.deepEqual(moveItem(items, 'watchlist', 0).map((i) => i.id), ['watchlist', 'todayPnl', 'sessionClock'])
    assert.deepEqual(moveItem(items, 'todayPnl', 99).map((i) => i.id), ['sessionClock', 'watchlist', 'todayPnl'])
    assert.deepEqual(moveItem(items, 'todayPnl', -5).map((i) => i.id), ['todayPnl', 'sessionClock', 'watchlist'])
    assert.deepEqual(moveItem(items, 'nope', 0), items)
    assert.notEqual(moveItem(items, 'nope', 0), items)
  })

  test('resizeItem snaps to a supported size', () => {
    assert.deepEqual(resizeItem(items, 'watchlist', 'L')[2], s('watchlist', 'M'))
    assert.equal(resizeItem(items, 'watchlist', 'M')[0], items[0], 'other items are kept as they are')
    assert.deepEqual(resizeItem([s('news', 'S')], 'news', 'Tall', {})[0], s('news', 'Tall'))
  })

  test('stepSize walks from smallest to largest and stops at the ends', () => {
    const cal = WIDGETS.pnlCalendar
    assert.equal(stepSize(cal, 'Tall', 1), 'M')
    assert.equal(stepSize(cal, 'M', 1), 'Banner')
    assert.equal(stepSize(cal, 'Banner', 1), 'Banner')
    assert.equal(stepSize(cal, 'Tall', -1), 'Tall')
    assert.equal(stepSize(WIDGETS.todayPnl, 'S', 1), 'Wide')
  })

  test('sizeForExtent picks the supported size nearest a dragged extent', () => {
    const cal = WIDGETS.pnlCalendar
    assert.equal(sizeForExtent(cal, 4, 1), 'Banner')
    assert.equal(sizeForExtent(cal, 2.2, 1.8), 'M')
    assert.equal(sizeForExtent(cal, 1, 2), 'Tall')
    assert.equal(sizeForExtent(cal, 1, 1), 'Tall')
  })

  test('sizeForExtent compares footprints on the current grid', () => {
    const chart = WIDGETS.miniChart
    // On three columns, L and XL are both 3×2: keep whichever the tile has.
    assert.equal(sizeForExtent(chart, 3, 2, 3, 'XL'), 'XL')
    assert.equal(sizeForExtent(chart, 3, 2, 3, 'L'), 'L')
    assert.equal(sizeForExtent(chart, 3, 2, 3, 'M'), 'L')
    // On a phone, M and the two-row Banner calendar are both 2×2: keep the current one.
    assert.equal(sizeForExtent(WIDGETS.pnlCalendar, 2, 2, 2, 'Tall'), 'M')
    assert.equal(sizeForExtent(WIDGETS.pnlCalendar, 2, 2, 2, 'Banner'), 'Banner')
    assert.equal(sizeForExtent(WIDGETS.pnlCalendar, 1, 2, 2, 'M'), 'Tall')
  })

  test('withProfile replaces one profile and prunes the top strip', () => {
    const layout = { version: 1, device: 'phone', profiles: { market: items, closed: [] }, topStrip: ['todayPnl', 'sessionClock'] }
    const next = withProfile(layout, 'market', removeItem(items, 'sessionClock'))
    assert.deepEqual(next.topStrip, ['todayPnl'])
    assert.equal(next.profiles.closed, layout.profiles.closed)
    assert.equal(layout.profiles.market.length, 3)
  })

  test('setTopStrip keeps three known, distinct ids', () => {
    const layout = { version: 1, device: 'phone', profiles: { market: [...items, s('edgeStats', 'S')], closed: [] } }
    assert.deepEqual(setTopStrip(layout, ['nope', 'todayPnl', 'todayPnl', 'watchlist', 'sessionClock', 'edgeStats']).topStrip, [
      'todayPnl',
      'watchlist',
      'sessionClock',
    ])
  })
})

describe('dropIndex', () => {
  const row = ['a', 'b', 'c', 'd', 'x'].map((id) => s(id, 'S'))

  test('moves a tile to the slot under the target', () => {
    assert.equal(dropIndex(row, 'x', { col: 0, row: 0 }, 4, {}), 0)
    assert.equal(dropIndex(row, 'a', { col: 3, row: 0 }, 4, {}), 3)
    assert.equal(dropIndex(row, 'a', { col: 2.4, row: 0.2 }, 4, {}), 2)
  })

  test('stays put while the target is still nearest its own slot', () => {
    assert.equal(dropIndex(row, 'a', { col: 0.4, row: 0 }, 4, {}), 0)
  })

  test('keeps the current slot on an exact tie', () => {
    assert.equal(dropIndex([s('a', 'S'), s('b', 'S')], 'b', { col: 0.5, row: 0 }, 4, {}), 1)
    assert.equal(dropIndex([s('a', 'S'), s('b', 'S')], 'a', { col: 0.5, row: 0 }, 4, {}), 0)
  })

  test('weighs columns by their on-screen width', () => {
    // x is at (0, 1). The target sits nearer (1, 0) in cells, but when a
    // column is narrow on screen the horizontal miss matters less.
    assert.equal(dropIndex(row, 'x', { col: 0.9, row: 0.6 }, 4, {}, 1), 1)
    assert.equal(dropIndex(row, 'x', { col: 0.9, row: 0.6 }, 4, {}, 0.2), 4)
  })

  test('works with mixed sizes, where some positions are unreachable', () => {
    const items = [s('a', 'M'), s('b', 'Wide'), s('c', 'S')]
    // c can reach the top right corner by going before b.
    const to = dropIndex(items, 'c', { col: 3, row: 0 }, 4, {})
    assert.deepEqual(at(place(moveItem(items, 'c', to), 4, {})).find(([id]) => id === 'c'), ['c', 2, 0])
  })

  test('returns -1 for an unknown id', () => {
    assert.equal(dropIndex(row, 'nope', { col: 0, row: 0 }, 4, {}), -1)
  })

  // dropIndex tries every slot and lays out the first i + 1 tiles for each, so
  // it is O(n^3) in the tile count by construction (measured: about 40x from
  // 30 to 120 tiles). The tests below catch an accidental step beyond that
  // without comparing two small timings, which flake under load.
  const tiles = (n) => Array.from({ length: n }, (_, i) => s(`t${i}`, SIZE_NAMES[i % SIZE_NAMES.length]))
  const bestBatchMs = (n, calls, batches) => {
    const items = tiles(n)
    const run = (i) => dropIndex(items, `t${i % n}`, { col: i % 4, row: i % 12 }, 4, {}, 2)
    for (let i = 0; i < calls; i++) run(i) // warm up
    let best = Infinity
    for (let b = 0; b < batches; b++) {
      const start = performance.now()
      for (let i = 0; i < calls; i++) run(i)
      best = Math.min(best, (performance.now() - start) / calls)
    }
    return best
  }

  test('does not grow faster than cubically with the tile count', () => {
    // Counts reads of the tiles instead of timing two sizes. Each of the n
    // slots lays out a prefix, so the tiles are read O(n^2) times: 4x the tiles
    // is 16x the reads (measured 15.2). An extra loop over the tiles would make
    // it 64x, so 17 leaves room only for constants.
    const reads = (n) => readsOf(tiles(n), (items) => dropIndex(items, `t${n >> 1}`, { col: 2, row: 5 }, 4, {}, 2))
    const ratio = reads(120) / reads(30)
    assert.ok(ratio > 8 && ratio <= 17, `120 tiles read the tiles ${ratio.toFixed(1)}x as often as 30`)
  })

  test('a step past cubic in the cell scan is still caught by a generous ceiling', () => {
    // The scan inside placement is not observable from here, so this one is
    // timed: 120 tiles take about 2 ms idle, and a ceiling of 100 ms (50x) is
    // reached only by a regression of another factor of n. The best of 15
    // batches, because load only ever adds time.
    const each = bestBatchMs(120, 3, 15)
    assert.ok(each < 100, `${each.toFixed(1)} ms per call for 120 tiles`)
  })

  test('stays far inside a frame for 30 tiles', () => {
    // It runs on every pointer move while dragging. It takes well under a
    // tenth of a millisecond alone, so 5 ms is a ceiling that only a real
    // regression, not a busy machine, reaches in the best of 15 batches.
    const each = bestBatchMs(30, 20, 15)
    assert.ok(each < 5, `${each.toFixed(3)} ms per call`)
  })
})

// The slow, obvious version of place(): a set of taken cells and a scan.
function referencePlace(items, columns) {
  const taken = new Set()
  const free = (c, r, w, h) => {
    for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) if (taken.has(`${x},${y}`)) return false
    return true
  }
  let rows = 0
  const placements = items.map((item) => {
    const { cols, rows: h, variant } = footprint(item.size, columns, null)
    for (let r = 0; ; r++) {
      for (let c = 0; c + cols <= columns; c++) {
        if (!free(c, r, cols, h)) continue
        for (let y = r; y < r + h; y++) for (let x = c; x < c + cols; x++) taken.add(`${x},${y}`)
        rows = Math.max(rows, r + h)
        return { id: item.id, col: c, row: r, cols, rows: h, variant }
      }
    }
  })
  return { placements, rows }
}

// Deterministic, so a failing run can be replayed.
function prng(seed) {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x80000000
  }
}

describe('readLayout: array shorthand and unknown: keep', () => {
  test('an array becomes a version-1 layout with the items in market', () => {
    const { layout, issues } = readLayout([{ id: 'pnl', type: 'todayPnl', size: 'Wide' }])
    assert.deepEqual(layout, {
      version: 1,
      device: 'desktop',
      profiles: { market: [{ id: 'pnl', type: 'todayPnl', size: 'Wide' }], closed: [] },
    })
    assert.deepEqual(issues, [])
    assert.equal(readLayout([{ id: 'todayPnl', size: 'S' }], { device: 'phone' }).layout.device, 'phone')
  })

  test('an empty array is valid', () => {
    const { layout, issues } = readLayout([])
    assert.deepEqual(layout, emptyLayout('desktop'))
    assert.deepEqual(issues, [])
  })

  test('bad items in an array are reported under profiles.market', () => {
    const { layout, issues } = readLayout([{ id: 'todayPnl', size: 'S' }, 5, { id: 'todayPnl', size: 'M' }])
    assert.equal(layout.profiles.market.length, 1)
    assert.deepEqual(issues.map((i) => [i.path, i.code]), [
      ['profiles.market[1]', 'bad-shape'],
      ['profiles.market[2]', 'duplicate-id'],
    ])
  })

  test("unknown: 'keep' keeps an unknown item once, with its size when valid", () => {
    const { layout, issues } = readLayout(
      [{ id: 'mine', size: 'L' }, { id: 'other', type: 'mine', size: 'huge' }, { id: 'noSize' }],
      { unknown: 'keep' },
    )
    assert.deepEqual(layout.profiles.market, [
      { id: 'mine', size: 'L' },
      { id: 'other', type: 'mine', size: 'S' },
      { id: 'noSize', size: 'S' },
    ])
    assert.equal(issues.length, 3)
    for (const i of issues) assert.deepEqual([i.code, i.fixed], ['unknown-widget', 'kept'])
  })

  test("unknown: 'keep' still drops duplicate ids and keeps known items normal", () => {
    const { layout, issues } = readLayout(
      [{ id: 'mine', size: 'M' }, { id: 'mine', size: 'M' }, { id: 'todayPnl', size: 'L' }],
      { unknown: 'keep' },
    )
    assert.deepEqual(layout.profiles.market.map((i) => [i.id, i.size]), [['mine', 'M'], ['todayPnl', 'M']])
    assert.deepEqual(issues.map((i) => [i.code, i.fixed]), [
      ['unknown-widget', 'kept'],
      ['duplicate-id', 'dropped'],
      ['unsupported-size', 'replaced'],
    ])
  })

  test('the default still drops unknown items', () => {
    const { layout, issues } = readLayout([{ id: 'mine', size: 'M' }])
    assert.deepEqual(layout.profiles.market, [])
    assert.deepEqual(issues.map((i) => [i.code, i.fixed]), [['unknown-widget', 'dropped']])
    assert.equal(readLayout([{ id: 'mine', size: 'M' }], { unknown: 'drop' }).layout.profiles.market.length, 0)
  })
})
