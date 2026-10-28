import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createFormatter, createMessages, dayStats, EN, WIDGETS } from '../src/core/index.js'
import { checkShape } from '../src/elements/dev.js'
import { FakeElement, FakeDocument } from './fake-dom.mjs'

// <ts-pnl-calendar> (RFC 0003 §21.1): the pure model, the week layout, the keyboard and the template.

// en-GB: Monday first, weekend Saturday and Sunday, "Mon 12 Oct" and a "+1,240.00" figure.
const fmt = createFormatter({ locale: 'en-GB', timeZone: 'UTC' })
const t = createMessages()
const NOW = Date.UTC(2026, 9, 16, 12)
const ctx = { fmt, t, now: NOW, label: 'Daily P&L calendar' }
const TODAY = '2026-10-16' // a Friday

let P // pnl-calendar.js, loaded against the fake HTMLElement
before(async () => {
  globalThis.HTMLElement = FakeElement
  globalThis.document = new FakeDocument()
  P = await import('../src/elements/pnl-calendar.js')
  delete globalThis.HTMLElement
})
after(() => {
  delete globalThis.document
})

const model = (data, variant = 'M', extra = {}, f = fmt) => P.calendarModel(data, variant, { ...ctx, fmt: f, ...extra })
const day = (date, pnl) => ({ date, pnl })
const cells = (vm) => vm.bands.flatMap((b) => b.weeks.flatMap((w) => w.cells))
const find = (vm, date) => cells(vm).find((c) => c.date === date)

describe('without a DOM', () => {
  test('the class module loads and declares its contract', () => {
    assert.equal(typeof P.TsPnlCalendar, 'function')
    assert.equal(P.TsPnlCalendar.catalogKey, 'pnlCalendar')
    assert.equal(P.TsPnlCalendar.emptyText, EN['widget.pnlCalendar.empty'])
    assert.deepEqual(P.TsPnlCalendar.calendarModel({ days: [] }, 'M', ctx), model({ days: [] }))
  })

  test('the catalog entry is the RFC\'s: Tall, M, Banner, and two rows for a phone\'s Banner', () => {
    const { tag, sizes, phoneRows } = WIDGETS.pnlCalendar
    assert.deepEqual({ tag, sizes }, { tag: 'ts-pnl-calendar', sizes: ['Tall', 'M', 'Banner'] })
    assert.deepEqual({ ...phoneRows }, { Banner: 2 })
  })

  test('the data shape names days, today, asOf and live', () => {
    const shape = P.TsPnlCalendar.dataShape
    assert.deepEqual(Object.keys(shape), ['days', 'today', 'asOf', 'live'])
    assert.equal(checkShape({ days: [{ date: '2026-10-01', pnl: 5 }] }, shape), null)
    assert.notEqual(checkShape({ days: 'x' }, shape), null)
  })

  test('the template is static markup with no words, one grid and a header', () => {
    for (const v of ['Tall', 'M', 'Banner']) {
      const html = P.TsPnlCalendar.template(v)
      assert.equal((html.match(/part="label"/g) || []).length, 1, v)
      assert.match(html, /data-k="grid" role="grid" aria-label="" aria-describedby="summary"/)
      assert.doesNotMatch(html, />[^<]*\p{L}[^<]*</u, `${v}: no English in the template`)
      assert.doesNotMatch(html, /\s(aria-label|title)="[^"]*\p{L}/u)
      assert.match(P.TsPnlCalendar.skeleton(v), /class="sk /)
    }
    assert.equal(P.TsPnlCalendar.template('XL'), P.TsPnlCalendar.template('M'))
  })

  test('the styles use logical properties, tokens and no colour of their own', () => {
    const css = P.TsPnlCalendar.styles
    assert.doesNotMatch(css, /(?<![\w-])(left|right)\s*:/)
    assert.doesNotMatch(css, /margin-(left|right)|padding-(left|right)|text-align:\s*(left|right)/)
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i)
    assert.match(css, /var\(--ts-profit\)/)
    assert.match(css, /var\(--ts-loss\)/)
    assert.match(css, /var\(--ts-surface-2\)/)
    // The corner is opt-in (RFC 0005 Decision 95): it paints --ts-loss-mark, which is transparent until a host or a palette sets it.
    assert.match(css, /\.c\.neg::after[^}]*background: var\(--ts-loss-mark, transparent\)/)
    // The ink is the pseudo-element's own colour, so --ts-loss-mark: currentColor resolves it at the cell, not where a host wrote the token.
    assert.match(css, /\.c\.neg::after[^}]*color: var\(--ts-ink\); background/)
    assert.doesNotMatch(css, /\.c\.neg::after[^}]*background: var\(--ts-ink\)/)
    // Forced colours drop the token and keep the shape, since colour is gone there.
    assert.match(css, /forced-colors: active[\s\S]*\.c\.neg::after \{ background: Highlight; \}/)
  })
})

describe('the week layout', () => {
  test('the locale decides the first day and the weekend, with Monday and Saturday-Sunday as the fallback', () => {
    assert.deepEqual(P.weekInfoFor('en-GB'), { firstDay: 1, weekend: [6, 7] })
    assert.equal(P.weekInfoFor('en-US').firstDay, 7)
    assert.equal(P.weekInfoFor('de-DE').firstDay, 1)
    assert.deepEqual(P.weekInfoFor('not a locale'), { firstDay: 1, weekend: [6, 7] })
    assert.ok(P.weekInfoFor(undefined).firstDay >= 1)
  })

  test('a week column holds the weekdays in the locale\'s order, and the last holds today', () => {
    const grid = P.weekGrid(TODAY, 3, { firstDay: 1, weekend: [6, 7] })
    assert.deepEqual(grid.rows, [1, 2, 3, 4, 5])
    assert.equal(grid.columns.length, 3)
    assert.deepEqual(grid.columns[2], ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'])
    assert.equal(grid.start, '2026-09-28')
    assert.equal(grid.end, '2026-10-18')
  })

  test('a Sunday-first locale starts its week on Sunday, which is a weekend day with no cell', () => {
    const grid = P.weekGrid('2026-10-16', 2, { firstDay: 7, weekend: [6, 7] })
    assert.deepEqual(grid.rows, [1, 2, 3, 4, 5])
    // The week of Sun 11 Oct to Sat 17 Oct.
    assert.deepEqual(grid.columns[1], ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'])
    assert.equal(grid.start, '2026-10-04')
  })

  test('a Friday-Saturday weekend leaves Sunday to Thursday, in order', () => {
    const grid = P.weekGrid('2026-10-15', 1, { firstDay: 7, weekend: [5, 6] })
    assert.deepEqual(grid.rows, [7, 1, 2, 3, 4])
    assert.deepEqual(grid.columns[0], ['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'])
  })

  test('today on a weekend is in the last column, and a year spans 53 week columns', () => {
    const grid = P.weekGrid('2026-10-17', 53, { firstDay: 1, weekend: [6, 7] })
    assert.equal(grid.columns[52][0], '2026-10-12')
    assert.equal(grid.columns[0][0], '2025-10-13')
  })

  test('the year boundary: a grid across New Year has every date once, in order', () => {
    const grid = P.weekGrid('2027-01-04', 4, { firstDay: 1, weekend: [6, 7] })
    assert.deepEqual(grid.columns.map((c) => c[0]), ['2026-12-14', '2026-12-21', '2026-12-28', '2027-01-04'])
    assert.deepEqual(grid.columns[2], ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01'])
    const all = grid.columns.flat()
    assert.deepEqual([...all].sort(), all)
    assert.equal(new Set(all).size, all.length)
  })

  test('a leap day is a real date', () => {
    const grid = P.weekGrid('2028-03-02', 1, { firstDay: 1, weekend: [6, 7] })
    assert.deepEqual(grid.columns[0], ['2028-02-28', '2028-02-29', '2028-03-01', '2028-03-02', '2028-03-03'])
  })

  test('bands split a year into two halves, the first taking the odd column', () => {
    const cols = Array.from({ length: 53 }, (_, i) => [`c${i}`])
    const [a, b] = P.splitBands(cols, 2)
    assert.equal(a.length, 27)
    assert.equal(b.length, 26)
    assert.deepEqual([...a, ...b], cols)
    assert.deepEqual(P.splitBands(cols, 1), [cols])
    assert.equal(P.splitBands(cols.slice(0, 2), 2).length, 2)
  })
})

describe('sizes and the phone wrap', () => {
  test('Tall shows 6 weeks, M 13 and Banner a year', () => {
    assert.equal(model({ days: [] }, 'Tall').bands[0].weeks.length, 6)
    assert.equal(model({ days: [] }, 'M').bands[0].weeks.length, 13)
    assert.equal(model({ days: [] }, 'Banner').bands[0].weeks.length, 53)
    assert.equal(model({ days: [] }, 'Banner').bands.length, 1)
  })

  test('an unknown size is M', () => {
    assert.equal(model({ days: [] }, 'Huge').variant, 'M')
  })

  test('a phone folds Banner into two half-year bands holding the same weeks', () => {
    const data = { days: [day('2026-03-02', 100), day('2026-09-01', -50)], today: TODAY }
    const wide = model(data, 'Banner')
    const phone = model(data, 'Banner', { phone: true })
    assert.equal(phone.phone, true)
    assert.equal(wide.phone, false)
    assert.deepEqual(phone.bands.map((b) => b.weeks.length), [27, 26])
    assert.deepEqual(phone.bands.flatMap((b) => b.weeks.map((w) => w.cells.map((c) => c.date))), wide.bands[0].weeks.map((w) => w.cells.map((c) => c.date)))
    // The second band starts where the first ended, and the figures are those of the whole year.
    assert.equal(phone.bands[1].weeks[0].cells[0].date > phone.bands[0].weeks[26].cells[4].date, true)
    assert.equal(phone.net, wide.net)
  })

  test('a phone changes nothing for Tall and M', () => {
    for (const v of ['Tall', 'M']) {
      const vm = model({ days: [], today: TODAY }, v, { phone: true })
      assert.equal(vm.bands.length, 1)
      assert.equal(vm.phone, false)
    }
  })

  test('each band names its own first month', () => {
    const vm = model({ days: [], today: TODAY }, 'Banner', { phone: true })
    for (const band of vm.bands) assert.ok(band.weeks.some((w) => w.month), 'a band names a month')
  })
})

describe('cells', () => {
  const data = { today: TODAY, days: [day('2026-10-12', 1240), day('2026-10-13', -310.5), day('2026-10-14', 620), day('2026-10-15', 0)] }
  let vm
  before(() => {
    vm = model(data, 'Tall')
  })

  test('a gain is pos and a loss neg, named with the date and the signed value', () => {
    assert.equal(find(vm, '2026-10-12').kind, 'pos')
    assert.equal(find(vm, '2026-10-12').name, 'Mon 12 Oct, +1,240.00')
    assert.equal(find(vm, '2026-10-13').kind, 'neg')
    assert.equal(find(vm, '2026-10-13').name, 'Tue 13 Oct, −310.50')
    assert.match(find(vm, '2026-10-13').name, /−/, 'the true minus, not a hyphen')
  })

  test('strength is 0.22 + 0.78 x |pnl| / max|pnl|', () => {
    assert.equal(find(vm, '2026-10-12').strength, 1)
    assert.ok(Math.abs(find(vm, '2026-10-14').strength - (0.22 + (0.78 * 620) / 1240)) < 1e-12)
    assert.ok(Math.abs(find(vm, '2026-10-13').strength - (0.22 + (0.78 * 310.5) / 1240)) < 1e-12)
  })

  test('the smallest day still shows: strength never falls below 0.22', () => {
    const tiny = model({ today: TODAY, days: [day('2026-10-12', 1e-9 + 1), day('2026-10-13', 100000)] }, 'Tall')
    assert.ok(find(tiny, '2026-10-12').strength >= 0.22)
  })

  test('the maximum is over the days in view: a big day outside it does not dim the rest', () => {
    const far = model({ today: TODAY, days: [day('2020-01-06', 9e6), day('2026-10-12', 100)] }, 'Tall')
    assert.equal(find(far, '2026-10-12').strength, 1)
  })

  test('a flat day, a day with no entry and an upcoming day are not filled', () => {
    assert.equal(find(vm, '2026-10-15').kind, 'flat')
    assert.equal(find(vm, '2026-10-15').strength, null)
    assert.equal(find(vm, '2026-10-15').name, 'Thu 15 Oct, 0.00')
    assert.equal(find(vm, '2026-10-16').kind, 'none')
    assert.equal(find(vm, '2026-10-16').name, 'Fri 16 Oct, no entry')
    assert.equal(find(vm, '2026-09-07').kind, 'none')
    // Today is Friday, and the grid ends on the week's last drawn day, so there is none after it; with a Wednesday there is.
    const mid = model({ today: '2026-10-14', days: [day('2026-10-16', 500)] }, 'Tall')
    assert.equal(find(mid, '2026-10-15').kind, 'up')
    assert.equal(find(mid, '2026-10-15').name, 'Thu 15 Oct, upcoming')
    // An entry dated after today is not a result yet: it is upcoming and is in no total.
    assert.equal(find(mid, '2026-10-16').kind, 'up')
    assert.equal(mid.empty, true)
    assert.equal(mid.net, '0.00')
  })

  test('a day that rounds to nothing is flat, not a loss with no minus', () => {
    const dust = model({ today: TODAY, days: [day('2026-10-12', -0.001), day('2026-10-13', 100)] }, 'Tall')
    assert.equal(find(dust, '2026-10-12').kind, 'flat')
    assert.equal(find(dust, '2026-10-12').name, 'Mon 12 Oct, 0.00')
  })

  test('rows with the same date are one day', () => {
    const two = model({ today: TODAY, days: [day('2026-10-12', 300), day('2026-10-12', -100), day('2026-10-13', 200)] }, 'Tall')
    assert.equal(find(two, '2026-10-12').pnl, 200)
    assert.equal(find(two, '2026-10-12').strength, 1)
    assert.equal(two.tradingDays, 2)
  })

  test('a weekend entry is not drawn, and the figures and the summary leave it out and say so', () => {
    const weekend = model({ today: TODAY, days: [day('2026-10-10', 1000), day('2026-10-12', 100)] }, 'Tall')
    assert.equal(find(weekend, '2026-10-10'), undefined)
    assert.equal(find(weekend, '2026-10-11'), undefined)
    // The best day is a day with a cell.
    assert.equal(weekend.net, '+100.00')
    assert.equal(weekend.best, '+100.00')
    assert.equal(weekend.tradingDays, 1)
    assert.equal(weekend.weekendEntries, 1)
    assert.equal(weekend.note, '1 weekend entry not shown')
    assert.match(weekend.chartLabel, /best day Mon 12 Oct, \+100\.00.*net \+100\.00\. 1 weekend entry not shown$/)
    const two = model({ today: TODAY, days: [day('2026-10-10', 1000), day('2026-10-11', 5), day('2026-10-12', 100)] }, 'Tall')
    assert.equal(two.note, '2 weekend entries not shown')
    assert.equal(model({ today: TODAY, days: [day('2026-10-12', 100)] }, 'Tall').note, '')
    // It does not stretch the strength of the days that are drawn.
    assert.equal(find(weekend, '2026-10-12').strength, 1)
  })

  test('a series of weekend entries only is empty, with the note', () => {
    const only = model({ today: TODAY, days: [day('2026-10-10', 1000), day('2026-10-11', -5)] }, 'M')
    assert.equal(only.empty, true)
    assert.equal(only.net, '0.00')
    assert.equal(only.ariaLabel, 'Daily P&L calendar, no trading days')
    assert.match(only.chartLabel, /no trading days\. 2 weekend entries not shown$/)
  })

  test('a day that sums to dust is flat in the cell and in dayStats, and the cell and the stats agree', () => {
    const dust = model({ today: TODAY, days: [day('2026-10-12', 0.1), day('2026-10-12', 0.2), day('2026-10-12', -0.3), day('2026-10-13', 5)] }, 'Tall')
    assert.equal(find(dust, '2026-10-12').kind, 'flat')
    assert.equal(find(dust, '2026-10-12').pnl, 0)
    assert.equal(dayStats([day('2026-10-12', 0.1), day('2026-10-12', 0.2), day('2026-10-12', -0.3)]).greenDays, 0)
    assert.equal(dayStats([day('2026-10-12', 0.004)]).greenDays, 0, 'a day that rounds to 0.00 is neither')
    assert.equal(dayStats([day('2026-10-12', 0.006)]).greenDays, 1)
    assert.equal(dust.rate, '100%')
  })

  test('the week starts where the locale says', () => {
    const us = createFormatter({ locale: 'en-US', timeZone: 'UTC' })
    const vmUs = model({ today: TODAY, days: [] }, 'Tall', {}, us)
    // Sunday-first, Sunday and Saturday weekend: Monday to Friday either way, and the column holds the same days.
    assert.equal(vmUs.bands[0].weeks[5].cells[0].date, '2026-10-12')
    assert.equal(vmUs.bands[0].weeks[0].cells[0].date, '2026-09-07')
  })

  test('dates are read with toDay: a UTC-midnight string is its own date in any zone', () => {
    const ny = createFormatter({ locale: 'en-GB', timeZone: 'America/New_York' })
    const vmNy = model({ today: TODAY, days: [day('2026-10-12T00:00:00Z', 100)] }, 'Tall', {}, ny)
    assert.equal(find(vmNy, '2026-10-12').kind, 'pos')
    assert.equal(find(vmNy, '2026-10-11'), undefined)
    // An instant lands on the day the trader saw: 03:00 IST on the 13th is still the 12th at 21:30 UTC.
    const kolkata = createFormatter({ locale: 'en-GB', timeZone: 'Asia/Kolkata' })
    const vmIn = model({ today: TODAY, days: [day('2026-10-12T21:30:00Z', 100)] }, 'Tall', {}, kolkata)
    assert.equal(find(vmIn, '2026-10-13').kind, 'pos')
  })

  test('today defaults to the clock\'s day, in the formatter\'s zone', () => {
    const late = { ...ctx, now: Date.UTC(2026, 9, 16, 20) }
    const kolkata = createFormatter({ locale: 'en-GB', timeZone: 'Asia/Kolkata' })
    // 20:00Z is 01:30 on Saturday the 17th in Kolkata, so Friday 16 is the last drawn day and Saturday has none.
    const vmIn = P.calendarModel({ days: [] }, 'Tall', { ...late, fmt: kolkata })
    assert.equal(vmIn.bands[0].weeks[5].cells.at(-1).date, '2026-10-16')
    assert.equal(model({ days: [], today: 'junk' }, 'Tall').bands[0].weeks[5].cells.at(-1).date, '2026-10-16')
  })

  test('rows it cannot read are dropped and counted', () => {
    const bad = model({ today: TODAY, days: [day('2026-10-12', 5), day('nope', 5), day('2026-10-13', 'abc'), null, { pnl: 4 }] }, 'Tall')
    assert.equal(bad.dropped, 4)
    assert.equal(bad.tradingDays, 1)
    assert.equal(model({ today: TODAY, days: 'x' }, 'Tall').dropped, 0)
  })
})

describe('months and years', () => {
  test('a month names the first column that starts it, and a January names its year', () => {
    const vm = model({ days: [], today: '2027-01-15' }, 'M')
    const names = vm.bands[0].weeks.map((w) => w.month)
    assert.ok(names.includes('Jan 2027'))
    assert.ok(names.includes('Dec') || names.includes('Nov'))
    assert.equal(names.filter((n) => n.startsWith('Jan')).length, 1)
  })

  test('two names are never within four columns of each other', () => {
    for (const today of ['2026-10-16', '2027-01-04', '2026-03-31']) {
      const vm = model({ days: [], today }, 'Banner')
      const at = vm.bands[0].weeks.map((w, i) => (w.month ? i : -1)).filter((i) => i >= 0)
      for (let i = 1; i < at.length; i++) assert.ok(at[i] - at[i - 1] >= 4, `${today}: ${at}`)
      assert.ok(at.length >= 11, `${today}: a year names about twelve months`)
    }
  })

  test('every month in a year view has its name, whatever the day it ends on, and a January names its year only where it fits', () => {
    for (const today of ['2026-01-10', '2026-02-20', '2026-10-16', '2027-01-04']) {
      const vm = model({ days: [], today }, 'Banner')
      const weeks = vm.bands[0].weeks
      const names = weeks.map((w) => w.month).filter(Boolean).map((n) => n.slice(0, 3))
      // Every month that has a first week in the grid is named, except one that the first column cuts short.
      const months = new Set(weeks.slice(1).map((w, i) => (w.cells[0].date.slice(0, 7) !== weeks[i].cells[0].date.slice(0, 7) ? w.cells[0].date.slice(0, 7) : null)).filter(Boolean))
      assert.ok(names.length >= months.size, `${today}: ${names}`)
    }
    const names = model({ days: [], today: '2026-01-10' }, 'Banner').bands[0].weeks.map((w) => w.month).filter(Boolean)
    assert.ok(names.includes('Feb'), names.join())
    assert.ok(names.includes('Jan'), names.join())
  })

  test('across a year boundary the cells run in date order with no gap or repeat', () => {
    const vm = model({ days: [], today: '2027-01-08' }, 'Banner')
    const dates = cells(vm).map((c) => c.date)
    assert.deepEqual([...dates].sort(), dates)
    assert.equal(new Set(dates).size, dates.length)
    assert.ok(dates.includes('2026-12-31') && dates.includes('2027-01-01'))
    assert.ok(!dates.includes('2027-01-02'))
  })

  test('a year of days from a year ago is in view, whichever weekday today is', () => {
    for (const today of ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']) {
      const drawn = new Set(cells(model({ days: [], today }, 'Banner')).map((c) => c.date))
      // Every weekday of the last 365 days has a cell.
      for (let back = 0; back < 365; back++) {
        const date = new Date(Date.parse(today) - back * 86400000).toISOString().slice(0, 10)
        const dow = new Date(`${date}T00:00:00Z`).getUTCDay()
        if (dow !== 0 && dow !== 6) assert.ok(drawn.has(date), `${today}: ${date}`)
      }
    }
  })
})

describe('figures and words', () => {
  const data = { today: TODAY, days: [day('2026-10-12', 1240), day('2026-10-13', -310.5), day('2026-10-14', 620), day('2026-10-09', -90)] }

  test('net, best, worst and the green rate', () => {
    const vm = model(data, 'M')
    assert.equal(vm.net, '+1,459.50')
    assert.equal(vm.best, '+1,240.00')
    assert.equal(vm.worst, '−310.50')
    assert.equal(vm.rate, '50%')
    assert.equal(vm.tradingDays, 4)
    assert.equal(vm.netClass, 'pos')
    assert.equal(vm.worstClass, 'neg')
    assert.equal(vm.netArrow, '▲')
    assert.equal(vm.worstArrow, '▼')
  })

  test('the grid is named by a summary: the range, the best day, the worst day and the net', () => {
    const vm = model(data, 'Tall')
    assert.equal(vm.chartLabel, 'Daily P&L calendar, 7 Sept 2026 to 16 Oct 2026: best day Mon 12 Oct, +1,240.00, worst day Tue 13 Oct, −310.50, net +1,459.50')
  })

  test('the tile is named by its net and the days behind it', () => {
    assert.equal(model(data, 'M').ariaLabel, 'Daily P&L calendar, net +1,459.50 over 4 trading days')
    assert.equal(model({ today: TODAY, days: [day('2026-10-12', 5)] }, 'M').ariaLabel, 'Daily P&L calendar, net +5.00 over 1 trading day')
  })

  test('no entry in view: dashes, an empty summary and an empty name', () => {
    const vm = model({ days: [], today: TODAY }, 'M')
    assert.equal(vm.empty, true)
    assert.deepEqual([vm.best, vm.worst, vm.rate], ['—', '—', '—'])
    assert.equal(vm.net, '0.00')
    assert.equal(vm.netArrow, '')
    assert.match(vm.chartLabel, /: no trading days$/)
    assert.equal(vm.ariaLabel, 'Daily P&L calendar, no trading days')
    assert.equal(model(null, 'M').empty, true)
    assert.equal(model(undefined, 'Tall').empty, true)
  })

  test('only entries inside the window count: an older year is out of the totals', () => {
    const vm = model({ today: TODAY, days: [day('2019-05-01', 9999), day('2026-10-12', 10)] }, 'Tall')
    assert.equal(vm.net, '+10.00')
  })

  test('a host\'s own messages reach every string', () => {
    const de = createMessages({ 'calendar.cell': '{date}: {value}', 'calendar.cellNone': '{date}: kein Eintrag', 'calendar.net': 'Netto' })
    const vm = P.calendarModel(data, 'Tall', { ...ctx, t: de })
    assert.equal(find(vm, '2026-10-12').name, 'Mon 12 Oct: +1,240.00')
    assert.equal(find(vm, '2026-10-15').name, 'Thu 15 Oct: kein Eintrag')
  })

  test('the focus starts on today, or the last day drawn up to it', () => {
    assert.equal(model(data, 'M').focusDate, '2026-10-16')
    assert.equal(model({ days: [], today: '2026-10-14' }, 'M').focusDate, '2026-10-14')
    assert.equal(model({ days: [], today: '2026-10-18' }, 'M').focusDate, '2026-10-16')
  })

  test('row labels are the weekday names the rows sit on', () => {
    assert.deepEqual(model(data, 'M').rowLabels, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'])
    const us = createFormatter({ locale: 'en-US', timeZone: 'UTC' })
    assert.deepEqual(model(data, 'M', {}, us).rowLabels, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'])
  })

  test('every English string is a message: a pseudo-locale leaves no literal in a name or summary', () => {
    const keys = Object.keys(EN).filter((k) => k.startsWith('calendar.'))
    const pseudo = createMessages(Object.fromEntries(keys.map((k) => [k, `«${k}»`])))
    const vm = P.calendarModel(data, 'Tall', { ...ctx, t: pseudo })
    for (const c of cells(vm)) assert.match(c.name, /«calendar\./, c.date)
    assert.match(vm.chartLabel, /^Daily P&L calendar, .*«calendar\.chartLabel»|«calendar\.chartLabel»/)
    assert.match(vm.ariaLabel, /«calendar\.aria»/)
  })
})

describe('the keyboard', () => {
  let vm, phone
  before(() => {
    vm = model({ days: [], today: TODAY }, 'M')
    phone = model({ days: [], today: TODAY }, 'Banner', { phone: true })
  })
  const key = (b, date, k, ctrl) => P.moveFocus(b.bands, date, k, ctrl)

  test('arrows step by a day and by a week', () => {
    assert.equal(key(vm, '2026-10-14', 'ArrowDown'), '2026-10-15')
    assert.equal(key(vm, '2026-10-14', 'ArrowUp'), '2026-10-13')
    assert.equal(key(vm, '2026-10-14', 'ArrowLeft'), '2026-10-07')
    assert.equal(key(vm, '2026-10-14', 'ArrowRight'), '2026-10-14', 'the last week is an edge')
    assert.equal(key(vm, '2026-10-07', 'ArrowRight'), '2026-10-14')
  })

  test('the edges stop: they do not wrap', () => {
    assert.equal(key(vm, '2026-10-12', 'ArrowUp'), '2026-10-12')
    assert.equal(key(vm, '2026-10-16', 'ArrowDown'), '2026-10-16')
    const first = vm.bands[0].weeks[0].cells[2].date
    assert.equal(key(vm, first, 'ArrowLeft'), first)
  })

  test('Home and End go to the ends of the row, with Control to the ends of the grid', () => {
    const first = vm.bands[0].weeks[0].cells
    assert.equal(key(vm, '2026-10-14', 'Home'), first[2].date)
    assert.equal(key(vm, first[2].date, 'End'), '2026-10-14')
    assert.equal(key(vm, '2026-10-14', 'Home', true), first[0].date)
    assert.equal(key(vm, '2026-10-14', 'End', true), '2026-10-16')
  })

  test('Right from the last week of the first band is the first week of the second, and Left goes back; Up and Down stop at the weekdays', () => {
    const [a, b] = phone.bands
    assert.equal(key(phone, a.weeks[26].cells[2].date, 'ArrowRight'), b.weeks[0].cells[2].date)
    assert.equal(key(phone, b.weeks[0].cells[2].date, 'ArrowLeft'), a.weeks[26].cells[2].date)
    assert.equal(key(phone, a.weeks[3].cells[4].date, 'ArrowDown'), a.weeks[3].cells[4].date)
    assert.equal(key(phone, b.weeks[3].cells[0].date, 'ArrowUp'), b.weeks[3].cells[0].date)
    // Home and End stay in the band; Control reaches the ends of the year.
    assert.equal(key(phone, b.weeks[3].cells[1].date, 'Home'), b.weeks[0].cells[1].date)
    assert.equal(key(phone, a.weeks[3].cells[1].date, 'End'), a.weeks[26].cells[1].date)
    assert.equal(key(phone, a.weeks[0].cells[0].date, 'End', true), b.weeks[25].cells[4].date)
  })

  test('Page Down and Page Up move to the same weekday in the next and the previous month', () => {
    const month = model({ days: [], today: '2026-10-16' }, 'Banner')
    assert.equal(key(month, '2026-08-13', 'PageDown'), '2026-09-03')
    assert.equal(key(month, '2026-09-03', 'PageUp'), '2026-08-06')
    // At the end of the grid Page Down lands on the last week; at the start Page Up on the first.
    assert.equal(key(month, '2026-10-14', 'PageDown'), '2026-10-14')
    const first = month.bands[0].weeks[0].cells[2].date
    assert.equal(key(month, first, 'PageUp'), first)
    // Across a year, and across the phone's two bands.
    const phoneYear = model({ days: [], today: '2027-02-12' }, 'Banner', { phone: true })
    assert.equal(key(phoneYear, '2026-12-17', 'PageDown'), '2027-01-07')
    assert.equal(key(phoneYear, '2027-01-07', 'PageUp'), '2026-12-03')
  })

  test('a key it does not take, and a date that is not in the grid, give null', () => {
    assert.equal(key(vm, '2026-10-14', 'a'), null)
    assert.equal(key(vm, '2026-10-14', 'Enter'), null)
    assert.equal(key(vm, '1999-01-01', 'ArrowDown'), null)
  })
})

// ── update(): what the DOM sees ──────────────────────────────────────────
// update() is driven with stand-in nodes, the way the sibling widgets' tests do; the build of the grid and the
// roving keyboard are DOM-bound and belong to test/browser/calendar.spec.mjs.

class FakeNode {
  constructor(date) {
    this.writes = 0
    this._text = ''
    this.attrs = new Map(date ? [['data-d', date]] : [])
    this.vars = new Map()
    this.style = {
      getPropertyValue: (name) => this.vars.get(name) || '',
      // Counts a change only: update() sets the figure-width property each time, and the browser ignores an equal value.
      setProperty: (name, value) => {
        if (this.vars.get(name) !== String(value)) this.writes++
        this.vars.set(name, String(value))
      },
    }
  }
  get textContent() {
    return this._text
  }
  set textContent(v) {
    this.writes++
    this._text = v
  }
  getAttribute(k) {
    return this.attrs.has(k) ? this.attrs.get(k) : null
  }
  setAttribute(k, v) {
    this.writes++
    this.attrs.set(k, String(v))
  }
  toggleAttribute(k, force) {
    const had = this.attrs.has(k)
    if (Boolean(force) !== had) this.writes++
    if (force) this.attrs.set(k, '')
    else this.attrs.delete(k)
    return Boolean(force)
  }
  focus() {}
}

function fakeCalendar(vm) {
  const nodes = new Map()
  const w = Object.create(P.TsPnlCalendar.prototype)
  Object.defineProperty(w, 't', { value: t })
  w.$ = (sel) => {
    if (!nodes.has(sel)) nodes.set(sel, new FakeNode())
    return nodes.get(sel)
  }
  w.flash = () => {}
  w._cells = new Map()
  // The build is DOM work; here it hands over one stand-in node for each cell and for each month and weekday name.
  const months = vm.bands.flatMap((b) => b.weeks).map(() => new FakeNode())
  const names = vm.rowLabels.map(() => new FakeNode())
  w._build = () => {
    for (const c of cells(vm)) if (!w._cells.has(c.date)) w._cells.set(c.date, new FakeNode(c.date))
    return false
  }
  const grid = w.$(`[data-k="grid"]`)
  grid.querySelectorAll = (sel) => (sel === '.mo' ? months : sel === '.wl' ? names : [])
  return { w, months, names, node: (key) => w.$(`[data-k="${key}"]`), total: () => [...nodes.values(), ...w._cells.values()].reduce((n, node) => n + node.writes, 0) }
}

describe('update()', () => {
  const data = { days: [day('2026-10-14', 1240), day('2026-10-15', -300), day('2026-10-13', 0)], today: TODAY }

  test('writes the figures, the cells and the weekday names into the nodes', () => {
    const vm = model(data, 'M')
    const { w, node, names } = fakeCalendar(vm)
    w.update(vm, 'M')
    assert.equal(node('label').textContent, vm.label)
    assert.equal(node('netV').textContent, vm.net)
    assert.equal(node('netAr').textContent, vm.netArrow)
    assert.match(node('net').getAttribute('class'), /pos|neg/)
    assert.equal(node('rateV').textContent, vm.rate)
    assert.equal(node('bestV').textContent, vm.best)
    assert.equal(node('summary').textContent, vm.chartLabel)
    assert.equal(node('grid').getAttribute('aria-label'), vm.label)
    assert.deepEqual(names.map((n) => n.textContent), vm.rowLabels)
    const win = w._cells.get('2026-10-14')
    assert.equal(win.getAttribute('class'), 'c pos')
    assert.equal(win.getAttribute('aria-label'), find(vm, '2026-10-14').name)
    assert.match(win.style.getPropertyValue('--s'), /%$/)
    assert.equal(w._cells.get('2026-10-15').getAttribute('class'), 'c neg')
    assert.equal(w._cells.get('2026-10-16').getAttribute('tabindex'), '0', 'today holds the tab stop')
  })

  test('Tall leaves the best and worst day out; an empty month says so', () => {
    const vm = model({ days: [], today: TODAY }, 'Tall')
    const { w, node } = fakeCalendar(vm)
    w.update(vm, 'Tall')
    assert.equal(node('bestV').textContent, '')
    assert.equal(node('none').textContent, t('calendar.noDays'))
    assert.equal(node('none').getAttribute('hidden'), null)
  })

  test('an update that changes nothing writes nothing', () => {
    const vm = model(data, 'M')
    const { w, total } = fakeCalendar(vm)
    w.update(vm, 'M')
    const before = total()
    w.update(vm, 'M')
    assert.equal(total(), before)
  })
})
