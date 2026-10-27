/**
 * The v1 widgets: which tag renders each one and the sizes it is designed
 * for. The core knows tags only as strings and never touches the DOM.
 *
 * A host with its own tiles spreads this into a bigger catalog:
 * `{ ...WIDGETS, news: { tag: 'my-news', label: 'News', sizes: ['Tall'] } }`.
 */

import { SIZE_NAMES } from './sizes.js'

// The picker's sentence and group are English defaults that equal the
// widget.<key>.description and category.<name> messages, so a translation
// reaches them (the same arrangement as the label).
const widget = (tag, label, sizes, category, description, phoneRows) =>
  Object.freeze({
    tag,
    label,
    sizes: Object.freeze(sizes),
    description,
    category,
    ...(phoneRows ? { phoneRows: Object.freeze(phoneRows) } : {}),
  })

export const WIDGETS = Object.freeze({
  todayPnl: widget('ts-today-pnl', "Today's P&L", ['S', 'Wide', 'M'], 'Performance', "Today's profit or loss, with an intraday line."),
  equityCurve: widget('ts-equity-curve', 'Equity curve', ['Wide', 'M', 'XL'], 'Performance', 'Account value over time, with peak and drawdown.'),
  // On phones the year wraps into two half-year bands, so Banner gets 2 rows.
  pnlCalendar: widget('ts-pnl-calendar', 'Daily P&L calendar', ['Tall', 'M', 'Banner'], 'Performance', 'Each trading day coloured by its profit or loss.', { Banner: 2 }),
  edgeStats: widget('ts-edge-stats', 'Edge stats', ['S', 'Wide', 'M'], 'Performance', 'Win rate, payoff and expectancy at a glance.'),
  capitalFunding: widget('ts-capital-funding', 'Capital funding', ['S', 'Tall', 'L'], 'Accounts', 'How much capital each account has put to work.'),
  openPositions: widget('ts-open-positions', 'Open positions', ['Wide', 'M', 'L'], 'Accounts', 'The positions that are open now, with their profit or loss.'),
  watchlist: widget('ts-watchlist', 'Watchlist', ['S', 'Tall', 'M'], 'Markets', 'Prices and changes for the instruments you follow.'),
  sessionClock: widget('ts-session-clock', 'Session clock', ['S', 'Banner'], 'Markets', 'Whether the market is open, and the time to the next change.'),
  miniChart: widget('ts-mini-chart', 'Mini chart', ['M', 'L', 'XL'], 'Markets', 'A small price chart for one instrument.'),
  // The generic widgets: not finance-specific, usable for any dashboard.
  card: widget('ts-card', 'Card', [...SIZE_NAMES], 'General', 'A titled card for any content.'),
  metric: widget('ts-metric', 'Metric', ['S', 'Wide', 'M'], 'General', 'One figure with a label and a change.'),
  chart: widget('ts-chart', 'Chart', ['Wide', 'M', 'L', 'XL'], 'General', 'A line, area or bar chart of any series.'),
  table: widget('ts-table', 'Table', ['Tall', 'M', 'L', 'XL'], 'General', 'A sortable table of rows with typed columns.'),
  progress: widget('ts-progress', 'Progress', ['S', 'Wide'], 'General', 'Progress toward a goal, or use of a limit, with warning and danger states.'),
  breakdown: widget('ts-breakdown', 'Breakdown', ['S', 'Wide', 'Tall', 'M'], 'General', 'Parts of a whole, as a share bar, stacked bar or donut.'),
  status: widget('ts-status', 'Status', ['S', 'Tall', 'M'], 'General', 'Whether each service or system is working.'),
  feed: widget('ts-feed', 'Feed', ['Tall', 'M', 'L'], 'General', 'The latest events, newest first.'),
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
