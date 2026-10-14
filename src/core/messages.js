/**
 * Every visible and every spoken string, in one frozen table, and the function
 * that looks them up (RFC 0003 §1).
 *
 * A host translates or rewords Tickslate by passing its own table for its own
 * locale: lookups are exact, with no locale negotiation. A key it leaves out
 * falls back to English, so a half-finished translation degrades to English
 * words instead of to blanks.
 *
 * Keys are flat and dotted, `family.name`. A key with plural forms is never
 * read bare: `t('equity.dayCount', {}, 2)` reads `equity.dayCount.<category>`
 * where the category comes from Intl.PluralRules, then `.other`, then the bare
 * key. `{name}` placeholders are filled from `params`, and `{count}` is always
 * available when a count is given.
 */

import { SIZES } from './sizes.js'

export const EN = Object.freeze({
  // The base's own strings
  'widget.empty': 'No data',
  'widget.error': "Couldn't display this data",
  'widget.error.region': '{label}, error: {message}',
  'action.retry': 'Retry',

  // Catalog entries: the label, and the empty text of the widgets that have their own
  'widget.todayPnl.label': "Today's P&L",
  'widget.equityCurve.label': 'Equity curve',
  'widget.pnlCalendar.label': 'Daily P&L calendar',
  'widget.edgeStats.label': 'Edge stats',
  'widget.capitalFunding.label': 'Capital funding',
  'widget.openPositions.label': 'Open positions',
  'widget.watchlist.label': 'Watchlist',
  'widget.sessionClock.label': 'Session clock',
  'widget.miniChart.label': 'Mini chart',
  'widget.card.label': 'Card',
  'widget.metric.label': 'Metric',
  'widget.chart.label': 'Chart',
  'widget.todayPnl.empty': 'No trades today',
  'widget.equityCurve.empty': 'No trading days yet',
  'widget.sessionClock.empty': 'No sessions set up',
  'widget.metric.empty': 'No data yet',
  'widget.chart.empty': 'No data yet',

  // Sizes: a size reads "Medium, 2 by 2"
  'size.S': 'Small',
  'size.Wide': 'Wide',
  'size.Tall': 'Tall',
  'size.M': 'Medium',
  'size.L': 'Large',
  'size.Banner': 'Banner',
  'size.XL': 'Extra large',
  'size.name': '{name}, {cols} by {rows}',

  // Time
  'time.synced': 'synced {time}',
  'time.days.one': '{count} day',
  'time.days.other': '{count} days',

  // The grid's chrome
  'grid.dashboard': 'Dashboard',
  'grid.editLayout': 'Edit layout',
  'grid.editingGroup': 'Editing layout',
  'grid.done': 'Done',
  'grid.undo': 'Undo',
  'grid.emptyBoard': 'No widgets on this layout yet',
  'grid.addBack': 'Add back ({count})',
  'grid.addBackItem': 'Add back {label}',
  'grid.hiddenHeading': 'Hidden from this layout',
  'grid.instructions': 'Space or Enter picks the tile up, then the arrow keys move it and Space drops it. Plus and minus resize it. Delete removes it. You can also tap the tile, then tap where it should go.',
  'grid.handle': '{label}, {size}, position {position} of {total}',
  'grid.remove': 'Remove {label}',
  'grid.resize': 'Resize {label}, now {size}',

  // The grid's announcements and toast
  'grid.removed': '{label} removed',
  'grid.removedSaid': '{label} removed.',
  'grid.addedBack': '{label} added back.',
  'grid.editStart.one': 'Editing layout, {count} tile. Tab to a tile, Space to pick it up.',
  'grid.editStart.other': 'Editing layout, {count} tiles. Tab to a tile, Space to pick it up.',
  'grid.editDone': 'Done editing layout.',
  'grid.pickedUp': '{label}, picked up. Use the arrow keys to move it, Space to drop, Escape to cancel.',
  'grid.moved': '{label}, moved to position {position} of {total}.',
  'grid.dropped': '{label}, dropped.',
  'grid.droppedAt': '{label}, dropped at position {position} of {total}.',
  'grid.cancelled': '{label}, move cancelled.',
  'grid.blocked': "Can't move further.",
  'grid.resized': '{label}, size {size}.',
  'grid.profile': 'Showing the {profile} layout.',
  'grid.undone': 'Undone.',

  // <ts-today-pnl>
  'pnl.today': 'Today',
  'pnl.realised': 'Realised',
  'pnl.unrealised': 'Unrealised',
  'pnl.fees': 'Fees',
  'pnl.closed': '{count} closed',
  'pnl.open': '{count} open',
  'pnl.feesNote': 'fees {amount}',
  'pnl.netOfFees': 'net of fees',
  'pnl.now': 'now',
  'pnl.at': 'at {time}',
  'pnl.low': 'low {amount} {when}',
  'pnl.high': 'high {amount} {when}',
  'pnl.highNow': 'high {when}',
  'pnl.noIntraday': 'No intraday data yet',
  'pnl.chartEmpty': 'Intraday P&L: no data yet',
  'pnl.chartLabel': 'Intraday P&L: low {low}, now {now}',
  'pnl.entry': 'Entry',
  'pnl.exit': 'Exit',
  'pnl.markTitle': '{name} · {time}',

  // <ts-equity-curve>
  'equity.short': 'Equity',
  'equity.wide': '{label} · {days}',
  'equity.net': 'Net',
  'equity.peak': 'Peak',
  'equity.maxDrawdown': 'Max drawdown',
  'equity.tradingDays': 'Trading days',
  'equity.shaded': 'shaded on the chart',
  'equity.fees': 'Fees',
  'equity.trades': 'Trades',
  'equity.netOfFees': 'net of fees',
  'equity.noDays': 'No trading days in this range',
  'equity.rangeLabel': 'Range',
  'equity.range1W': '1W',
  'equity.range1M': '1M',
  'equity.range3M': '3M',
  'equity.rangeYTD': 'YTD',
  'equity.rangeAll': 'All',
  'equity.peakNote': 'peak {peak}',
  'equity.over': 'over {days}',
  'equity.dayCount.one': '{count} day',
  'equity.dayCount.other': '{count} days',
  'equity.tradingDayCount.one': '{count} trading day',
  'equity.tradingDayCount.other': '{count} trading days',
  'equity.tradeCount.one': '{count} trade',
  'equity.tradeCount.other': '{count} trades',
  'equity.chartEmpty': '{label}: no trading days in this range',
  'equity.chartLabel': '{label}: peak {peak}, lowest {lowest}, ends at {net}',
  'equity.ariaEmpty': '{label}, no trading days in this range',
  'equity.aria': '{label}, {net} over {days}',

  // <ts-session-clock>
  'session.title': 'Sessions',
  'session.open': 'Market open',
  'session.closed': 'Market closed',
  'session.openShort': 'Open',
  'session.closedShort': 'Closed',
  'session.noCalendar': 'No calendar',
  'session.none': 'No sessions',
  'session.unknown': 'Unknown session {session}',
  'session.noneScheduled': 'no session scheduled',
  'session.noneShort': 'no session',
  'session.toClose': '{time} to close',
  'session.left': '{time} left',
  'session.opens': 'opens {time}',
  'session.opensIn': 'opens in {time}',
  'session.opensOn': 'opens {day} {time}',
  'session.opensDay': 'opens {day}',
  'session.dayTime': '{day} {time}',
  'session.ariaOpen': '{session} open, closes {time}',
  'session.ariaClosed': '{session} closed, {opens}',
  'session.ariaNone': '{session} closed, no session scheduled',
  'session.aria': '{label}: {state}',
  'session.tfHours': '{count}h',
  'session.tfMinutes': '{count}m',
  'session.legend': '{tf} close',
  'session.legendNext': '{tf} close, next hour',
  'session.nextClose': 'next close in {time}',

  // <ts-metric>
  'metric.target': 'Target',
  'metric.up': 'up {delta}',
  'metric.down': 'down {delta}',
  'metric.unchanged': 'no change',
  'metric.trend': '{label} trend, from {from} to {to}',

  // <ts-chart>
  'chart.series': 'Series {index}',
  'chart.last': '{name}, last {value}',
  'chart.noData': '{name}, no data',
})

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k)

// The first key the table holds as text. Own keys only, so a key called
// "constructor" is missing rather than a function.
function pick(table, keys) {
  if (!table) return undefined
  for (const key of keys) if (hasOwn(table, key) && typeof table[key] === 'string') return table[key]
  return undefined
}

// A placeholder with no parameter stays as written, so a missing value shows
// up instead of vanishing. One pass: a value that contains "{x}" is not read again.
function fill(text, params) {
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (whole, name) => (hasOwn(params, name) && params[name] !== undefined && params[name] !== null ? String(params[name]) : whole))
}

/**
 * A `t(key, params?, count?)` for one table of overrides and one locale. The
 * locale only picks plural forms; the table is the host's and is not matched
 * against it. Builds a closure and logs nothing.
 */
export function createMessages(overrides, locale) {
  const own = overrides && typeof overrides === 'object' ? overrides : null
  let rules
  const category = (n) => {
    if (!rules) {
      try {
        rules = new Intl.PluralRules(locale)
      } catch {
        // An unknown locale must not take the widget down; English plural rules are the safe answer.
        rules = new Intl.PluralRules('en')
      }
    }
    return rules.select(n)
  }
  return (key, params, count) => {
    const plural = typeof count === 'number'
    const keys = plural ? [`${key}.${category(count)}`, `${key}.other`, key] : [key]
    // The host's whole chain first, so a translation that supplies only
    // `.other` is never answered with an English `.one`.
    const text = pick(own, keys)
    const found = text !== undefined ? text : pick(EN, keys)
    return found === undefined ? key : fill(found, plural ? { count, ...params } : params)
  }
}

/** "Medium, 2 by 2": a size spoken in full, from the size.* messages. */
export function sizeName(t, size) {
  if (!hasOwn(SIZES, size)) return String(size)
  return t('size.name', { name: t(`size.${size}`), cols: SIZES[size].cols, rows: SIZES[size].rows })
}
