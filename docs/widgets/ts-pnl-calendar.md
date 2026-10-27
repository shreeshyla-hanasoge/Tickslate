# `<ts-pnl-calendar>`

A heat map of daily profit and loss: one cell for each trading day, green for a
gain and red for a loss, stronger the bigger the day. It reads the same `days`
series as the equity curve, so one array feeds both, and it fetches nothing.

```js
import 'tickslate/elements/pnl-calendar'
```

## Sizes

| Size | Cells (4 columns) | Shows |
|---|---|---|
| `Tall` | 1 x 2 | The last 6 weeks, with the net and the share of green days |
| `M` | 2 x 2 | The last 13 weeks, with net, green days, best day and worst day |
| `Banner` | 4 x 1 | The last year (53 weeks), with the same four figures beside it |

On a phone a Banner is a full-width tile two rows high (`phoneRows: { Banner: 2 }`).
A year in one band would be cells under 6px wide, so below 560px of tile width the
year folds into **two half-year bands**, one above the other, the first holding the
extra week of an odd count. The tile measures itself, so it folds and unfolds as
its width changes. Any other size snaps to the nearest of these.

The calendar ends with the week that holds today. A week starts on the locale's
first day, from `Intl.Locale.prototype.getWeekInfo()` (or the older `weekInfo`
property) where the engine has it, else Monday. The locale's weekend days have no
cell. The window follows the clock: it is read on every render, and the tile
renders again each minute, so a dashboard left open across a Monday (or midnight in
its `time-zone`) rolls forward by itself, and so does one whose `locale` changes the
first day of the week.

**Weekend entries.** The RFC draws no cell for a weekend day, so a weekend entry (a
special session) cannot be seen. The calendar's figures, its best and worst day and
its summary are therefore worked out over the days that **are** drawn, so the best
day always has a cell to point at, and the summary says what was left out ("3
weekend entries not shown", also written under the grid). A series of weekend
entries only draws the empty state. `dayStats` itself counts every entry, as the RFC
specifies. A trader who works seven days a week is not served by this yet.

## Data shape

```ts
interface PnlCalendarData extends WidgetFreshness {
  /** The same shape as the equity curve. Rows with the same date are summed. */
  days: DayResult[]            // { date: Time; pnl: number | string; trades?: number }
  /** Later days are drawn as upcoming. Default: the clock's day. */
  today?: Time
  /** When the data was taken. Shown as "synced HH:MM". */
  asOf?: Time
  /** Shows the pulsing dot. */
  live?: boolean
}
```

Dates are read with `toDay(date, time-zone)`, so `'2026-10-12'` is that day
whatever the viewer's zone, and an instant lands on the day the trader saw. A
string a backend serialised as UTC midnight (`'2026-10-12T00:00:00Z'`) means that
date. A row with a date or a `pnl` that cannot be read is left out and counted
once in development.

**Cells.** A day with an entry is filled from `--ts-profit` (above zero) or
`--ts-loss` (below), at a strength of `0.22 + 0.78 x |pnl| / max|pnl|`, where the
maximum is over the days drawn, so the biggest day is full and the smallest still
shows. A day with no entry is `--ts-surface-2`. A day after `today` is drawn as
upcoming: an outline, not a fill, and an entry dated then is not a result yet. A
day that nets to nothing, or rounds to nothing at the money format, is flat: the
empty colour and no sign.

**Figures.** The figures cover the days drawn, from the first column to today, and come from
[`dayStats`](../reference/core.md#daystatsdays-options). The net is the sum, green
days is `greenDays / (greenDays + redDays)`, and best and worst are the highest
and lowest day.

**The model.** `TsPnlCalendar.calendarModel(data, variant, ctx)` is the pure view
model, for tests and server rendering. `ctx` is the widget context plus
`phone: true` to fold a Banner into two bands. It returns:

```ts
interface CalendarModel {
  variant: SizeName
  phone: boolean                       // true when a Banner is two bands
  bands: Array<{ weeks: Array<{ month: string; cells: PnlCalendarCell[] }> }>
  rowLabels: string[]                  // the weekday names down the side
  rows: number                         // cells in a week
  dropped: number
  live: boolean
  empty: boolean                       // no entry in view
  label: string
  net: string; netNum: number
  best: string; worst: string; rate: string
  tradingDays: number
  weekendEntries: number                 // entries on a weekend: no cell, not in the figures
  note: string                           // "3 weekend entries not shown", or ''
  chartLabel: string                   // the grid's summary
  focusDate: string                    // the cell that starts as the tab stop
  ariaLabel: string                    // the tile's name
}
interface PnlCalendarCell {
  date: string                         // 'YYYY-MM-DD'
  kind: 'pos' | 'neg' | 'flat' | 'none' | 'up'
  pnl: number | null
  strength: number | null              // 0.22 .. 1 for pos and neg, else null
  name: string                         // "Mon 12 Oct, +1,240.00"
}
```

A band holds its week columns oldest first. A month's name sits on the first
column whose first day starts a new month, and a January column names its year, so
a year boundary reads. Two names never print within four columns of each other, and a January names its year only when the next month is five or more columns on, so every month keeps its name before the year does

## Minimal example

```html
<ts-pnl-calendar id="cal" label="Daily P&L" size="Banner" currency="INR" time-zone="Asia/Kolkata"></ts-pnl-calendar>
```

```js
document.querySelector('#cal').data = {
  days: [
    { date: '2026-10-09', pnl: 1240 },
    { date: '2026-10-12', pnl: -310.5 },
    { date: '2026-10-13', pnl: 480 },
  ],
}
```

Send the same `days` to `<ts-equity-curve>` and the two agree. Set `live: true`
with `asOf` and the header says how old the data is, as the other widgets do; the
net figure tints for a moment when it changes.

## Attributes and properties

| Name | Type | What it does |
|---|---|---|
| `label` | attribute and property | The heading and the tile's name. Defaults to "Daily P&L calendar" |
| `heading-level` | attribute | The `aria-level` of the tile's heading, 1 to 6. Falls back to the nearest `<ts-grid>`'s `heading-level`, then 3 |
| `size` | attribute and property | `Tall`, `M` or `Banner`; others snap. A grid sets it |
| `data` | property, or a JSON attribute | `PnlCalendarData` |
| `state` | attribute and property | `'loading'` or `'error'` |
| `error` | property | A message shows the error view; `null` clears it |
| `actions` | property | Names of the actions offered: `'retry'` |
| `stale-after` | attribute | How old live data's `asOf` may get before the tile reads as stale: milliseconds (`90000`) or a duration (`'90s'`, `'2m'`, `'1h'`). Default `120000` |
| `flash` | attribute | `'off'` stops the brief tint on the net figure when it changes |
| `locale`, `currency`, `time-zone`, `hour-cycle` | attributes | Formatting, and the week's first day and weekend. Resolved from the tile, then the nearest `<ts-grid>`, then `configure()` |
| `item` | attribute | The id a grid matches this child by |

The base members every widget has are listed in
[Your own widget](../guide/your-own-widget.md).

## Actions

```ts
// ts-action
{ action: 'retry' }
```

The calendar acts on nothing: **`retry`** is the error view's button, with
`actions = ['retry']`, and `'open'` is fired when the tile is `activatable`. A
cell is not a button and has no action of its own, but on an `activatable` tile
the whole tile is the target, so a click on a cell or on empty space opens the
tile. Only the tile's own buttons and the `actions` slot keep their clicks.
Route `open` to a page other than the one the tile is already on.

## Parts

| Part | Element |
|---|---|
| `tile` | The tile box, `role="group"` named by the label and the net |
| `header` | The header row: the live dot, the label and the synced time |
| `label` | The label, a `role="heading"` whose level comes from `heading-level` |
| `empty` | The empty view's container |
| `error` | The error view's container (only while the error view shows) |
| `skeleton` | The loading view's container, around the skeleton blocks |

Theme it with the tokens: `--ts-profit`, `--ts-loss`, `--ts-surface-2`,
`--ts-loss-mark` (the loss corner, off by default; see below), `--ts-line` (an
upcoming day's outline) and `--ts-focus`.

### The loss corner

A loss day can carry a small triangle in its top corner, so it differs from a gain
by shape as well as by colour. It is **off by default**: `--ts-loss-mark` is
`transparent`, and the corner draws nothing. To turn it on, give the token a colour:

```css
ts-pnl-calendar { --ts-loss-mark: currentColor; }
```

`currentColor` draws the corner in the widget's own ink, in light, dark, every preset
and every themed island, wherever you write the rule (`:root` included). A colour you
name (`#fff`, `var(--ts-accent)`) is used as written. `var(--ts-ink)` is read where it is
declared, so it is only right when written on the calendar itself, not on `:root` or a
wrapper above a theme island; avoid `CanvasText`, which is black in a dark theme.

- The `cvd` palette (`data-ts-palette="cvd"`) turns it on, in `--ts-ink`, because
  that is where a reader who cannot tell red from green needs it.
- Forced colours always draw it, in `Highlight`, whatever the token says: colour is
  gone in that mode and losses would otherwise look alike.
- The six presets leave it off.
- A default dashboard therefore tells a loss by colour and, for assistive technology,
  by the signed figure in each cell's name and in the summary; the cell itself draws
  no sign. See [docs/ACCESSIBILITY.md](../ACCESSIBILITY.md) rule 15 and
  RFC 0005 Decision 95.

## States

| State | When | What the tile shows |
|---|---|---|
| Loading | `data` is `undefined`, or `state="loading"` | A skeleton of the figures and the grid |
| Empty | `data = null` | "No trading days yet", or your `slot="empty"` content. `days: []` draws the empty grid with "No trading days in this period" under it |
| Error | `state="error"`, `error` set, an unparseable `data` attribute, or a view model that throws | The message, and Retry if enabled |
| Content | An object | The calendar and its figures |

## Accessibility

- The calendar is an ARIA `grid`: `role="grid"` named "Daily P&L calendar", one
  `role="row"` for each weekday (inside a `rowgroup` for each half-year band) and a
  `role="gridcell"` for each day. Its description is the summary: "Daily P&L
  calendar, 12 Oct 2025 to 12 Oct 2026: best day Tue 7 Jul, +4,200.00, worst day Mon
  3 Aug, -1,900.00, net +21,400.00". The tile is named with its net: "Daily P&L
  calendar, net +21,400.00 over 180 trading days". The RFC says the grid is
  `role="img"`, but the children of an image are presentational and cannot be
  focusable, so this is the nearest valid thing (see the changelog's internal notes).
- Every cell is named with its date and signed value ("Mon 12 Oct, −310.50"; "Tue
  13 Oct, no entry"; "Fri 16 Oct, upcoming"). The month and weekday names beside the
  grid are decoration (`aria-hidden`): the same words are in the cell names.
- **Keyboard.** One cell is the tab stop, today's to begin with, and it stays where
  you left it. Left and Right move between weeks (Right is always the later week,
  whatever the page's direction, since time runs left to right, and from the last
  week of the first half-year band into the second), Up and Down between the weekdays
  of a week, Home and End to the first and last week of the row, Control with Home or
  End to the first and last cell, and Page Up and Page Down to the same weekday in
  the month before and after. A rebuild, from a width change or a new week, keeps the
  focus on the same date where it is still drawn.
- **The corner mark is an opt-in cue** (RFC 0005 Decision 95). By default a loss
  cell is told apart by colour and by its name, which carries the signed value
  ("Mon 12 Oct, −310.50"), as does the summary. A host turns the corner on with
  `--ts-loss-mark: currentColor`, and the `cvd` palette and forced colours turn it
  on themselves.
- The net and the best and worst day carry `+` or the true minus and an `aria-hidden`
  arrow; a figure that rounds to zero has neither.
- Under forced colours the heat is drawn again from system colours: a gain in
  `Highlight` and a loss in `CanvasText`, each stepped by strength, a loss with a
  double border and its corner (drawn whatever `--ts-loss-mark` says), a flat day in
  `ButtonFace`, a day with no entry dotted and a day to come dashed.
- Nothing animates apart from the shared change flash, which stops under
  `prefers-reduced-motion`. The cells are smaller than 44px by design: they are a
  chart, not controls, and every figure is also in the header.
