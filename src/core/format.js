import { toTime } from './time.js'

/**
 * Number, money, percent, time and duration formatting (RFC 0001 §5).
 *
 * Everything goes through Intl, so lakh grouping for en-IN, or a comma
 * decimal for de-DE, comes from the platform rather than from code here.
 * What Tickslate adds on top is the trading conventions: money carries its
 * sign, negatives use the true minus sign (U+2212), and a zero has no sign.
 */

const MINUS = '−'

let defaults = {}
// Nothing is registered until a host or a mounted widget asks, so importing the core has no effect.
const listeners = new Set()

/**
 * Sets the default locale, currency and time zone for formatters made without
 * their own, and the messages every widget reads (null clears them). Whoever
 * subscribed with onConfigure() hears about every call.
 */
export function configure(options = {}) {
  defaults = { ...defaults, ...pick(options) }
  if (options.messages !== undefined) {
    const m = options.messages
    if (m && typeof m === 'object') defaults.messages = m
    else delete defaults.messages
  }
  // A copy, so a listener that subscribes or unsubscribes while being called does not skip another;
  // one that was unsubscribed in the meantime is not called.
  for (const entry of [...listeners]) {
    if (!listeners.has(entry)) continue
    try {
      entry.fn(currentConfig())
    } catch (err) {
      // One listener's failure must not stop the others or the configure() call; the host still hears of it.
      queueMicrotask(() => {
        throw err
      })
    }
  }
}

/**
 * Calls `fn` with the new defaults after every configure(), and returns a
 * function that stops it. Widgets use it to draw again; a host can too.
 */
export function onConfigure(fn) {
  // An entry per call, so two subscriptions of one function are separate and each unsubscribe takes only its own.
  const entry = { fn }
  listeners.add(entry)
  return () => {
    listeners.delete(entry)
  }
}

/** The defaults configure() has set. */
export function currentConfig() {
  return { ...defaults }
}

function pick(o) {
  const out = {}
  for (const key of ['locale', 'currency', 'timeZone', 'hourCycle', 'styleNonce']) if (o[key] !== undefined) out[key] = o[key] || undefined
  return out
}

// Decimal strings only. Number() also reads '0x10', '0b1' and 'Infinity',
// which are never what a P&L field means.
const DECIMAL = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i

/**
 * A finite number from a number, a decimal string or a decimal-library object
 * (Decimal.js, big.js), else NaN. Booleans and null are not numbers.
 */
export function toNumber(v) {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const s = v.trim()
    if (!DECIMAL.test(s)) return NaN
    const n = Number(s)
    return Number.isFinite(n) ? n : NaN
  }
  if (v && typeof v === 'object' && typeof v.toNumber === 'function') {
    try {
      const n = v.toNumber()
      return typeof n === 'number' && Number.isFinite(n) ? n : NaN
    } catch {
      return NaN
    }
  }
  return NaN
}

// Each check returns an error message, or '' when the value is usable.
const CHECKS = {
  locale(v) {
    if (typeof v !== 'string') return 'must be a string'
    try {
      Intl.getCanonicalLocales(v)
      return ''
    } catch {
      return 'is not a valid locale'
    }
  },
  currency(v) {
    if (typeof v !== 'string' || !/^[A-Za-z]{3}$/.test(v)) return 'is not a three-letter currency code'
    try {
      new Intl.NumberFormat('en-US', { style: 'currency', currency: v })
      return ''
    } catch {
      return 'is not a currency code this runtime knows'
    }
  },
  timeZone(v) {
    if (typeof v !== 'string') return 'must be a string'
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: v })
      return ''
    } catch {
      return 'is not a time zone this runtime knows'
    }
  },
  hourCycle(v) {
    return v === 'h23' || v === 'h12' || v === 'auto' ? '' : 'must be h23, h12 or auto'
  },
}

/**
 * The first valid value of each option, from the formatter's own options and
 * then the configure() defaults. Each invalid one is listed, so the host
 * hears about it, and never reaches Intl, which would throw from money().
 */
function resolve(options) {
  const own = pick(options)
  const out = {}
  const issues = []
  for (const option of Object.keys(CHECKS)) {
    for (const value of [own[option], defaults[option]]) {
      if (value === undefined) continue
      const problem = CHECKS[option](value)
      if (!problem) {
        out[option] = value
        break
      }
      issues.push(Object.freeze({ option, value, message: `${option} ${JSON.stringify(value)} ${problem}` }))
    }
  }
  return { values: out, issues: Object.freeze(issues) }
}

const DASH = '—'

// The ECMA-402 sanctioned simple units. Intl.NumberFormat throws on anything
// else, so membership is checked here rather than caught after the fact.
const UNITS = Object.freeze(new Set((
  'acre bit byte celsius centimeter day degree fahrenheit fluid-ounce foot gallon gigabit gigabyte gram hectare hour inch ' +
  'kilobit kilobyte kilogram kilometer liter megabit megabyte meter microsecond mile mile-scandinavian milliliter millimeter ' +
  'millisecond minute month nanosecond ounce percent petabyte pound second stone terabit terabyte week yard year'
).split(' ')))

const sanctioned = (u) => {
  if (UNITS.has(u)) return true
  const i = u.indexOf('-per-')
  return i > 0 && UNITS.has(u.slice(0, i)) && UNITS.has(u.slice(i + 5))
}

export function createFormatter(options = {}) {
  const { values, issues } = resolve(options)
  const { locale, currency, timeZone } = values
  const hourCycle = values.hourCycle || 'h23'
  const calendar = new Intl.Locale(locale || new Intl.DateTimeFormat().resolvedOptions().locale).calendar
  const cache = new Map()
  // Intl constructors are slow next to format(); widgets format on every
  // tick, so each distinct set of options is built once.
  const nf = (opts) => {
    const key = JSON.stringify(opts)
    let f = cache.get(key)
    if (!f) cache.set(key, (f = new Intl.NumberFormat(locale, opts)))
    return f
  }
  const df = (opts) => {
    const key = `d${JSON.stringify(opts)}`
    let f = cache.get(key)
    if (!f) cache.set(key, (f = new Intl.DateTimeFormat(locale, { timeZone, ...opts })))
    return f
  }
  const durationFormat = (opts) => {
    const key = `duration${JSON.stringify(opts)}`
    let f = cache.get(key)
    if (!f) cache.set(key, (f = new Intl.DurationFormat(locale, opts)))
    return f
  }
  const listFormat = (opts) => {
    const key = `list${JSON.stringify(opts)}`
    let f = cache.get(key)
    if (!f) cache.set(key, (f = new Intl.ListFormat(locale, opts)))
    return f
  }
  const rtf = () => {
    let f = cache.get('rtf')
    if (!f) cache.set('rtf', (f = new Intl.RelativeTimeFormat(locale, { style: 'short', numeric: 'always' })))
    return f
  }

  // exceptZero puts a sign on everything but zero, including values that
  // round to zero, so "−₹0.00" never appears. For sign: 'negative' the plus
  // is then taken off again.
  const signed = (f, v, sign) => {
    let s = f.format(v)
    if (sign === 'negative') s = s.replace('+', '')
    return s.replace('-', MINUS)
  }

  const fractions = (decimals) =>
    decimals === undefined ? {} : { minimumFractionDigits: decimals, maximumFractionDigits: decimals }

  const money = (value, o = {}) => {
    const v = toNumber(value)
    if (!Number.isFinite(v)) return DASH
    const sign = o.sign || 'always'
    const base = currency ? { style: 'currency', currency } : { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    const opts = o.compact
      ? { ...base, notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: o.decimals === undefined ? 1 : o.decimals }
      : { ...base, ...fractions(o.decimals) }
    return signed(nf({ ...opts, signDisplay: 'exceptZero' }), v, sign)
  }

  const number = (value, o = {}) => {
    const v = toNumber(value)
    if (!Number.isFinite(v)) return DASH
    const opts = o.compact
      ? { notation: 'compact', maximumFractionDigits: o.decimals === undefined ? 1 : o.decimals }
      : fractions(o.decimals)
    return signed(nf({ ...opts, signDisplay: 'exceptZero' }), v, o.sign || 'negative')
  }

  const price = (value, o = {}) => {
    const v = toNumber(value)
    if (!Number.isFinite(v)) return DASH
    const d = o.decimals === undefined ? 2 : o.decimals
    return signed(nf({ minimumFractionDigits: d, maximumFractionDigits: d, signDisplay: 'exceptZero' }), v, 'negative')
  }

  // A number with a unit: '182 ms' for a sanctioned unit, '3 seats' otherwise.
  const unit = (value, u, o = {}) => {
    const v = toNumber(value)
    if (!Number.isFinite(v)) return DASH
    if (typeof u !== 'string' || !u) return number(value, o)
    if (!sanctioned(u)) return `${number(value, o)} ${u}`
    const opts = o.compact
      ? { notation: 'compact', maximumFractionDigits: o.decimals === undefined ? 1 : o.decimals }
      : fractions(o.decimals)
    return signed(nf({ ...opts, style: 'unit', unit: u, unitDisplay: 'short', signDisplay: 'exceptZero' }), v, 'negative')
  }

  // Takes a fraction, not a percentage: 0.12 is '+12.00%'.
  const percent = (value, o = {}) => {
    const v = toNumber(value)
    if (!Number.isFinite(v)) return DASH
    const d = o.decimals === undefined ? 2 : o.decimals
    return signed(nf({ style: 'percent', minimumFractionDigits: d, maximumFractionDigits: d, signDisplay: 'exceptZero' }), v, o.sign || 'always')
  }

  // Trading screens use the 24-hour clock whatever the locale's habit is,
  // because session times (09:15, 15:30) are published that way.
  const time = (t, o = {}) => {
    if (!Number.isFinite(t)) return DASH
    const cycle = o.hour12 === true ? 'h12' : o.hour12 === false ? 'h23' : hourCycle === 'auto' ? undefined : hourCycle
    const resolvedCycle = cycle || df({ hour: 'numeric' }).resolvedOptions().hourCycle
    return df({ hour: resolvedCycle === 'h12' || resolvedCycle === 'h11' ? 'numeric' : '2-digit', minute: '2-digit', ...(o.seconds ? { second: '2-digit' } : {}), ...(cycle ? { hourCycle: cycle } : {}) }).format(t)
  }

  const date = (value, o = {}) => {
    let t
    let zone = timeZone
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split('-').map(Number)
      const plainDay = new Date(0)
      plainDay.setUTCHours(12, 0, 0, 0)
      plainDay.setUTCFullYear(y, m - 1, d)
      if (plainDay.toISOString().slice(0, 10) !== value) return DASH
      t = plainDay.getTime()
      zone = 'UTC'
    } else t = toTime(value)
    if (!Number.isFinite(t) || Math.abs(t) > 8.64e15) return DASH
    const styles = {
      day: { day: 'numeric', month: 'short' },
      month: { month: 'short' },
      monthYear: { month: 'short', year: 'numeric' },
      medium: { day: 'numeric', month: 'short', year: 'numeric' },
      weekday: { weekday: 'short' },
    }
    // An unknown style falls back to 'medium' so a typo still shows a date, not a dash.
    const requestedStyle = o.style
    const style = Object.hasOwn(styles, requestedStyle) ? styles[requestedStyle] : styles.medium
    return df({ ...style, timeZone: zone, calendar: calendar || 'gregory' }).format(t)
  }

  const duration = (ms, o = {}) => {
    if (!Number.isFinite(ms)) return DASH
    const total = Math.max(0, Math.floor(ms / 1000))
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    if (o.style === 'words') {
      const parts = []
      if (h) parts.push([h, 'hour'])
      if (m) parts.push([m, 'minute'])
      if (!parts.length) parts.push([s, 'second'])
      if (typeof Intl.DurationFormat === 'function') {
        const duration = { ...(h ? { hours: h } : {}), ...(m ? { minutes: m } : {}), ...(!h && !m ? { seconds: s } : {}) }
        // 'auto' hides a zero seconds field, which would render 0 as an empty
        // string; 'always' is only right when seconds are the sole unit, or
        // "3h 48m" would grow a trailing "0s".
        return durationFormat({ style: 'narrow', ...(!h && !m ? { secondsDisplay: 'always' } : {}) }).format(duration)
      }
      const rendered = parts.map(([n, unit]) => nf({ style: 'unit', unit, unitDisplay: 'narrow', maximumFractionDigits: 0 }).format(n))
      return listFormat({ style: 'narrow', type: 'unit' }).format(rendered)
    }
    const mm = h ? String(m).padStart(2, '0') : String(m)
    return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`
  }

  const ago = (t, now, o = {}) => {
    if (!Number.isFinite(t) || !Number.isFinite(now)) return DASH
    // A time ahead of `now` (a host clock a little behind the server's) reads as
    // fresh and never as a negative age; it ages normally once `now` passes it.
    const diff = Math.max(0, now - t)
    if (diff < 30000) return o.justNow !== undefined ? o.justNow : 'just now'
    const min = Math.round(diff / 60000)
    if (min < 60) return rtf().format(-min, 'minute')
    const hr = Math.round(diff / 3600000)
    if (hr < 24) return rtf().format(-hr, 'hour')
    const day = Math.round(diff / 86400000)
    if (day < 30) return rtf().format(-day, 'day')
    const month = Math.round(diff / (30 * 86400000))
    if (month < 12) return rtf().format(-month, 'month')
    const year = Math.round(diff / (365 * 86400000))
    return rtf().format(-year, 'year')
  }

  // Full form, then without decimals, then compact; a compact form that is no
  // shorter than the best so far (a short number, or a locale with a long
  // suffix) is not worth the lost precision. Money skips the no-decimals step:
  // headlines have always gone straight from full to compact, and dropping the
  // paise silently would change what existing dashboards show.
  const fit = (value, maxChars, o = {}) => {
    const { style = 'money', ...rest } = o
    const f = style === 'percent' ? percent : style === 'number' ? number : money
    const visibleLength = (text) => [...text.replace(/[\u200e\u200f\u061c\u2066-\u2069]/g, '')].length
    let best = f(value, rest)
    if (visibleLength(best) <= maxChars) return best
    if (f !== money) {
      const plain = f(value, { ...rest, decimals: 0 })
      if (visibleLength(plain) < visibleLength(best)) best = plain
      if (visibleLength(best) <= maxChars) return best
    }
    const compact = f(value, { ...rest, compact: true })
    return visibleLength(compact) < visibleLength(best) ? compact : best
  }

  return Object.freeze({ locale, currency, timeZone, hourCycle, issues, money, number, price, percent, unit, time, date, duration, ago, fit })
}
