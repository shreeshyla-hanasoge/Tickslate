# Core API: `tickslate`

The core is framework-free, has no runtime dependencies and touches no DOM, so
it runs in Node, a server render, a worker or a test. Importing it has no side
effects.

```js
import { place, readLayout, createFormatter, createCalendar, presets } from 'tickslate'
```

The elements are a separate entry, `tickslate/elements`; importing that
registers the custom elements. See [`<ts-grid>`](../widgets/ts-grid.md) and the
other pages in [docs/widgets](../widgets/). The types for everything here are
in `index.d.ts` beside the package.

Contents: [sizes](#sizes-and-breakpoints) · [catalog](#widget-catalog) ·
[layouts](#layouts) · [placement](#placement) · [editing](#editing) ·
[formatting](#formatting) · [messages](#messages) · [time](#time) · [calendars](#session-calendars) ·
[stats](#stats)

Amounts are in major units (rupees, dollars). Anywhere a number is read, the
core accepts a number, a decimal string (`"12.50"`) or a decimal-library object
with `toNumber()` (Decimal.js, big.js); see [`toNumber`](#tonumber).

## `version`

`const version: string`. The package version, kept equal to `package.lib.json`
by a test. Every element Tickslate registers is stamped with it, which is how a
second copy that meets a tag already taken can say which version got there first.

## Sizes and breakpoints

### `SIZES`

`Record<SizeName, { cols, rows }>`, frozen: the footprint of each size at 4
columns.

| Size | cols x rows |
|---|---|
| `S` | 1 x 1 |
| `Wide` | 2 x 1 |
| `Tall` | 1 x 2 |
| `M` | 2 x 2 |
| `L` | 3 x 2 |
| `Banner` | 4 x 1 |
| `XL` | 4 x 2 |

### `SIZE_NAMES`

`readonly SizeName[]`: every size, smallest first: `S`, `Wide`, `Tall`, `M`,
`L`, `Banner`, `XL`.

### `BREAKPOINTS`

`{ desktop: 1200, tablet: 700 }`, grid width in px. At or above `desktop` a grid
has 4 columns, at or above `tablet` 3, else 2.

### `isSize(name)`

`(name: unknown) => name is SizeName`. A type guard; own names only, so
`'toString'` is not a size.

### `columnsFor(width)`

`(width: number) => 2 | 3 | 4`. The column count for a grid width. A missing or
`NaN` width gives 2, the layout that fits anywhere.

### `deviceFor(width)`

`(width: number) => 'desktop' | 'phone'`. `'phone'` below 700px. A tablet uses
the desktop layout, clamped to 3 columns.

### `snapSize(size, supported)`

`(size: string, supported: readonly SizeName[]) => SizeName`. `size` if the
widget supports it, else the nearest supported size (by distance in cells, ties
to the smaller area). An unknown name snaps as if it were `S`.

```js
snapSize('L', ['S', 'Wide', 'M']) // 'M'
```

### `footprint(size, columns, supported?, phoneRows?)`

`(size, columns: 2 | 3 | 4, supported?, phoneRows?) => { cols, rows, variant }`.
The cells a size occupies on a grid of `columns`, and the designed size
(`variant`) the widget renders there. `Banner` always spans the full width and
keeps its design; `phoneRows` (such as `{ Banner: 2 }`) can give it more height
on phones. At 2 columns `L` and `XL` take 2 x 2 and render `M` when the widget
supports `M`. Throws `RangeError` for any other column count.

```js
footprint('L', 2, ['M', 'L']) // { cols: 2, rows: 2, variant: 'M' }
```

## Widget catalog

A catalog says which tag renders each widget type and which sizes it supports.

```ts
interface WidgetSpec { tag: string; label: string; sizes: readonly SizeName[]; phoneRows?: Partial<Record<SizeName, number>> }
type WidgetCatalog = Record<string, WidgetSpec>
type Catalog = WidgetCatalog | ((item: LayoutItem) => WidgetSpec | null)
```

A function catalog resolves each item itself, so two items of one type can
differ. Lookups use own properties only, so a type called `toString` is unknown.

### `WIDGETS`

The built-in catalog, frozen. Spread it into your own to add tiles:

```js
const catalog = { ...WIDGETS, news: { tag: 'my-news', label: 'News', sizes: ['Tall'] } }
```

| Key | Tag | Sizes | Status |
|---|---|---|---|
| `todayPnl` | `ts-today-pnl` | S, Wide, M | shipped |
| `equityCurve` | `ts-equity-curve` | Wide, M, XL | shipped |
| `sessionClock` | `ts-session-clock` | S, Banner | shipped |
| `card` | `ts-card` | all seven | shipped |
| `metric` | `ts-metric` | S, Wide, M | shipped |
| `chart` | `ts-chart` | Wide, M, L, XL | shipped |
| `table` | `ts-table` | Tall, M, L, XL | shipped |
| `pnlCalendar` | `ts-pnl-calendar` | Tall, M, Banner (phone: Banner is 2 rows) | catalog entry only; the element is not yet shipped |
| `edgeStats` | `ts-edge-stats` | S, Wide, M | catalog entry only |
| `capitalFunding` | `ts-capital-funding` | S, Tall, L | catalog entry only |
| `openPositions` | `ts-open-positions` | Wide, M, L | shipped |
| `watchlist` | `ts-watchlist` | S, Tall, M | shipped |
| `miniChart` | `ts-mini-chart` | M, L, XL | catalog entry only |

### `DEFAULT_PROFILE`

`'market'`. The profile a layout uses when the host never names one.

### `typeOf(item)`

`(item: LayoutItem) => string`. The item's widget type: its `type`, else its `id`.

### `typeForTag(catalog, tag)`

`(catalog: Catalog, tag: string) => string | null`. The catalog key whose spec
has this tag; own entries only. Always `null` for a function catalog.

## Layouts

```ts
interface LayoutItem { id: string; type?: string; size: SizeName }
interface Layout {
  version: 1
  device: 'desktop' | 'phone'
  /** Array order is placement order. 'market' and 'closed' are always present. */
  profiles: Record<string, LayoutItem[]>
  /** Phone only: up to 3 item ids pinned above the grid. */
  topStrip?: string[]
}
```

`id` identifies the tile and matches the `item` attribute of its element;
`type` is the catalog key and defaults to `id`.

### `LAYOUT_VERSION`

`1`. The only layout version.

### `BUILT_IN_PROFILES`

`['market', 'closed']`. These two profiles exist in every layout.

### `TOP_STRIP_MAX`

`3`. The most ids a layout's `topStrip` may hold.

### `emptyLayout(device?)`

`(device?: 'desktop' | 'phone') => Layout`. An empty layout with the built-in
profiles. Device defaults to `'desktop'`.

### `readLayout(input, options?)`

```ts
readLayout(
  input: Layout | LayoutItem[] | unknown,
  options?: { catalog?: Catalog; device?: Device; unknown?: 'drop' | 'keep' },
): { layout: Layout; issues: LayoutIssue[] }
```

Reads saved layout JSON. It **never throws**: it repairs what it can, drops
what it cannot, and reports each change in `issues`. The result is a fresh
copy. A bare array of items is the shorthand for a layout with only the
`'market'` profile. `catalog` defaults to `WIDGETS`; `device` is used when the
input has none; `unknown: 'keep'` keeps items whose widget is not in the catalog
(reported, but kept) instead of dropping them, which a saved layout wants when a
tag is not defined yet.

Each issue is `{ path, code, message, fixed }`:

| `code` | Meaning | `fixed` |
|---|---|---|
| `unknown-version` | Version missing or not 1 | `migrated` |
| `unknown-widget` | No widget of that type in the catalog | `dropped`, or `kept` with `unknown: 'keep'` |
| `unsupported-size` | The size is not one of the widget's | `replaced` (snapped) |
| `duplicate-id` | An id repeats in a profile (or the top strip) | `dropped` |
| `bad-shape` | Something is not the shape it should be | `dropped` or `replaced` |
| `top-strip-too-long` | More than 3 ids in `topStrip` | `dropped` |
| `top-strip-unknown-id` | A `topStrip` id is in no profile | `dropped` |

```js
const raw = localStorage.getItem('layout')
const { layout, issues } = readLayout(raw ? JSON.parse(raw) : [], { unknown: 'keep' })
if (issues.length) console.warn(issues)
```

## Placement

### `place(items, columns, catalog?)`

```ts
place(items: readonly LayoutItem[], columns: 2 | 3 | 4, catalog?: Catalog)
  : { placements: Placement[]; rows: number }
interface Placement { id: string; col: number; row: number; cols: number; rows: number; variant: SizeName }
```

Places items in array order, each in the first cell where it fits, the same as
CSS `grid-auto-flow: dense`. Placements come back in input order, 0-based;
`rows` is the board's height in rows. Items whose widget is not in the catalog
are placed at their own size. Throws `RangeError` for a bad column count.

## Editing

All editing functions are pure: they never change their input and return new
arrays and objects, so you can keep the old layout for undo.

### `addItem(items, item, catalog?)`

`=> LayoutItem[]`. Appends an item, snapping its size to the widget's. Throws
on a missing or duplicate id. Placement backfills, so the tile lands in the
first gap it fits.

### `removeItem(items, id)`

`=> LayoutItem[]`.

### `moveItem(items, id, toIndex)`

`=> LayoutItem[]`. Moves an item to an index, clamped to the list. An unknown
id returns a copy.

### `resizeItem(items, id, size, catalog?)`

`=> LayoutItem[]`. Sets an item's size, snapped to the widget's supported sizes.

### `stepSize(spec, current, dir)`

`(spec: WidgetSpec, current: SizeName, dir: 1 | -1) => SizeName`. The next
supported size up (1) or down (-1), smallest to largest, stopping at the ends.

### `sizeForExtent(spec, cols, rows, columns?, current?)`

`=> SizeName`. The supported size nearest an extent of `cols` x `rows` cells, as
a resize handle is dragged. With `columns`, sizes are compared by their
footprint on that grid; ties keep `current`, then take the smaller size.

### `dropIndex(items, id, target, columns, catalog?, aspect?)`

`=> number`. The index to move `id` to so its top-left cell lands nearest
`target` (`{ col, row }`, fractional cells). `aspect` is a column's on-screen
width over a row's height. Ties keep the current index. Returns `-1` for an
unknown id. This is what makes dragging feel like an iPhone home screen.

### `withProfile(layout, profile, items)`

`=> Layout`. A layout with one profile replaced. Top-strip ids no profile holds
any more are dropped.

### `setTopStrip(layout, ids)`

`=> Layout`. Sets the top strip to at most 3 distinct ids that are in the
layout.

```js
let items = layout.profiles.market
items = addItem(items, { id: 'notes', type: 'card', size: 'Wide' })
items = moveItem(items, 'notes', 0)
layout = withProfile(layout, 'market', items)
```

## Formatting

Everything goes through `Intl`, so lakh grouping for `en-IN` or a comma decimal
for `de-DE` comes from the platform. Money carries its sign, negatives use the
true minus sign (U+2212), and zero has no sign.

### `createFormatter(options?)`

`(options?: { locale?, currency?, timeZone?, hourCycle? }) => Formatter`. Options default to
`configure()`'s, then the runtime's locale. An invalid option falls back to its
default and is listed in `formatter.issues` (the widgets warn in development).
Without a currency, money formats as a plain signed number.

```js
const fmt = createFormatter({ locale: 'en-IN', currency: 'INR' })
fmt.money(2185.65)             // '+₹2,185.65'
fmt.money(-263)                // '−₹263.00'
fmt.percent(0.12)              // '+12.00%'
fmt.duration(13_680_000, { style: 'words' }) // '3h 48m'
```

The `Formatter`:

| Member | Result |
|---|---|
| `locale`, `currency`, `timeZone`, `hourCycle` | The resolved options (readonly). `hourCycle` is `'h23'` (24-hour, the default), `'h12'` or `'auto'` (the locale's own) |
| `issues` | Options that failed validation: `{ option, value, message }[]` |
| `money(v, { sign?, compact?, decimals? })` | `'+₹2,185.65'`. `sign` is `'always'` (default) or `'negative'` |
| `number(v, { sign?, decimals?, compact? })` | `sign` defaults to `'negative'`. `compact`: `1200000` is `'1.2M'` in en-US, `'1,2 Mio.'` in de-DE |
| `price(v, { decimals? })` | Grouped, no currency symbol; 2 decimals by default |
| `percent(v, { sign?, decimals? })` | Takes a **fraction**: `0.12` is `'+12.00%'` (`sign` `'always'` by default) |
| `time(t, { seconds?, hour12? })` | Follows `hourCycle`: 24-hour by default (`'11:42'`, `'11:42:20'`), `'2:15 PM'` for `'h12'`, the locale's own for `'auto'`. A per-call `hour12` wins over `hourCycle` |
| `date(v, { style? })` | A calendar date in the locale, always on the Gregorian calendar (`fa-IR` is not the Persian one). `v` is a timestamp or a plain `'YYYY-MM-DD'`, which never shifts with the time zone. `style`: `'day'` (`'Mar 5'` in en-US), `'month'`, `'monthYear'`, `'medium'` (default, `'Mar 5, 2024'` in en-US) or `'weekday'`; an unknown style is `'medium'` |
| `duration(ms, { style? })` | `'clock'`: `'2:40'`, `'1:02:05'`. `'words'`: `'3h 48m'`, `'48m'`, `'9s'` in English; other locales get their own units and separators (`de-DE` is not `'2h 30m'`) |
| `unit(v, unit, { decimals?, compact? })` | `'182 ms'` for an ECMA-402 unit (or an `x-per-y` pair), `'3 seats'` for any other |
| `fit(v, maxChars, { style?, sign?, decimals? })` | The full form if it fits `maxChars`, else without decimals, else compact (only if shorter). `style` is `'money'` (default), `'number'` or `'percent'` |

A value that is not readable as a number formats as a dash.

### `configure(options)`

`(options: { locale?, currency?, timeZone?, messages?, styleNonce? }) => void`. Sets defaults
for formatters (and widgets) created without their own. Later calls merge. A
widget resolves each option from its own attribute, then its `<ts-grid>`'s
attribute, then these. `messages` replaces the whole table every widget and grid
reads (see [Messages](#messages)); `null` clears it. `styleNonce` is the CSP nonce for the
`<style>` fallback below Safari 16.4 (see the [security guide](../guide/security.md)).

```js
configure({ locale: 'en-IN', currency: 'INR', timeZone: 'Asia/Kolkata' })
```

### `onConfigure(fn)`

`(fn: (config) => void) => () => void`. Calls `fn` with the new defaults after
every `configure()` call, whichever option changed, and returns a function that
stops it. Importing the core registers nothing; mounted widgets subscribe while
they are on the page and draw again when it fires. A listener that throws does
not stop the others.

```js
const stop = onConfigure(({ locale }) => console.log('now', locale))
configure({ locale: 'de-DE' })   // logs: now de-DE
stop()
```

### `currentConfig()`

`() => { locale?, currency?, timeZone?, messages? }`. A copy of the defaults
`configure()` has set.

### `toNumber(v)`

`(v: unknown) => number`. A finite number from a number, a decimal string
(`"12.50"`, `" 3e2 "`) or a decimal-library object, else `NaN`. Booleans, `null`,
hex and binary strings, `'Infinity'` and objects whose `toNumber()` throws are
`NaN`, because they are never what a P&L field means.

## Messages

Every visible and every spoken string, in one table, so a host can translate
Tickslate or reword it. A table that leaves a key out falls back to English for
that key.

```js
configure({ messages: { 'widget.empty': 'Keine Daten' } })   // every widget, from now on
```

A `messages` property on a widget overrides this for that widget, and one on a
`<ts-grid>` for every tile inside it. Resolution is per key: the element, then
the nearest grid, then `configure()`, then `EN`. Assign a new object to change a
table; changing one in place is not noticed.

### `EN`

`Readonly<Messages>`. Every key and its English text, frozen. Keys are flat and
dotted (`grid.undo`, `equity.rangeAll`), and the `Messages` interface in
`index.d.ts` types every one. A text holds `{name}` placeholders; a placeholder
with no parameter stays as written. A key with plural forms is listed by its
forms, for example `equity.dayCount.one` and `equity.dayCount.other`.

### `createMessages(overrides?, locale?)`

`(overrides?: MessageOverrides | null, locale?: string) => Translate`, where
`Translate` is `(key, params?, count?) => string`. Builds a function that reads
`overrides`, then `EN`, then returns the key itself. With a `count` (a number, or
a numeric string such as `'2'`) it reads `key.<category>` (`zero`, `one`, `two`,
`few`, `many` or `other`), then `key.other`, then `key`, and `{count}` is
available as a parameter. The category comes from `Intl.PluralRules(locale)` for
text out of your table, and from English rules for text that falls back to `EN`,
so an untranslated key in a `ja-JP` app still reads "1 day". The table is not
matched against the locale. It never formats, so pass numbers and times already
formatted by [`createFormatter`](#createformatteroptions).

```js
const t = createMessages({ 'time.days.one': '{count} dzień', 'time.days.few': '{count} dni', 'time.days.many': '{count} dni' }, 'pl')
t('time.days', {}, 22)   // '22 dni'
```

## Time

### `toTime(v)`

`(v: unknown) => number`. An instant in ms since the epoch, or `NaN`. Accepts
ms or seconds (a number with absolute value under 1e11 is seconds), a `Date`, a
numeric string, or an ISO 8601 date or date-time (microseconds, a space for the
`T` and an offset without a colon are accepted). Free text such as `"March 5"`
is refused rather than read differently per browser. A bare date is read as UTC
midnight; a date-time without an offset is read in the viewer's zone, so send
an offset.

### `toDay(v, timeZone?)`

`(v: unknown, timeZone?: string) => string | null`. A calendar day
`'YYYY-MM-DD'` in `timeZone` (default `'UTC'`), or `null`. A plain date string is
returned as is, and an instant at exactly UTC midnight (a backend that
serialised a date as one) means that date whatever the zone.

### `zonedTime(date, hhmm, timeZone)`

`(date: string, hhmm: string, timeZone: string) => number`. The instant the
clock in `timeZone` reads `hhmm` on `date`, handling daylight-saving changes. A
time inside a spring-forward gap, which never happened, lands just after it, shifted by the gap's length (02:30 becomes 03:30 when 02:00 jumps to 03:00). A time that happened twice when clocks went back is the earlier one.

### `localDate(t, timeZone)`

`(t: number, timeZone: string) => string`. The local `'YYYY-MM-DD'` of an
instant in `timeZone`.

## Session calendars

### `createCalendar(input)`

```ts
createCalendar(input: {
  sessions: readonly SessionSpec[]
  /** Session id -> 'YYYY-MM-DD' dates the session would OPEN on, which it skips; '*' applies to every session. */
  holidays?: Record<string, readonly string[]>
}): Calendar
```

Throws `TypeError` on a malformed session or holiday list. The sessions and
holidays are read **once**, here: the calendar keeps a frozen copy, so changing
your own objects afterwards does nothing (create a new calendar instead), and
`session(id)` returns that frozen copy. Your objects are not frozen.

```ts
interface SessionSpec {
  id: string
  label: string
  timeZone: string                 // IANA, e.g. 'Asia/Kolkata'
  days: readonly number[]          // ISO weekdays it OPENS on, 1 = Monday
  open: string                     // 'HH:MM' local
  close: string | { default: string; ranges: Array<{ from: string; to: string; close: string }> }   // 'HH:MM' local; may be at or before `open`
  specialSessions?: Record<string, { open: string; close: string }>   // extra sessions by opening date; they beat weekdays and holidays
}
```

**Overnight and round-the-clock sessions.** A `close` earlier than `open` is on
the **next local day**, so `open: '17:00', close: '16:00'` is a 23-hour
session, and `close` equal to `open` makes a 24-hour one. A session that never
closes is `open: '00:00', close: '00:00'` on every day. `'24:00'` is not
accepted; midnight is `'00:00'`. `days`, `holidays` and `specialSessions` all go
by the **opening** date: a holiday on Monday removes the window that opens on
Monday evening, and Sunday evening's window still runs into Monday.

```js
// A futures exchange: Sunday to Thursday evening, closing at 16:00 the next day.
{ id: 'cme', label: 'CME', timeZone: 'America/Chicago', days: [7, 1, 2, 3, 4], open: '17:00', close: '16:00' }
// Crypto: always open.
{ id: 'crypto', label: 'Crypto', timeZone: 'UTC', days: [1, 2, 3, 4, 5, 6, 7], open: '00:00', close: '00:00' }
```

Windows that touch are **one** window: an FX week written as daily 24-hour
windows from Sunday 17:00 is open until Friday 17:00, and `state` reports that
close. A run that is still going a month ahead (the same look-ahead as "next
open") has no close the calendar can name, so `state` returns `open: true` with
`closesAt`, `startedAt` and `progress` all `null`, `nextChange` returns `null`,
and `<ts-session-clock>` shows "Open 24/7".

The `Calendar`:

| Member | Result |
|---|---|
| `sessions` | The session ids |
| `session(id)` | The `SessionSpec`. Throws `RangeError` for an unknown id |
| `isTradingDay(id, date)` | Whether the session trades on `'YYYY-MM-DD'` |
| `hours(id, date)` | The window that opens on `date`, `{ open, close }` as instants (`close` is on the next day for an overnight session), or `null` if it does not open. It is not merged with its neighbours |
| `state(id, now)` | `{ open, opensAt, closesAt, startedAt, progress }`: `opensAt` is the next open when closed (`null` if none within a month); the rest apply when open, with `progress` 0 to 1. For a session with no close within a month, `closesAt`, `startedAt` and `progress` are `null` while `open` is `true` |
| `nextChange(id, now)` | `{ at, to: 'open' \| 'closed' }`, or `null` when there is no change within a month (including while open with no close) |
| `candleClose(id, now, timeframeMinutes)` | The next candle close, aligned to the session open (to the day's window when the session has no known start); `null` while closed |
| `windows(id, from, to)` | Every session window overlapping `[from, to)`, touching windows merged. A run still going a month past `to`, or a month before `from`, is cut there |

### `presets`

Ready-made sessions, checked against exchange circulars on 13 Oct 2026.
Verify them against your exchange before relying on them.

| Preset | Returns |
|---|---|
| `presets.nse({ segment? })` | `'equity'` (default): id `nse`, 09:15 to 15:30. `'derivatives'`: id `nse-fo`, 09:15 to 15:40 (15:30 before 3 Aug 2026) |
| `presets.mcx({ segment?, years? })` | `'international'` (default; metals, energy): id `mcx`, 09:00 to 23:30 during US daylight saving, else 23:55, for the given `years` (default last, this and next). `'cotton'`: `mcx-cotton`, 09:00 to 21:00. `'agri'`: `mcx-agri`, 09:00 to 17:00 |

### `usDaylightSaving(year)`

`(year: number) => { from: string; to: string }`. The dates New York is on
daylight saving in a year.

### `activeProfile(calendar, schedule, now)`

`=> 'market' | 'closed'`. `'market'` while any session in
`schedule.market.sessions` is open, widened by `leadMinutes` before and
`lagMinutes` after, else `'closed'`.

```ts
interface ProfileSchedule { market: { sessions: string[]; leadMinutes?: number; lagMinutes?: number } }
```

### `nextProfileChange(calendar, schedule, now)`

`=> number | null`. The next instant `activeProfile` changes, or `null` if none
within a month, as when a session never closes. `<ts-grid>` uses both for its `schedule`.

## Stats

### `equitySeries(days, options?)`

```ts
equitySeries(days: readonly DayResult[], options?: { timeZone?: string }): EquityPoint[]
interface DayResult { date: Time; pnl: number | string; trades?: number }
interface EquityPoint { date: string; equity: number; peak: number; drawdown: number }
```

The running equity curve of a daily P&L series, sorted by date. `equity` is the
running sum starting from 0, `peak` the running maximum (counting the starting
0, so never below 0), `drawdown` is `equity - peak`, never above 0. Entries whose
date or `pnl` cannot be read are skipped. The input is not changed.

### `equityStats(days, options?)`

```ts
equityStats(days, options?): { net: number; peak: number; maxDrawdown: number; tradingDays: number; trades: number }
```

`net` is the equity at the end, `peak` the highest equity reached (at least 0),
`maxDrawdown` the largest fall below a running peak as a positive number,
`tradingDays` the count of valid entries, `trades` the sum of `trades` where it
is a finite number.

```js
equityStats([
  { date: '2026-10-01', pnl: 420.5, trades: 6 },
  { date: '2026-10-02', pnl: -180 },
]) // { net: 240.5, peak: 420.5, maxDrawdown: 180, tradingDays: 2, trades: 6 }
```
