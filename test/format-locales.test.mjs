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
