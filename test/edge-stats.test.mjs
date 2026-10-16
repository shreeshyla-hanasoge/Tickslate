import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createFormatter, createMessages, EN, WIDGETS, edgeStats, histogram } from '../src/core/index.js'
import { checkShape } from '../src/elements/dev.js'
import { FakeElement, FakeDocument } from './fake-dom.mjs'
import { MiniDoc, keyedNodes } from './list-dom.mjs'

// <ts-edge-stats> (RFC 0003 §21.2): the pure model, and the element's writes against a small tree DOM.

const fmt = createFormatter({ locale: 'en-IN', currency: 'INR', timeZone: 'Asia/Kolkata' })
const ctx = { fmt, t: createMessages(), now: 0, label: 'Edge stats' }

let W // edge-stats.js, loaded against the fake HTMLElement
before(async () => {
  globalThis.HTMLElement = FakeElement
  globalThis.document = new FakeDocument()
  W = await import('../src/elements/edge-stats.js')
  delete globalThis.HTMLElement
})
after(() => {
  delete globalThis.document
})

const model = (data, variant = 'Wide', extra) => W.edgeStatsModel(data, variant, { ...ctx, ...extra })
const trades = (...pnls) => pnls.map((pnl) => ({ pnl }))
const MIXED = { stats: edgeStats(trades(300, -100, 200, -150, 50)), scope: 'Last 30 days' }
const cellOf = (m, key) => m.cells.find((c) => c.key === key)

describe('without a DOM', () => {
  test('the class module loads and declares its contract', () => {
    assert.equal(typeof W.TsEdgeStats, 'function')
    assert.equal(W.TsEdgeStats.catalogKey, 'edgeStats')
    assert.equal(W.TsEdgeStats.emptyText, EN['widget.edgeStats.empty'])
    assert.equal(W.TsEdgeStats.emptyText, 'No trades yet')
    assert.deepEqual(W.TsEdgeStats.edgeStatsModel(MIXED, 'Wide', ctx), model(MIXED))
    assert.ok(W.TsEdgeStats.observedAttributes.includes('stat'))
  })

  test('the catalog entry is the RFC\'s', () => {
    const { tag, label, sizes } = WIDGETS.edgeStats
    assert.deepEqual({ tag, label, sizes }, { tag: 'ts-edge-stats', label: 'Edge stats', sizes: ['S', 'Wide', 'M'] })
  })

  test('the templates hold no words, and every variant has a skeleton', () => {
    for (const v of ['S', 'Wide', 'M']) {
      const html = W.TsEdgeStats.template(v)
      assert.doesNotMatch(html, />[^<]*\p{L}[^<]*</u, v)
      assert.doesNotMatch(html, /\s(aria-label|title)="[^"]*\p{L}/u, v)
      assert.match(W.TsEdgeStats.skeleton(v), /class="sk /)
    }
    assert.match(W.TsEdgeStats.template('S'), /data-k="l0"/)
    assert.doesNotMatch(W.TsEdgeStats.template('S'), /data-k="l1"/)
    assert.match(W.TsEdgeStats.template('M'), /data-k="bars"/)
    assert.doesNotMatch(W.TsEdgeStats.template('Wide'), /data-k="bars"/)
  })

  test('the CSS uses tokens and logical properties only, and system colours only under forced colours', () => {
    const css = W.TsEdgeStats.styles
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|\b(rgb|hsl)a?\(/i)
    assert.doesNotMatch(css, /\b(left|right|margin-left|margin-right|padding-left|padding-right)\s*:/)
    assert.doesNotMatch(css, /text-align:\s*(left|right)/)
    assert.match(css, /@media \(forced-colors: active\)/)
    assert.match(css, /color-mix\(in srgb, var\(--ts-loss\)/)
  })

  test('dataShape asks for stats, and lists the rest as optional', () => {
    assert.equal(W.TsEdgeStats.dataShape.stats, 'object')
    assert.deepEqual(Object.keys(W.TsEdgeStats.dataShape).sort(), ['asOf', 'distribution', 'live', 'scope', 'stats'])
    assert.equal(checkShape(MIXED, W.TsEdgeStats.dataShape), null)
    assert.ok(checkShape({}, W.TsEdgeStats.dataShape))
  })

  test('nothing writes markup from data', async () => {
    const { readFileSync } = await import('node:fs')
    assert.doesNotMatch(readFileSync(new URL('../src/elements/edge-stats.js', import.meta.url), 'utf8'), /innerHTML|insertAdjacentHTML|outerHTML/)
  })
})

describe('the stats', () => {
  test('win rate is a percent, whole when it is whole', () => {
    assert.equal(cellOf(model(MIXED), 'win-rate').main.text, '60%')
    assert.equal(cellOf(model({ stats: edgeStats(trades(1, 1, -1)) }), 'win-rate').main.text, '66.7%')
  })

  test('profit factor is a ratio to two places; Infinity is ∞ and no trades is a dash', () => {
    assert.equal(cellOf(model(MIXED), 'profit-factor').main.text, '2.20')
    const wins = model({ stats: edgeStats(trades(10, 20)) })
    assert.deepEqual([cellOf(wins, 'profit-factor').main.text, cellOf(wins, 'profit-factor').spoken], ['∞', 'Profit factor ∞'])
    const none = model({ stats: edgeStats([]) })
    assert.equal(cellOf(none, 'profit-factor').main.text, '—')
    assert.equal(cellOf(none, 'profit-factor').spoken, 'Profit factor not available')
  })

  test('all wins: win rate 100%, no average loss; all losses: win rate 0%, no average win', () => {
    const wins = model({ stats: edgeStats(trades(10, 20)) })
    assert.equal(cellOf(wins, 'win-rate').main.text, '100%')
    assert.deepEqual([cellOf(wins, 'avg-win-loss').main.text, cellOf(wins, 'avg-win-loss').sub.text], ['+₹15.00', '—'])
    const losses = model({ stats: edgeStats(trades(-10, -30)) })
    assert.equal(cellOf(losses, 'win-rate').main.text, '0%')
    assert.deepEqual([cellOf(losses, 'avg-win-loss').main.text, cellOf(losses, 'avg-win-loss').sub.text], ['—', '−₹20.00'])
    assert.equal(cellOf(losses, 'profit-factor').main.text, '0.00')
  })

  test('no trades: every figure is a dash, with nothing signed', () => {
    const m = model({ stats: edgeStats([]), scope: 'Last 30 days' })
    for (const c of m.cells) {
      assert.equal(c.main.text, '—', c.key)
      assert.equal(c.main.arrow, '', c.key)
    }
    assert.equal(m.meta, '0 trades · Last 30 days')
  })

  test('money is signed, with the true minus and an arrow, and grouped in lakhs for en-IN', () => {
    const m = model({ stats: edgeStats(trades(1245000.5, -300000, 200)) })
    const wl = cellOf(m, 'avg-win-loss')
    assert.deepEqual([wl.main.full, wl.main.arrow, wl.main.tone], ['+₹6,22,600.25', '▲', 'pos'])
    assert.deepEqual([wl.sub.full, wl.sub.arrow, wl.sub.tone], ['−₹3,00,000.00', '▼', 'neg'])
    assert.match(m.ariaLabel, /Avg win \/ loss \+₹6,22,600\.25 \/ −₹3,00,000\.00/)
    const e = cellOf(m, 'expectancy')
    assert.deepEqual([e.main.arrow, e.main.tone, e.sub.text], ['▲', 'pos', 'per trade'])
    // A losing expectancy is a loss: the minus and the down arrow, not only red.
    const bad = cellOf(model({ stats: edgeStats(trades(-50, 10)) }), 'expectancy')
    assert.deepEqual([bad.main.full, bad.main.arrow, bad.main.tone], ['−₹20.00', '▼', 'neg'])
  })

  test('a long amount is compact in the cell and whole in the name', () => {
    const wl = cellOf(model({ stats: edgeStats(trades(1245000.5, -300000)) }), 'avg-win-loss')
    assert.equal(wl.main.text, '+₹12.5L')
    assert.equal(wl.main.full, '+₹12,45,000.50')
  })

  test('an expectancy that rounds to zero shows no sign and no arrow', () => {
    const e = cellOf(model({ stats: { trades: 2, expectancy: 0.001 } }), 'expectancy')
    assert.deepEqual([e.main.arrow, e.main.tone], ['', 'mut'])
  })

  test('numeric strings in the stats are read, and figures that are not numbers are dashes', () => {
    const m = model({ stats: { trades: '10', winRate: '0.5', profitFactor: 'n/a', avgWin: '100', avgLoss: null, expectancy: undefined } })
    assert.equal(cellOf(m, 'win-rate').main.text, '50%')
    assert.equal(cellOf(m, 'profit-factor').main.text, '—')
    assert.deepEqual([cellOf(m, 'avg-win-loss').main.text, cellOf(m, 'avg-win-loss').sub.text], ['+₹100.00', '—'])
    assert.equal(cellOf(m, 'expectancy').main.text, '—')
    assert.equal(m.meta, '10 trades')
  })

  test('data that is not edge stats gives dashes rather than throwing', () => {
    for (const bad of [null, undefined, 5, 'x', [], {}, { stats: 'x' }]) {
      const m = model(bad)
      assert.equal(m.cells.length, 4, String(bad))
      assert.ok(m.cells.every((c) => c.main.text === '—'))
    }
  })
})

describe('sizes', () => {
  test('S shows the one stat the stat attribute names, win rate by default', () => {
    assert.deepEqual(model(MIXED, 'S').cells.map((c) => c.key), ['win-rate'])
    for (const stat of W.STATS) assert.deepEqual(model(MIXED, 'S', { stat }).cells.map((c) => c.key), [stat])
    assert.deepEqual(model(MIXED, 'S', { stat: 'nonsense' }).cells.map((c) => c.key), ['win-rate'])
    assert.equal(W.normalizeStat('expectancy'), 'expectancy')
    assert.equal(W.normalizeStat(null), 'win-rate')
  })

  test('Wide shows four stats in a fixed order, and M the same four with the histogram', () => {
    assert.deepEqual(model(MIXED, 'Wide').cells.map((c) => c.key), ['win-rate', 'profit-factor', 'avg-win-loss', 'expectancy'])
    assert.equal(model(MIXED, 'M').cells.length, 4)
    const dist = [{ label: '−1k', count: 4, sign: -1 }, { label: '0', count: 8, sign: 1 }]
    assert.equal(model({ ...MIXED, distribution: dist }, 'Wide').dist.bars.length, 0)
    assert.equal(model({ ...MIXED, distribution: dist }, 'S').dist.bars.length, 0)
    assert.equal(model({ ...MIXED, distribution: dist }, 'M').dist.bars.length, 2)
  })

  test('the name states the stats and the trade count, and S names its stat only', () => {
    assert.equal(model(MIXED, 'S').ariaLabel, 'Edge stats, Win rate 60%, 5 trades · Last 30 days')
    assert.equal(model(MIXED, 'S', { stat: 'profit-factor' }).ariaLabel, 'Edge stats, Profit factor 2.20, 5 trades · Last 30 days')
    assert.match(model(MIXED, 'Wide').ariaLabel, /^Edge stats, Win rate 60%, Profit factor 2\.20, Avg win \/ loss \+₹183\.33 \/ −₹125\.00, Expectancy \+₹60\.00 per trade, 5 trades · Last 30 days$/)
  })

  test('the scope is optional', () => {
    assert.equal(model({ stats: MIXED.stats }, 'S').ariaLabel, 'Edge stats, Win rate 60%, 5 trades')
  })

  test('freshness: the live dot and the synced time', () => {
    const m = model({ ...MIXED, live: true, asOf: Date.UTC(2026, 7, 5, 6, 12) })
    assert.deepEqual([m.live, m.time], [true, '11:42'])
    assert.deepEqual([model(MIXED).live, model(MIXED).time], [false, ''])
  })
})

describe('the histogram', () => {
  const bars = (distribution) => model({ ...MIXED, distribution }, 'M').dist

  test('heights follow the largest count, and an empty bucket is flagged', () => {
    const { bars: b } = bars([{ label: 'a', count: 5, sign: -1 }, { label: 'b', count: 0, sign: 1 }, { label: 'c', count: 10, sign: 1 }])
    assert.deepEqual(b.map((x) => [x.h, x.zero, x.loss]), [[50, false, true], [0, true, false], [100, false, false]])
  })

  test('it reads what histogram() makes, with a label and a sign added', () => {
    const rows = histogram([-20, -5, 5, 5, 15, 30], [-30, 0, 10, 30])
    const d = bars(rows.map((r) => ({ label: String(r.from), count: r.count, sign: r.to <= 0 ? -1 : 1 })))
    assert.deepEqual(d.bars.map((x) => x.title), ['-30: 2', '0: 2', '10: 2'])
  })

  test('it is named by the trades on each side and the busiest bucket; a bucket reads its count', () => {
    const d = bars([{ label: '−1k', count: 4, sign: -1 }, { label: '0', count: 8, sign: 1 }, { label: '1k', count: 2, sign: 1 }])
    assert.equal(d.ariaLabel, 'Result distribution: 10 trades above zero, 4 trades below zero, most in 0')
    assert.equal(d.bars[0].title, '−1k: 4')
  })

  test('a bucket that cannot be read is left out, and none at all draws nothing', () => {
    const d = bars([null, 'x', { label: 'a', count: -1 }, { label: 'b', count: 'n/a' }, { label: 'c', count: '3' }])
    assert.deepEqual(d.bars.map((x) => x.label), ['c'])
    for (const none of [undefined, [], 'x', {}]) assert.deepEqual(bars(none), { bars: [], ariaLabel: '' }, String(none))
  })

  test('all-zero counts give flat bars and no "most in"', () => {
    const d = bars([{ label: 'a', count: 0, sign: 1 }, { label: 'b', count: 0, sign: -1 }])
    assert.deepEqual(d.bars.map((x) => x.h), [0, 0])
    assert.doesNotMatch(d.ariaLabel, /most in/)
  })
})

describe('words', () => {
  const PSEUDO = createMessages(Object.fromEntries(Object.entries(EN).map(([key, value]) => [key, `⟦${value}⟧`])))
  const pseudo = { ...ctx, t: PSEUDO }
  const WRAP = /⟦[^⟦⟧]*⟧/g
  // A string built from several messages is wrapped once for each; peel them all.
  const peel = (s) => {
    for (let before = ''; before !== s; ) {
      before = s
      s = s.replace(WRAP, ' ')
    }
    return s
  }

  test('every word in the model comes from the messages, in the pseudo-locale', () => {
    const rich = { ...MIXED, scope: 'SCOPE', distribution: [{ label: 'LBL', count: 4, sign: -1 }, { label: 'LBL2', count: 9, sign: 1 }] }
    for (const variant of ['S', 'Wide', 'M']) {
      for (const stat of W.STATS) {
        const m = W.edgeStatsModel(rich, variant, { ...pseudo, stat })
        const strings = [m.ariaLabel, m.meta, m.distLabel, m.dist.ariaLabel, ...m.cells.flatMap((c) => [c.label, c.spoken, c.sub && c.sub.text]), ...m.dist.bars.map((b) => b.title)].filter(Boolean)
        for (const s of strings) {
          const left = peel(s).split('Edge stats').join(' ').split('SCOPE').join(' ').split('LBL2').join(' ').split('LBL').join(' ')
          // What is left is figures and symbols only: no English the messages did not supply.
          assert.doesNotMatch(left, /\p{L}/u, `${variant}/${stat}: ${s}`)
        }
      }
    }
  })

  test('the keys exist', () => {
    for (const key of ['edge.winRate', 'edge.profitFactor', 'edge.avgWinLoss', 'edge.expectancy', 'edge.perTrade', 'edge.na', 'edge.meta', 'edge.dist', 'edge.distPeak', 'edge.bucket', 'widget.edgeStats.empty']) {
      assert.ok(key in EN, key)
    }
  })
})

// ── The element ───────────────────────────────────────────────────────────

function build({ variant = 'Wide', stat } = {}) {
  const doc = new MiniDoc()
  const el = new W.TsEdgeStats()
  el.$ = keyedNodes(doc)
  el.ownerDocument = doc
  el.requestRender = () => {}
  const view = (d, v = variant) => el.update(W.TsEdgeStats.viewModel(d, v, { ...ctx, stat }), v)
  return { el, doc, view, node: el.$ }
}

describe('the element draws in place', () => {
  test('writes each stat into its cell: the label, the arrow, the figure and its tone', () => {
    const { view, node } = build()
    view(MIXED)
    assert.equal(node('[data-k="l2"]').textContent, 'Avg win / loss')
    assert.equal(node('[data-k="v2V"]').textContent, '+₹183.33')
    assert.equal(node('[data-k="v2Ar"]').textContent, '▲')
    assert.equal(node('[data-k="v2"]').getAttribute('class'), 'n md pos')
    assert.equal(node('[data-k="s2V"]').textContent, '−₹125.00')
    assert.equal(node('[data-k="s2"]').getAttribute('class'), 'n sm sub neg')
    assert.equal(node('[data-k="v0"]').getAttribute('class'), 'n md')
    assert.equal(node('[data-k="note"]').textContent, '5 trades · Last 30 days')
  })

  test('S writes its one stat, in the big figure', () => {
    const { view, node } = build({ variant: 'S', stat: 'expectancy' })
    view(MIXED)
    assert.equal(node('[data-k="l0"]').textContent, 'Expectancy')
    assert.equal(node('[data-k="v0V"]').textContent, '+₹60.00')
    assert.equal(node('[data-k="v0"]').getAttribute('class'), 'big nv pos')
    assert.equal(node('[data-k="s0V"]').textContent, 'per trade')
  })

  test('the sign colour is the figure\'s class and the arrow is aria-hidden in the markup', () => {
    assert.match(W.TsEdgeStats.template('Wide'), /class="ar" aria-hidden="true" data-k="v0Ar"/)
    assert.match(W.TsEdgeStats.template('S'), /class="ar" aria-hidden="true" data-k="v0Ar"/)
  })

  test('a changed figure writes its own nodes, and an update that changes nothing writes nothing', () => {
    const { view, doc } = build()
    view({ ...MIXED, live: true, asOf: 0 })
    doc.take()
    view({ ...MIXED, live: true, asOf: 0 })
    assert.deepEqual(doc.take(), [])
    view({ stats: edgeStats(trades(300, -100, 200, -150, 50, 25)), scope: 'Last 30 days', live: true, asOf: 0 })
    const log = doc.take()
    assert.ok(log.length > 0 && log.length < 40, log.join('\n'))
    assert.ok(!log.some((l) => l.startsWith('insert') || l.startsWith('remove')), 'nothing is rebuilt')
  })

  test('the histogram is drawn in M, keyed, and a change touches only the bar that changed', () => {
    const { view, doc, node } = build({ variant: 'M' })
    const dist = [{ label: 'a', count: 5, sign: -1 }, { label: 'b', count: 10, sign: 1 }, { label: 'c', count: 5, sign: 1 }]
    view({ ...MIXED, distribution: dist })
    const box = node('[data-k="bars"]')
    assert.equal(box.children.length, 3)
    assert.equal(box.getAttribute('aria-label'), 'Result distribution: 15 trades above zero, 5 trades below zero, most in b')
    assert.equal(node('[data-k="dist"]').hasAttribute('hidden'), false)
    const [a, b] = box.children
    assert.equal(a.getAttribute('class'), 'hb loss')
    assert.equal(b.getAttribute('class'), 'hb')
    assert.equal(a.firstChild.firstChild.style.getPropertyValue('--h'), '50')
    assert.equal(b.lastChild.textContent, 'b')
    doc.take()
    view({ ...MIXED, distribution: [dist[0], { label: 'b', count: 10, sign: 1 }, { label: 'c', count: 7, sign: 1 }] })
    const log = doc.take()
    // The label of the bar and its words do not change; only its height and its title, and the box's own name.
    assert.ok(log.some((l) => l.includes('--h=70')), log.join('\n'))
    assert.ok(!log.some((l) => l.startsWith('insert') || l.startsWith('remove')))
    view({ ...MIXED, distribution: [dist[0]] })
    assert.equal(box.children.length, 1)
    view(MIXED)
    assert.equal(node('[data-k="dist"]').hasAttribute('hidden'), true)
  })

  test('there is no action but retry: the element has no click handler of its own', () => {
    assert.doesNotMatch(W.TsEdgeStats.toString(), /ts-action|emit\(/)
  })
})
