/**
 * The v1 widgets: which tag renders each one and the sizes it is designed
 * for. The core knows tags only as strings and never touches the DOM.
 *
 * A host with its own tiles spreads this into a bigger catalog:
 * `{ ...WIDGETS, news: { tag: 'my-news', label: 'News', sizes: ['Tall'] } }`.
 */

import { SIZE_NAMES } from './sizes.js'

const widget = (tag, label, sizes, phoneRows) =>
  Object.freeze({ tag, label, sizes: Object.freeze(sizes), ...(phoneRows ? { phoneRows: Object.freeze(phoneRows) } : {}) })

export const WIDGETS = Object.freeze({
  todayPnl: widget('ts-today-pnl', "Today's P&L", ['S', 'Wide', 'M']),
  equityCurve: widget('ts-equity-curve', 'Equity curve', ['Wide', 'M', 'XL']),
  // On phones the year wraps into two half-year bands, so Banner gets 2 rows.
  pnlCalendar: widget('ts-pnl-calendar', 'Daily P&L calendar', ['Tall', 'M', 'Banner'], { Banner: 2 }),
  edgeStats: widget('ts-edge-stats', 'Edge stats', ['S', 'Wide', 'M']),
  capitalFunding: widget('ts-capital-funding', 'Capital funding', ['S', 'Tall', 'L']),
  openPositions: widget('ts-open-positions', 'Open positions', ['Wide', 'M', 'L']),
  watchlist: widget('ts-watchlist', 'Watchlist', ['S', 'Tall', 'M']),
  sessionClock: widget('ts-session-clock', 'Session clock', ['S', 'Banner']),
  miniChart: widget('ts-mini-chart', 'Mini chart', ['M', 'L', 'XL']),
  // The generic widgets: not finance-specific, usable for any dashboard.
  card: widget('ts-card', 'Card', [...SIZE_NAMES]),
  metric: widget('ts-metric', 'Metric', ['S', 'Wide', 'M']),
  chart: widget('ts-chart', 'Chart', ['Wide', 'M', 'L', 'XL']),
})

/** The item's widget type: `type` when given, else its `id`. */
export function typeOf(item) {
  return item.type === undefined ? item.id : item.type
}

/**
 * The profile a layout uses when the host never names one. It keeps the name
 * "market" so layouts saved before profiles became optional still load.
 */
export const DEFAULT_PROFILE = 'market'

/**
 * The catalog entry for an item, or null for a host's own tile. A function
 * catalog resolves each item itself, so two items of one type can differ.
 */
export function specFor(item, catalog) {
  if (typeof catalog === 'function') return catalog(item) ?? null
  const type = typeOf(item)
  // Own properties only, so a type called "toString" or "__proto__" is
  // unknown rather than a match on Object.prototype.
  return typeof type === 'string' && Object.prototype.hasOwnProperty.call(catalog, type)
    ? catalog[type]
    : null
}

/** The catalog key whose spec has this tag, or null (always null for a function catalog). */
export function typeForTag(catalog, tag) {
  if (!catalog || typeof catalog !== 'object') return null
  return Object.keys(catalog).find((key) => catalog[key]?.tag === tag) ?? null
}
