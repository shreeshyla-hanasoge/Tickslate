import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createFormatter, configure, currentConfig, toNumber } from '../src/core/index.js'

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
