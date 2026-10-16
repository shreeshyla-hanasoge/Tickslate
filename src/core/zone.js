/**
 * Wall-clock time in any IANA time zone, from Intl alone. Exchange sessions
 * are published in local time ("09:15 IST"), but timers and comparisons need
 * instants, so these convert between the two without a time zone library.
 */

const DAY = 86400000
const partsCache = new Map()

function partsFormatter(timeZone) {
  let f = partsCache.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    partsCache.set(timeZone, f)
  }
  return f
}

/** The wall-clock fields of instant `t` in `timeZone`. */
export function zonedParts(t, timeZone) {
  const out = {}
  for (const p of partsFormatter(timeZone).formatToParts(t)) if (p.type !== 'literal') out[p.type] = Number(p.value)
  return out
}

/** The zone's offset from UTC at instant `t`, in ms (IST is +5:30). */
export function offsetAt(t, timeZone) {
  const p = zonedParts(t, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(t / 1000) * 1000
}

/** The local date 'YYYY-MM-DD' of instant `t` in `timeZone`. */
export function localDate(t, timeZone) {
  const p = zonedParts(t, timeZone)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

/**
 * The instant at which the clock in `timeZone` reads `hhmm` on `date`.
 *
 * The zone's offset a day before and a day after bracket any change that
 * could touch that wall time, so each is tried: an offset fits when the clock
 * at the instant it gives really reads that time. A wall time that fits
 * twice happened twice (the hour after clocks go back), and the earlier
 * instant is returned. One that fits neither is inside a spring-forward gap
 * and never happened: it lands just after the gap, as the wall time shifted
 * by the gap's length (02:30 becomes 03:30 when 02:00 jumps to 03:00).
 */
export function zonedTime(date, hhmm, timeZone) {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = hhmm.split(':').map(Number)
  const wall = Date.UTC(y, m - 1, d, hh, mm)
  const around = [offsetAt(wall - DAY, timeZone), offsetAt(wall + DAY, timeZone)]
  const fits = around.filter((o) => offsetAt(wall - o, timeZone) === o)
  // The larger offset is the earlier instant.
  return wall - (fits.length ? Math.max(...fits) : around[0])
}

/** `date` moved by `days` calendar days. */
export function addDays(date, days) {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d) + days * DAY)
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

/** ISO weekday of a calendar date: 1 is Monday, 7 is Sunday. */
export function weekday(date) {
  const [y, m, d] = date.split('-').map(Number)
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1
}

/**
 * Whether `timeZone` is on daylight-saving time on `date`, judged at local
 * noon: the offset is then larger than it is in mid-January or mid-July,
 * whichever is standard time there.
 */
export function isDaylightSaving(date, timeZone) {
  const year = Number(date.slice(0, 4))
  const noon = zonedTime(date, '12:00', timeZone)
  const jan = offsetAt(Date.UTC(year, 0, 15, 12), timeZone)
  const jul = offsetAt(Date.UTC(year, 6, 15, 12), timeZone)
  return jan !== jul && offsetAt(noon, timeZone) === Math.max(jan, jul)
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function pad(n) {
  return String(n).padStart(2, '0')
}
