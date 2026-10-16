import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createFormatter } from '../src/core/index.js'

const locales = ['en-IN', 'en-US', 'de-DE', 'fr-FR', 'de-CH', 'ja-JP', 'ar-EG', 'he-IL', 'fi-FI', 'sv-SE']

test('time, date, duration and fit work across the supported locale matrix', () => {
  const instant = Date.UTC(2026, 9, 12, 14, 15)
  const durationFormatter = typeof Intl.DurationFormat === 'function' ? Intl.DurationFormat : null
  const durationDescriptor = Object.getOwnPropertyDescriptor(Intl, 'DurationFormat')
  for (const locale of locales) {
    const fmt = createFormatter({ locale, currency: 'EUR', timeZone: 'Europe/Berlin', hourCycle: 'h12' })
    assert.equal(fmt.issues.length, 0, locale)
    const timeOptions = { timeZone: 'Europe/Berlin', hour: 'numeric', minute: '2-digit', hourCycle: 'h12' }
    assert.equal(fmt.time(instant), new Intl.DateTimeFormat(locale, timeOptions).format(instant), locale)
    const dateOptions = { timeZone: 'UTC', calendar: 'gregory', day: 'numeric', month: 'short', year: 'numeric' }
    assert.equal(fmt.date('2026-10-12', { style: 'medium' }), new Intl.DateTimeFormat(locale, dateOptions).format(Date.UTC(2026, 9, 12, 12)), locale)
    const instantOptions = { timeZone: 'Europe/Berlin', calendar: 'gregory', month: 'short', year: 'numeric' }
    assert.equal(fmt.date(instant, { style: 'monthYear' }), new Intl.DateTimeFormat(locale, instantOptions).format(instant), locale)
    if (durationFormatter) {
      const expected = new durationFormatter(locale, { style: 'narrow' }).format({ hours: 2, minutes: 30 })
      assert.equal(fmt.duration(9_000_000, { style: 'words' }), expected, `${locale} native duration`)
    }
    const formatted = fmt.money(123456.78)
    const budget = [...formatted.replace(/[\u200e\u200f\u061c\u2066-\u2069]/g, '')].length
    assert.equal(fmt.fit(123456.78, budget), formatted, locale)
  }
  try {
    Object.defineProperty(Intl, 'DurationFormat', { configurable: true, writable: true, value: undefined })
    for (const locale of locales) {
      const fmt = createFormatter({ locale })
      const parts = [
        new Intl.NumberFormat(locale, { style: 'unit', unit: 'hour', unitDisplay: 'narrow', maximumFractionDigits: 0 }).format(2),
        new Intl.NumberFormat(locale, { style: 'unit', unit: 'minute', unitDisplay: 'narrow', maximumFractionDigits: 0 }).format(30),
      ]
      const expected = new Intl.ListFormat(locale, { style: 'narrow', type: 'unit' }).format(parts)
      assert.equal(fmt.duration(9_000_000, { style: 'words' }), expected, `${locale} fallback duration`)
    }
  } finally {
    if (durationDescriptor) Object.defineProperty(Intl, 'DurationFormat', durationDescriptor)
    else delete Intl.DurationFormat
  }
  assert.equal(createFormatter({ locale: 'en-US', timeZone: 'UTC', hourCycle: 'h12' }).time(instant), '2:15 PM')
})

// Literal expectations: the matrix test above recomputes its answers with the
// same Intl calls as the implementation, so it cannot catch a shared mistake.
const withDurationFormat = (present, run) => {
  const descriptor = Object.getOwnPropertyDescriptor(Intl, 'DurationFormat')
  try {
    if (present && !descriptor) return
    if (!present) delete Intl.DurationFormat
    run()
  } finally {
    if (descriptor) Object.defineProperty(Intl, 'DurationFormat', descriptor)
  }
}

for (const present of [true, false]) {
  const path = present ? 'Intl.DurationFormat' : 'fallback'
  test(`English word durations keep their pre-locale output (${path})`, () => {
    withDurationFormat(present, () => {
      const fmt = createFormatter({ locale: 'en-US' })
      const words = (ms) => fmt.duration(ms, { style: 'words' })
      assert.equal(words(0), '0s')
      assert.equal(words(-5000), '0s')
      assert.equal(words(9_000), '9s')
      assert.equal(words(59_000), '59s')
      assert.equal(words(48 * 60_000), '48m')
      assert.equal(words((3 * 3600 + 48 * 60) * 1000), '3h 48m')
      assert.equal(words(25 * 3600_000), '25h')
    })
  })

  test(`non-English word durations are localized and never empty (${path})`, () => {
    withDurationFormat(present, () => {
      const long = createFormatter({ locale: 'de-DE' }).duration(9_000_000, { style: 'words' })
      assert.notEqual(long, '2h 30m')
      assert.match(long, /2/)
      assert.match(long, /30/)
      for (const locale of locales) {
        const zero = createFormatter({ locale }).duration(0, { style: 'words' })
        assert.ok(zero.length > 0, `${locale} zero duration is not empty`)
        assert.match(zero, /[0٠۰]/, `${locale} zero duration shows a zero`)
      }
    })
  })
}

test('date outputs have literal expectations', () => {
  assert.equal(createFormatter({ locale: 'de-DE' }).date('2024-03-05'), '5. März 2024')
  // fa-IR defaults to the Persian calendar (year 1402); the formatter pins Gregorian.
  const persian = createFormatter({ locale: 'fa-IR' }).date('2024-03-05')
  assert.match(persian, /۲۰۲۴/)
  assert.doesNotMatch(persian, /۱۴۰۲/)
})
