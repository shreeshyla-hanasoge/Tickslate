import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createFormatter, configure, currentConfig, onConfigure, toNumber, createCalendar } from '../src/core/index.js'

const inr = createFormatter({ locale: 'en-IN', currency: 'INR', timeZone: 'Asia/Kolkata' })
const MINUS = '−'

describe('money', () => {
  test('always carries a sign, with the true minus', () => {
    assert.equal(inr.money(2185.65), '+₹2,185.65')
    assert.equal(inr.money(-263), `${MINUS}₹263.00`)
  })

  test('zero, and values that round to zero, have no sign', () => {
    assert.equal(inr.money(0), '₹0.00')
    assert.equal(inr.money(-0.004), '₹0.00')
    assert.equal(inr.money(-0), '₹0.00')
  })

  test('uses lakh grouping for en-IN', () => {
    assert.equal(inr.money(274936), '+₹2,74,936.00')
  })

  test("sign: 'negative' drops the plus", () => {
    assert.equal(inr.money(64318.27, { sign: 'negative' }), '₹64,318.27')
    assert.equal(inr.money(-5, { sign: 'negative' }), `${MINUS}₹5.00`)
  })

  test('compact forms for tight sizes', () => {
    // ICU's exact compact text can differ between versions, so check the shape.
    assert.match(inr.money(2700, { compact: true }), /^\+₹2\.7\s?K$/)
    assert.match(inr.money(-4600, { compact: true }), new RegExp(`^${MINUS}₹4\\.6\\s?K$`))
    assert.match(inr.money(270000, { compact: true }), /^\+₹2\.7\s?L$/)
  })

  test('accepts numeric strings, as Laravel sends decimals', () => {
    assert.equal(inr.money('1375.5'), '+₹1,375.50')
  })

  test('shows a dash for anything that is not a number', () => {
    for (const v of [null, undefined, '', 'abc', NaN, Infinity, true, {}]) assert.equal(inr.money(v), '—')
  })

  test('without a currency, money is a plain signed number', () => {
    const plain = createFormatter({ locale: 'en-US' })
    assert.equal(plain.money(12.5), '+12.50')
  })

  test('decimals can be fixed', () => {
    assert.equal(inr.money(2185.65, { decimals: 0 }), '+₹2,186')
  })
})

describe('fit', () => {
  test('keeps the full form when it fits, else goes compact', () => {
    assert.equal(inr.fit(2185.65, 12), '+₹2,185.65')
    assert.match(inr.fit(274936.5, 10), /^\+₹2\.7\s?L$/)
  })
})

describe('fit styles', () => {
  const us = createFormatter({ locale: 'en-US', currency: 'USD' })
  const de = createFormatter({ locale: 'de-DE', currency: 'EUR' })

  test('money goes straight from full to compact; other styles drop decimals first', () => {
    assert.equal(us.fit(2185.65, 7), '+$2.2K')
    assert.equal(us.fit(2185.65, 20), '+$2,185.65')
    assert.equal(us.fit(1234.56, 6, { style: 'number' }), '1,235')
  })

  test('number and percent styles', () => {
    assert.equal(us.fit(1234567.891, 9, { style: 'number' }), '1,234,568')
    assert.equal(us.fit(1234567.891, 5, { style: 'number' }), '1.2M')
    assert.equal(us.fit(0.123456, 5, { style: 'percent' }), '+12%')
    assert.equal(us.fit(0.5, 3, { style: 'percent', sign: 'negative' }), '50%')
    assert.match(de.fit(1234567, 8, { style: 'number' }), /^1,2\s?Mio\.$/)
    assert.equal(de.fit(0.5, 20, { style: 'percent', sign: 'negative' }), '50,00\u00a0%')
  })

  test('never returns a compact form that is not shorter', () => {
    assert.equal(us.fit(5, 1, { style: 'number' }), '5')
    assert.equal(us.fit(999, 1, { style: 'number' }), '999')
  })
})

describe('compact numbers and units', () => {
  const us = createFormatter({ locale: 'en-US' })
  const de = createFormatter({ locale: 'de-DE' })

  test('number compact', () => {
    assert.equal(us.number(1200000, { compact: true }), '1.2M')
    assert.match(de.number(1200000, { compact: true }), /^1,2\s?Mio\.$/)
  })

  test('sanctioned units go through Intl', () => {
    assert.equal(us.unit(182, 'millisecond'), '182 ms')
    assert.match(de.unit(182, 'millisecond'), /^182\sms$/)
    assert.equal(us.unit(1500, 'megabyte', { decimals: 1 }), '1,500.0 MB')
    assert.match(us.unit(1200000, 'byte', { compact: true }), /^1\.2M\s?byte$/)
    assert.equal(us.unit(-4, 'second'), `${MINUS}4 sec`)
    assert.match(de.unit(1200, 'kilometer-per-hour'), /^1\.200\s?km\/h$/)
    assert.equal(us.unit(12, 'percent'), '12%')
  })

  test('other units are appended literally', () => {
    assert.equal(us.unit(3, 'seats'), '3 seats')
    assert.equal(de.unit(1234.5, 'seats', { decimals: 1 }), '1.234,5 seats')
    assert.equal(us.unit(1200000, 'users', { compact: true }), '1.2M users')
    assert.match(de.unit(1200000, 'Nutzer', { compact: true }), /^1,2\s?Mio\. Nutzer$/)
    assert.equal(us.unit(2, 'second-per-banana'), '2 second-per-banana')
    assert.equal(us.unit('x', 'ms'), '—')
  })
})

describe('percent takes a fraction', () => {
  test('sign defaults to always', () => {
    const us = createFormatter({ locale: 'en-US' })
    assert.equal(us.percent(0.12), '+12.00%')
    assert.equal(us.percent(0.12, { sign: 'negative' }), '12.00%')
    assert.equal(createFormatter({ locale: 'de-DE' }).percent(0.12, { sign: 'negative' }), '12,00\u00a0%')
  })
})

describe('numbers, prices and percents', () => {
  test('number signs only negatives by default', () => {
    assert.equal(inr.number(66), '66')
    assert.equal(inr.number(-50), `${MINUS}50`)
    assert.equal(inr.number(1.38, { decimals: 2 }), '1.38')
    assert.equal(inr.number(3, { sign: 'always' }), '+3')
  })

  test('price groups digits and keeps tick decimals', () => {
    assert.equal(inr.price(23847.6), '23,847.60')
    assert.equal(inr.price(5432.1, { decimals: 1 }), '5,432.1')
  })

  test('percent takes a ratio and signs it', () => {
    assert.equal(inr.percent(0.027), '+2.70%')
    assert.equal(inr.percent(-0.0058), `${MINUS}0.58%`)
    assert.equal(inr.percent(0), '0.00%')
    assert.equal(inr.percent(0.43, { decimals: 0, sign: 'negative' }), '43%')
  })
})

describe('time and duration', () => {
  const t = Date.UTC(2026, 9, 12, 6, 12, 20) // 11:42:20 IST

  test('time is 24-hour in the configured zone', () => {
    assert.equal(inr.time(t), '11:42')
    assert.equal(inr.time(t, { seconds: true }), '11:42:20')
    assert.equal(createFormatter({ locale: 'en-GB', timeZone: 'America/New_York' }).time(t), '02:12')
  })

  test('duration as a clock or in words', () => {
    assert.equal(inr.duration(160000), '2:40')
    assert.equal(inr.duration(3725000), '1:02:05')
    assert.equal(inr.duration(13680000, { style: 'words' }), '3h 48m')
    assert.equal(inr.duration(7200000, { style: 'words' }), '2h')
    assert.equal(inr.duration(160000, { style: 'words' }), '2m')
    assert.equal(inr.duration(9000, { style: 'words' }), '9s')
    assert.equal(inr.duration(-5000), '0:00')
  })

  test('hour cycles, Gregorian dates, and live configure notifications', () => {
    const instant = Date.UTC(2026, 9, 12, 14, 15)
    assert.equal(createFormatter({ locale: 'en-US', timeZone: 'UTC', hourCycle: 'h12' }).time(instant), '2:15 PM')
    assert.equal(createFormatter({ locale: 'en-US', timeZone: 'UTC' }).time(instant), '14:15')
    assert.match(createFormatter({ locale: 'en-US', timeZone: 'UTC', hourCycle: 'auto' }).time(instant), /AM|PM/)
    const utc = createFormatter({ locale: 'en-US', timeZone: 'America/Los_Angeles' })
    assert.equal(utc.date('2026-10-12', { style: 'medium' }), 'Oct 12, 2026')
    assert.equal(utc.date('2026-02-30'), '—')
    assert.equal(utc.date('March 5, 2026'), '—')
    assert.equal(utc.date('0x10'), '—')
    assert.equal(utc.date('2026-10-12T00:00:00Z', { style: 'day' }), 'Oct 11')
    for (const style of ['constructor', 'toString', '__proto__']) assert.equal(utc.date('2026-10-12', { style }), utc.date('2026-10-12'))
    assert.equal(utc.date(instant, { style: 'monthYear' }), 'Oct 2026')
    assert.match(createFormatter({ locale: 'fa-IR' }).date('2026-10-12'), /۲۰۲۶|2026/)
    const persian = createFormatter({ locale: 'fa-IR-u-CA-persian', timeZone: 'UTC' })
    assert.equal(persian.date('2026-10-12'), new Intl.DateTimeFormat('fa-IR-u-CA-persian', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(Date.UTC(2026, 9, 12, 12)))
    const privateUse = createFormatter({ locale: 'th-TH-x-u-ca-gregory', timeZone: 'UTC' })
    assert.equal(privateUse.date('2026-10-12'), new Intl.DateTimeFormat('th-TH-x-u-ca-gregory', { timeZone: 'UTC', calendar: 'gregory', day: 'numeric', month: 'short', year: 'numeric' }).format(Date.UTC(2026, 9, 12, 12)))
    const before = currentConfig()
    const seen = []
    const off = onConfigure((config) => seen.push(config.hourCycle))
    try {
      configure({ hourCycle: 'h12' })
      assert.equal(seen.at(-1), 'h12')
    } finally {
      off()
      configure({ hourCycle: before.hourCycle || '' })
    }
  })

  test('duration fallback uses localized units and a unit list', () => {
    const descriptor = Object.getOwnPropertyDescriptor(Intl, 'DurationFormat')
    try {
      Object.defineProperty(Intl, 'DurationFormat', { configurable: true, value: undefined })
      assert.equal(createFormatter({ locale: 'en-US' }).duration(9_000_000, { style: 'words' }), '2h 30m')
      assert.match(createFormatter({ locale: 'de-DE' }).duration(9_000_000, { style: 'words' }), /Std|Stunden|h/)
    } finally {
      if (descriptor) Object.defineProperty(Intl, 'DurationFormat', descriptor)
      else delete Intl.DurationFormat
    }
  })
})

test('fit counts Unicode characters and ignores bidi controls', () => {
  const fmt = createFormatter({ locale: 'ar-EG', currency: 'EGP' })
  const value = fmt.money(123)
  assert.equal(fmt.fit(123, [...value.replace(/[\u200e\u200f\u061c\u2066-\u2069]/g, '')].length), value)
})

test('Intl formatter instances are reused for repeated calls', () => {
  const counts = { DateTimeFormat: 0, DurationFormat: 0, ListFormat: 0 }
  const names = ['DateTimeFormat', typeof Intl.DurationFormat === 'function' ? 'DurationFormat' : 'ListFormat']
  const saved = Object.fromEntries(names.map((name) => [name, Object.getOwnPropertyDescriptor(Intl, name)]))
  try {
    for (const name of names) {
      const Native = Intl[name]
      function Counted(...args) {
        counts[name]++
        return Reflect.construct(Native, args)
      }
      Counted.prototype = Native.prototype
      Object.setPrototypeOf(Counted, Native)
      Object.defineProperty(Intl, name, { configurable: true, writable: true, value: Counted })
    }
    const fmt = createFormatter({ locale: 'en-US', timeZone: 'UTC', hourCycle: 'auto' })
    const at = Date.UTC(2026, 9, 12, 14, 15)
    fmt.time(at)
    const timeCount = counts.DateTimeFormat
    fmt.time(at)
    assert.equal(counts.DateTimeFormat, timeCount)
    fmt.date('2026-10-12')
    const dateCount = counts.DateTimeFormat
    fmt.date('2026-10-13')
    assert.equal(counts.DateTimeFormat, dateCount)
    fmt.duration(9_000_000, { style: 'words' })
    const durationCount = counts[names[1]]
    fmt.duration(9_000_000, { style: 'words' })
    assert.equal(counts[names[1]], durationCount)
  } finally {
    for (const name of names) Object.defineProperty(Intl, name, saved[name])
  }
})

test('configure sets defaults for formatters made later', () => {
  const before = currentConfig()
  configure({ locale: 'en-IN', currency: 'INR' })
  try {
    assert.equal(createFormatter().money(-263), `${MINUS}₹263.00`)
    // A formatter's own options still win.
    assert.equal(createFormatter({ currency: 'USD', locale: 'en-US' }).money(5), '+$5.00')
  } finally {
    configure({ locale: before.locale ?? '', currency: before.currency ?? '' })
  }
})

describe('toNumber', () => {
  test('rejects what Number() would read but a decimal field never means', () => {
    for (const v of ['0x10', '0b1', '0o7', 'Infinity', '-Infinity', '', '  ', '1_000', '1,5', 'NaN', '1e999']) assert.ok(Number.isNaN(toNumber(v)), JSON.stringify(v))
  })

  test('still parses padded, signed, fractional and exponent strings', () => {
    assert.equal(toNumber(' 12 '), 12)
    assert.equal(toNumber('1e3'), 1000)
    assert.equal(toNumber('-1.5E-2'), -0.015)
    assert.equal(toNumber('+.5'), 0.5)
    assert.equal(toNumber('5.'), 5)
  })

  test('reads decimal-library objects through toNumber()', () => {
    assert.equal(toNumber({ toNumber: () => 12.5 }), 12.5)
    assert.ok(Number.isNaN(toNumber({ toNumber: () => Infinity })))
    assert.ok(Number.isNaN(toNumber({ toNumber: () => '5' })))
    assert.ok(Number.isNaN(toNumber({ toNumber() { throw new Error('boom') } })))
    assert.ok(Number.isNaN(toNumber({})))
    assert.ok(Number.isNaN(toNumber(null)))
    assert.ok(Number.isNaN(toNumber(true)))
  })

  test('formatters take decimal-library objects', () => {
    assert.equal(inr.money({ toNumber: () => 1375.5 }), '+₹1,375.50')
  })
})

describe('createFormatter validation', () => {
  test('valid options leave issues empty', () => {
    assert.deepEqual(inr.issues, [])
    assert.deepEqual(createFormatter().issues, [])
  })

  test('a bad currency falls back, is listed, and money() does not throw', () => {
    const f = createFormatter({ locale: 'en-IN', currency: 'RUPEE' })
    assert.equal(f.currency, undefined)
    assert.deepEqual(f.issues.map(({ option, value }) => ({ option, value })), [{ option: 'currency', value: 'RUPEE' }])
    assert.equal(typeof f.issues[0].message, 'string')
    assert.equal(f.money(5), '+5.00')
    const unknown = createFormatter({ currency: 'ZZZ' })
    assert.equal(typeof unknown.money(5), 'string')
  })

  test('a bad locale and a bad time zone fall back too', () => {
    const f = createFormatter({ locale: 'not a locale!', currency: 'INR', timeZone: 'Mars/Olympus' })
    assert.equal(f.locale, undefined)
    assert.equal(f.timeZone, undefined)
    assert.deepEqual(f.issues.map((i) => i.option), ['locale', 'timeZone'])
    assert.doesNotThrow(() => f.money(1))
    assert.doesNotThrow(() => f.time(0))
  })

  test('non-string options are issues, not exceptions', () => {
    const f = createFormatter({ locale: 5, currency: 978, timeZone: {} })
    assert.deepEqual(f.issues.map((i) => i.option), ['locale', 'currency', 'timeZone'])
  })

  test('falls back to the configure() default, then the runtime', () => {
    const before = currentConfig()
    try {
      configure({ currency: 'EUR', timeZone: 'Asia/Kolkata' })
      const f = createFormatter({ currency: 'nope', timeZone: 'Nowhere/Land' })
      assert.equal(f.currency, 'EUR')
      assert.equal(f.timeZone, 'Asia/Kolkata')
      assert.equal(f.issues.length, 2)
      // A bad configure() default is reported by the formatter that reaches for it.
      configure({ currency: 'XX' })
      const g = createFormatter()
      assert.equal(g.currency, undefined)
      assert.deepEqual(g.issues.map((i) => i.option), ['currency'])
    } finally {
      configure({ locale: before.locale || '', currency: before.currency || '', timeZone: before.timeZone || '' })
    }
  })

  test('makes no console calls', () => {
    const saved = {}
    const calls = []
    for (const m of ['log', 'warn', 'error', 'info', 'debug']) {
      saved[m] = console[m]
      console[m] = () => calls.push(m)
    }
    try {
      createFormatter({ locale: '!!', currency: 'x', timeZone: 'no' }).money(1)
    } finally {
      Object.assign(console, saved)
    }
    assert.deepEqual(calls, [])
  })
})

describe('ago', () => {
  const inFmt = createFormatter({ locale: 'en-IN' })
  const deFmt = createFormatter({ locale: 'de-DE' })
  const now = 1760000000000

  test('under 30 s returns just now or o.justNow', () => {
    assert.equal(inFmt.ago(now - 10000, now), 'just now')
    assert.equal(inFmt.ago(now - 29000, now), 'just now')
    assert.equal(inFmt.ago(now, now), 'just now')
    assert.equal(inFmt.ago(now + 5000, now), 'just now', 'a time ahead of now is fresh')
    assert.equal(inFmt.ago(now + 7 * 86400000, now), 'just now', 'however far ahead, never a negative age')
    assert.equal(inFmt.ago(now - 15000, now, { justNow: 'gerade eben' }), 'gerade eben')
  })

  test('from 30 s onward formats relative time in en-IN and de-DE', () => {
    // 45 seconds -> 1 minute
    assert.equal(inFmt.ago(now - 45000, now), '1 min ago')
    assert.equal(deFmt.ago(now - 45000, now), 'vor 1 Min.')

    // 2 minutes
    assert.equal(inFmt.ago(now - 120000, now), '2 min ago')
    assert.equal(deFmt.ago(now - 120000, now), 'vor 2 Min.')

    // 3 hours
    assert.equal(inFmt.ago(now - 3 * 3600000, now), '3 hr ago')
    assert.equal(deFmt.ago(now - 3 * 3600000, now), 'vor 3 Std.')

    // 2 days
    assert.equal(inFmt.ago(now - 2 * 86400000, now), '2 days ago')
    assert.equal(deFmt.ago(now - 2 * 86400000, now), 'vor 2 Tagen')
  })

  test('non-finite inputs return dash', () => {
    assert.equal(inFmt.ago(NaN, now), '—')
    assert.equal(inFmt.ago(now, NaN), '—')
    assert.equal(inFmt.ago(null, now), '—')
  })
})


// The page clock (RFC 0004 §11.4): the core stores the function and calls nothing but the calendar's default `now`.
describe('configure({ clock })', () => {
  const FROZEN = Date.UTC(2026, 9, 26, 5, 0)
  const warned = []
  const realWarn = console.warn
  const restore = () => {
    configure({ clock: null })
    console.warn = realWarn
  }
  const quiet = () => {
    warned.length = 0
    console.warn = (m) => warned.push(String(m))
  }

  test('is stored, returned by currentConfig(), and cleared by null', () => {
    quiet()
    try {
      assert.equal(currentConfig().clock, undefined)
      const clock = () => FROZEN
      configure({ clock })
      assert.equal(currentConfig().clock, clock)
      configure({ locale: 'en-IN' })
      assert.equal(currentConfig().clock, clock, 'another option leaves it alone')
      configure({ clock: null })
      assert.equal(currentConfig().clock, undefined)
      assert.deepEqual(warned, [])
    } finally {
      restore()
      configure({ locale: '' })
    }
  })

  test('only a function counts: anything else is ignored with one warning and clears nothing it should keep', () => {
    quiet()
    try {
      for (const bad of [5, '12:00', {}, true]) configure({ clock: bad })
      assert.equal(currentConfig().clock, undefined)
      assert.equal(warned.length, 1, 'once, however many')
      assert.match(warned[0], /clock/)
    } finally {
      restore()
    }
  })

  test('listeners hear of it, and the core calls the function only for the calendar\u2019s default now', () => {
    quiet()
    const seen = []
    const off = onConfigure((c) => seen.push(c.clock))
    let calls = 0
    const clock = () => (calls++, FROZEN)
    try {
      configure({ clock })
      assert.deepEqual(seen, [clock])
      createFormatter({ locale: 'en-IN', timeZone: 'Asia/Kolkata' }).time(FROZEN)
      assert.equal(calls, 0, 'formatting never reads it')
      createCalendar({ sessions: [{ id: 's', label: 'S', timeZone: 'Asia/Kolkata', days: [1, 2, 3, 4, 5], open: '09:15', close: '15:30' }] })
      assert.equal(calls, 1, 'createCalendar reads it once, for its default now')
      createCalendar({ sessions: [{ id: 's', label: 'S', timeZone: 'Asia/Kolkata', days: [1, 2, 3, 4, 5], open: '09:15', close: '15:30' }], now: FROZEN })
      assert.equal(calls, 1, 'a per-call now wins and the page clock is not read')
    } finally {
      off()
      restore()
    }
  })

  test('a pretend clock makes calendar.issues deterministic', () => {
    quiet()
    const spec = { sessions: [{ id: 's', label: 'S', timeZone: 'UTC', days: [1, 2, 3, 4, 5], open: '09:00', close: '17:00' }], holidays: { s: ['2026-11-10'] } }
    try {
      configure({ clock: () => Date.UTC(2026, 10, 1) })
      assert.match(createCalendar(spec).issues[0].message, /9 days from now/)
      configure({ clock: () => Date.UTC(2026, 11, 1) })
      assert.match(createCalendar(spec).issues[0].message, /21 days ago/)
    } finally {
      restore()
    }
  })

  test('fmt.ago still takes now as an argument', () => {
    quiet()
    try {
      configure({ clock: () => 0 })
      assert.equal(inr.ago(FROZEN - 120000, FROZEN), '2 min ago')
    } finally {
      restore()
    }
  })
})
