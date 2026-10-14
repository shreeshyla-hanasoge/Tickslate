/**
 * Instants and calendar days from the shapes real backends send (RFC 0002
 * §4.1): epoch seconds or milliseconds, Date objects, ISO 8601 strings and
 * numeric strings. Nothing here guesses silently: what can't be read is NaN
 * or null, so a widget can count it as dropped.
 */

import { toNumber } from './format.js'
import { localDate } from './zone.js'

// Below this a number is seconds. 1e11 ms is March 1973 and 1e11 s is the
// year 5138, so real data lands on the right side of it either way.
const SECONDS_BELOW = 1e11
// The span a Date can hold; beyond it Intl throws instead of formatting.
const MAX_MS = 8.64e15

// Shapes Date.parse is trusted with. Free text such as "March 5" parses in
// some engines and not others, so it is refused rather than read differently
// per browser.
const ISO = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}(?::?\d{2})?)?)?$/i
const DAY = /^\d{4}-\d{2}-\d{2}$/
const UTC_MIDNIGHT = /^(\d{4}-\d{2}-\d{2})T00:00(?::00(?:\.0+)?)?(?:Z|[+-]00(?::?00)?)$/i

const fromNumber = (n) => {
  if (!Number.isFinite(n)) return NaN
  const ms = Math.abs(n) >= SECONDS_BELOW ? n : n * 1000
  return Math.abs(ms) <= MAX_MS ? ms : NaN
}

/** An instant in ms since the epoch, or NaN. */
export function toTime(v) {
  if (typeof v === 'number') return fromNumber(v)
  if (v instanceof Date) return fromNumber(v.getTime())
  if (typeof v !== 'string') return NaN
  const s = v.trim()
  const n = toNumber(s)
  if (Number.isFinite(n)) return fromNumber(n)
  const m = ISO.exec(s)
  if (!m) return NaN
  // Not every engine reads six fractional digits (Laravel sends microseconds),
  // a space for the T, or an offset without its colon, so say it one way.
  let iso = m[1]
  if (m[2]) {
    const clock = m[2].replace(/(\.\d{3})\d+/, '$1')
    let zone = m[3] || ''
    if (/^[+-]\d{2}$/.test(zone)) zone += ':00'
    else if (/^[+-]\d{4}$/.test(zone)) zone = `${zone.slice(0, 3)}:${zone.slice(3)}`
    iso += `T${clock}${zone.toUpperCase()}`
  }
  return fromNumber(Date.parse(iso))
}

/** A calendar day 'YYYY-MM-DD' in `timeZone`, or null. */
export function toDay(v, timeZone = 'UTC') {
  if (typeof v === 'string') {
    const s = v.trim()
    if (DAY.test(s)) return s
    // A backend that serialised a plain date as an instant at UTC midnight
    // meant that date, whatever zone the viewer is in.
    const m = UTC_MIDNIGHT.exec(s)
    if (m) return m[1]
  }
  const t = toTime(v)
  return Number.isFinite(t) ? localDate(t, timeZone) : null
}
