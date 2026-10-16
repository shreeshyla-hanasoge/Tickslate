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
  'widget.table.label': 'Table',
  // The picker's sentence for each catalog entry
  'widget.todayPnl.description': "Today's profit or loss, with an intraday line.",
  'widget.equityCurve.description': 'Account value over time, with peak and drawdown.',
  'widget.pnlCalendar.description': 'Each trading day coloured by its profit or loss.',
  'widget.edgeStats.description': 'Win rate, payoff and expectancy at a glance.',
  'widget.capitalFunding.description': 'How much capital each account has put to work.',
  'widget.openPositions.description': 'The positions that are open now, with their profit or loss.',
  'widget.watchlist.description': 'Prices and changes for the instruments you follow.',
  'widget.sessionClock.description': 'Whether the market is open, and the time to the next change.',
  'widget.miniChart.description': 'A small price chart for one instrument.',
  'widget.card.description': 'A titled card for any content.',
  'widget.metric.description': 'One figure with a label and a change.',
  'widget.chart.description': 'A line, area or bar chart of any series.',
  'widget.table.description': 'A sortable table of rows with typed columns.',
  // The picker's groups. A host's own category name is shown as it is unless it adds category.<name>.
  'category.General': 'General',
  'category.Performance': 'Performance',
  'category.Accounts': 'Accounts',
  'category.Markets': 'Markets',
  'widget.todayPnl.empty': 'No trades today',
  'widget.equityCurve.empty': 'No trading days yet',
  'widget.sessionClock.empty': 'No sessions set up',
  'widget.metric.empty': 'No data yet',
  'widget.chart.empty': 'No data yet',
  'widget.table.empty': 'No rows yet',
  'widget.watchlist.empty': 'No instruments yet',
  'widget.openPositions.empty': 'No open positions',
  'widget.pnlCalendar.empty': 'No trading days yet',

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
  // One {time} only: the words before it and after it are shown either side of the time (syncedParts).
  'time.synced': 'synced {time}',
  // Said after a tile's name while its data is live: "Signups, 1,204, up 12% vs last week, live".
  'time.live': 'live',
  'time.staleWord': 'stale',
  'time.justNow': 'just now',
  'time.stale': 'Stale · {age}',
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
  'grid.add': 'Add',
  'grid.added': '{label} added.',
  'grid.addFailed': '{label} could not be added.',

  // <ts-widget-picker>
  'picker.title': 'Add a widget',
  'picker.search': 'Search widgets',
  'picker.close': 'Close',
  'picker.addBack': 'Add back',
  'picker.addBackItem': 'Add back {label}',
  'picker.addSized': 'Add {label} as {size}',
  'picker.empty': 'Every widget is already on this layout',
  'picker.noMatch': 'No widget matches your search',
  'picker.noGrid': 'No dashboard to add to yet',
  'picker.count.one': '{count} widget',
  'picker.count.other': '{count} widgets',

  // <ts-grid-controls>
  'controls.profile': 'Layout',
  'controls.auto': 'Auto',
  'controls.market': 'Market hours',
  'controls.closed': 'After close',
  'controls.next': 'Switches to {profile} at {time}',

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
  // What a range button's short name stands for, said after it ("1W, 1 week") and visually hidden.
  'equity.rangeExpand': ', {long}',
  'equity.range1W.long': '1 week',
  'equity.range1M.long': '1 month',
  'equity.range3M.long': '3 months',
  'equity.rangeYTD.long': 'year to date',
  'equity.rangeAll.long': 'all days',
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
  'session.open247': 'Open 24/7',
  'session.ariaOpen247': '{session} open 24/7',
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

  // <ts-table>
  'table.aria': '{label}, {rows}',
  'table.rows.one': '{count} row',
  'table.rows.other': '{count} rows',
  'table.sortedBy': 'sorted by {column}, {dir}',
  'table.ascending': 'ascending',
  'table.descending': 'descending',
  'table.hidden.one': '{count} column hidden',
  'table.hidden.other': '{count} columns hidden',
  'table.join': '{head}, {tail}',
  'table.select': 'Select {name}',
  'table.region': '{label}, rows',

  // <ts-watchlist>
  'watchlist.aria': '{label}, {instruments}',
  'watchlist.instruments.one': '{count} instrument',
  'watchlist.instruments.other': '{count} instruments',
  'watchlist.firstOnly': 'showing the first',
  'watchlist.join': '{head}, {tail}',
  'watchlist.region': '{label}, instruments',
  'watchlist.col.instrument': 'Instrument',
  'watchlist.col.trend': 'Trend',
  'watchlist.col.price': 'Last price and change',
  'watchlist.range': 'Day range {low} to {high}, now {now}',
  'watchlist.rangeOnly': 'Day range {low} to {high}',
  'watchlist.trend': '{name} trend, from {from} to {to}',
  'watchlist.add': 'Add instrument',

  // <ts-open-positions>
  'positions.aria': '{label}, {positions}',
  'positions.count.one': '{count} position',
  'positions.count.other': '{count} positions',
  'positions.region': '{label}, positions',
  'positions.col.instrument': 'Instrument',
  'positions.col.trend': 'Price since entry',
  'positions.col.last': 'Last price',
  'positions.col.pnl': 'P&L',
  'positions.col.actions': 'Actions',
  'positions.mtm': 'MTM',
  'positions.margin': 'Margin',
  'positions.long': 'Long',
  'positions.short': 'Short',
  'positions.qtyAt': '{qty} @ {entry}',
  'positions.lots.one': '{count} lot',
  'positions.lots.other': '{count} lots',
  'positions.join': '{head}, {tail}',
  'positions.range': 'Between stop {stop} and target {target}',
  'positions.rangeEntry': 'entry {entry}',
  'positions.rangeNow': 'now {now}',
  'positions.trend': '{name}, price since entry, from {from} to {to}',
  'positions.exit': 'Exit',
  'positions.exitLabel': 'Exit {name}, {detail}',
  'positions.exitLabelBare': 'Exit {name}',
  'positions.exitAll': 'Exit all',
  'positions.exitAllLabel.one': 'Exit the position',
  'positions.exitAllLabel.other': 'Exit all {count} positions',

  // <ts-pnl-calendar>
  'calendar.net': 'Net',
  'calendar.best': 'Best day',
  'calendar.worst': 'Worst day',
  'calendar.greenRate': 'Green days',
  'calendar.date': '{weekday} {day}',
  'calendar.cell': '{date}, {value}',
  'calendar.cellNone': '{date}, no entry',
  'calendar.cellUpcoming': '{date}, upcoming',
  'calendar.noDays': 'No trading days in this period',
  'calendar.dayCount.one': '{count} trading day',
  'calendar.dayCount.other': '{count} trading days',
  'calendar.aria': '{label}, net {net} over {days}',
  'calendar.ariaEmpty': '{label}, no trading days',
  'calendar.chartLabel': '{label}, {from} to {to}: best day {best}, worst day {worst}, net {net}',
  'calendar.chartEmpty': '{label}, {from} to {to}: no trading days',
  'calendar.chartNote': '{summary}. {note}',
  'calendar.weekend.one': '{count} weekend entry not shown',
  'calendar.weekend.other': '{count} weekend entries not shown',
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

// The count a plural lookup uses: a number, or a numeric string such as '2'
// (a count read from markup or JSON). Anything else is not a plural request.
function countOf(count) {
  if (typeof count === 'number') return count
  if (typeof count === 'string' && count.trim() !== '' && Number.isFinite(Number(count))) return Number(count)
  return undefined
}

/**
 * A `t(key, params?, count?)` for one table of overrides and one locale. The
 * locale picks plural forms for text from the host's table; text that falls
 * back to EN is English and always takes English plural rules, so a Japanese
 * app that left a key untranslated still reads "1 day", not "1 days". The table
 * is the host's and is not matched against the locale. Builds a closure and
 * logs nothing.
 */
export function createMessages(overrides, locale) {
  const own = overrides && typeof overrides === 'object' ? overrides : null
  let hostRules
  let enRules
  const category = (n, english) => {
    if (english) {
      if (!enRules) enRules = new Intl.PluralRules('en')
      return enRules.select(n)
    }
    if (!hostRules) {
      try {
        hostRules = new Intl.PluralRules(locale)
      } catch {
        // An unknown locale must not take the widget down; English plural rules are the safe answer.
        hostRules = new Intl.PluralRules('en')
      }
    }
    return hostRules.select(n)
  }
  return (key, params, count) => {
    const n = countOf(count)
    const plural = n !== undefined
    const chain = (english) => (plural ? [`${key}.${category(n, english)}`, `${key}.other`, key] : [key])
    // The host's whole chain first, so a translation that supplies only
    // `.other` is never answered with an English `.one`.
    let found = pick(own, chain(false))
    if (found === undefined) found = pick(EN, chain(true))
    return found === undefined ? key : fill(found, plural ? { count: n, ...params } : params)
  }
}

/** "Medium, 2 by 2": a size spoken in full, from the size.* messages. */
export function sizeName(t, size) {
  if (!hasOwn(SIZES, size)) return String(size)
  return t('size.name', { name: t(`size.${size}`), cols: SIZES[size].cols, rows: SIZES[size].rows })
}
