import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createFormatter, configure, currentConfig } from '../src/core/index.js'

const inr = createFormatter({ locale: 'en-IN', currency: 'INR', timeZone: 'Asia/Kolkata' })
const MINUS = '−'

describe('money', () => {
  test('always carries a sign, with the true minus', () => {
    assert.equal(inr.money(1523.85), '+₹1,523.85')
    assert.equal(inr.money(-141), `${MINUS}₹141.00`)
  })

  test('zero, and values that round to zero, have no sign', () => {
    assert.equal(inr.money(0), '₹0.00')
    assert.equal(inr.money(-0.004), '₹0.00')
    assert.equal(inr.money(-0), '₹0.00')
  })

  test('uses lakh grouping for en-IN', () => {
    assert.equal(inr.money(152385), '+₹1,52,385.00')
  })

  test("sign: 'negative' drops the plus", () => {
    assert.equal(inr.money(82949.68, { sign: 'negative' }), '₹82,949.68')
    assert.equal(inr.money(-5, { sign: 'negative' }), `${MINUS}₹5.00`)
  })

  test('compact forms for tight sizes', () => {
    // ICU's exact compact text can differ between versions, so check the shape.
    assert.match(inr.money(1800, { compact: true }), /^\+₹1\.8\s?K$/)
    assert.match(inr.money(-3300, { compact: true }), new RegExp(`^${MINUS}₹3\\.3\\s?K$`))
    assert.match(inr.money(180000, { compact: true }), /^\+₹1\.8\s?L$/)
  })

  test('accepts numeric strings, as Laravel sends decimals', () => {
    assert.equal(inr.money('1240.5'), '+₹1,240.50')
  })

  test('shows a dash for anything that is not a number', () => {
    for (const v of [null, undefined, '', 'abc', NaN, Infinity, true, {}]) assert.equal(inr.money(v), '—')
  })

  test('without a currency, money is a plain signed number', () => {
    const plain = createFormatter({ locale: 'en-US' })
    assert.equal(plain.money(12.5), '+12.50')
  })

  test('decimals can be fixed', () => {
    assert.equal(inr.money(1523.85, { decimals: 0 }), '+₹1,524')
  })
})

describe('fit', () => {
  test('keeps the full form when it fits, else goes compact', () => {
    assert.equal(inr.fit(1523.85, 12), '+₹1,523.85')
    assert.match(inr.fit(152385.5, 10), /^\+₹1\.5\s?L$/)
  })
})

describe('numbers, prices and percents', () => {
  test('number signs only negatives by default', () => {
    assert.equal(inr.number(66), '66')
    assert.equal(inr.number(-50), `${MINUS}50`)
    assert.equal(inr.number(1.06, { decimals: 2 }), '1.06')
    assert.equal(inr.number(3, { sign: 'always' }), '+3')
  })

  test('price groups digits and keeps tick decimals', () => {
    assert.equal(inr.price(22512.4), '22,512.40')
    assert.equal(inr.price(5432.1, { decimals: 1 }), '5,432.1')
  })

  test('percent takes a ratio and signs it', () => {
    assert.equal(inr.percent(0.013), '+1.30%')
    assert.equal(inr.percent(-0.0042), `${MINUS}0.42%`)
    assert.equal(inr.percent(0), '0.00%')
    assert.equal(inr.percent(0.21, { decimals: 0, sign: 'negative' }), '21%')
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
    assert.equal(createFormatter().money(-141), `${MINUS}₹141.00`)
    // A formatter's own options still win.
    assert.equal(createFormatter({ currency: 'USD', locale: 'en-US' }).money(5), '+$5.00')
  } finally {
    configure({ locale: before.locale ?? '', currency: before.currency ?? '' })
  }
})
