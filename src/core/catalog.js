/**
 * The v1 widgets: which tag renders each one and the sizes it is designed
 * for. The core knows tags only as strings and never touches the DOM.
 *
 * A host with its own tiles spreads this into a bigger catalog:
 * `{ ...WIDGETS, news: { tag: 'my-news', label: 'News', sizes: ['Tall'] } }`.
 */

const widget = (tag, label, sizes) => Object.freeze({ tag, label, sizes: Object.freeze(sizes) })

export const WIDGETS = Object.freeze({
  todayPnl: widget('ts-today-pnl', "Today's P&L", ['S', 'Wide', 'M']),
  equityCurve: widget('ts-equity-curve', 'Equity curve', ['Wide', 'M', 'XL']),
  pnlCalendar: widget('ts-pnl-calendar', 'Daily P&L calendar', ['Tall', 'M', 'Banner']),
  edgeStats: widget('ts-edge-stats', 'Edge stats', ['S', 'Wide', 'M']),
  capitalFunding: widget('ts-capital-funding', 'Capital funding', ['S', 'Tall', 'L']),
  openPositions: widget('ts-open-positions', 'Open positions', ['Wide', 'M', 'L']),
  watchlist: widget('ts-watchlist', 'Watchlist', ['S', 'Tall', 'M']),
  sessionClock: widget('ts-session-clock', 'Session clock', ['S', 'Banner']),
  miniChart: widget('ts-mini-chart', 'Mini chart', ['M', 'L', 'XL']),
})

/** The item's widget type: `type` when given, else its `id`. */
export function typeOf(item) {
  return item.type === undefined ? item.id : item.type
}

/** The catalog entry for an item, or null for a host's own tile. */
export function specFor(item, catalog) {
  const type = typeOf(item)
  // Own properties only, so a type called "toString" or "__proto__" is
  // unknown rather than a match on Object.prototype.
  return typeof type === 'string' && Object.prototype.hasOwnProperty.call(catalog, type)
    ? catalog[type]
    : null
}
