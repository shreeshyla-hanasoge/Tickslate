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

/** Sets the default locale, currency and time zone for formatters made without their own. */
export function configure(options = {}) {
  defaults = { ...defaults, ...pick(options) }
}

/** The defaults configure() has set. */
export function currentConfig() {
  return { ...defaults }
}

function pick(o) {
  const out = {}
  for (const key of ['locale', 'currency', 'timeZone']) if (o[key] !== undefined) out[key] = o[key] || undefined
  return out
}

/** A number from a number or a numeric string, else NaN. Booleans and null are not numbers. */
export function toNumber(v) {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v.trim() !== '') return Number(v)
  return NaN
}

const DASH = '—'

export function createFormatter(options = {}) {
  const { locale, currency, timeZone } = { ...defaults, ...pick(options) }
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
    return df({ hour: '2-digit', minute: '2-digit', ...(o.seconds ? { second: '2-digit' } : {}), hourCycle: o.hour12 ? 'h12' : 'h23' }).format(t)
  }

  const duration = (ms, o = {}) => {
    if (!Number.isFinite(ms)) return DASH
    const total = Math.max(0, Math.floor(ms / 1000))
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    if (o.style === 'words') {
      if (h) return m ? `${h}h ${m}m` : `${h}h`
      if (m) return `${m}m`
      return `${s}s`
    }
    const mm = h ? String(m).padStart(2, '0') : String(m)
    return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`
  }

  const fit = (value, maxChars, o = {}) => {
    const full = money(value, o)
    return full.length <= maxChars ? full : money(value, { ...o, compact: true })
  }

  return Object.freeze({ locale, currency, timeZone, money, number, price, percent, time, duration, fit })
}
