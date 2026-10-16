# `<ts-session-clock>`

The time in an exchange's zone, whether its session is open, and how long until
it closes or opens. It is the one widget that ticks by itself.

```js
import 'tickslate/elements'
import { createCalendar, presets } from 'tickslate'
```

## Sizes

| Size | Cells (4 columns) | Shows |
|---|---|---|
| `S` | 1 x 1 | "Market open" or "Market closed", the session's name, the time in its zone with the zone name, a progress bar, and the open and close times with "2h 14m to close" or "opens in 3h 48m" between them. On a tile under 220px wide the words shorten ("Open", "2h 14m") |
| `Banner` | 4 x 1 | A header with the clock and a legend, then one lane per session: name and hours, a progress rail with candle-close ticks, and "2h 14m left" or "opens 09:15" |

`S` shows the first session only. On a phone `Banner` still spans the full
width. Any other size snaps to the nearest of these.

## Data shape

```ts
interface SessionClockData {
  /** From createCalendar(). */
  calendar: Calendar
  /** Session ids, one lane each on Banner. S shows the first. */
  sessions: string[]
  /** Banner: candle-close ticks, in minutes. Only the first two are drawn. */
  timeframes?: number[]
}
```

`calendar` is an object with methods, so it cannot travel in the JSON `data`
attribute; set the `data` property from script. Times are shown in the **first**
session's time zone for every lane, so a row of lanes reads against one clock.

On `Banner`, the first timeframe draws thin ticks for the closes in the next
hour on open lanes, and the second draws thick ticks across the whole session,
but only where they would sit at least 6px apart on the rail as it is now.
A marker shows the next close of any timeframe. The legend names them
("5m close, next hour", "1h close"). A timeframe that is not a positive number
is dropped and reported once in development.

### Overnight and 24/7 sessions

A session may close on the next local day (a futures exchange open 17:00 to
16:00) or never close (crypto). Its lane draws the window across midnight, and
each time that is not today names its day: "17:00–Tue 16:00" in the evening and
"Sun 17:00–16:00" the next morning. Windows that touch read as one, so an FX
week shows "Sun 17:00–Fri 17:00" all week. See
[Session calendars](../reference/core.md#session-calendars).

A session that is open with no close in sight shows "Open 24/7": at `S` in
place of the countdown, with a full track and no times; at `Banner` as a full
lane reading "Open 24/7" with no hours. Its candle closes still feed the
"next close" in the header. When the close is known but the session has been
open for over a month (a holiday is coming), there is no start to measure
from: the track is not drawn, `S` shows only the countdown and the close, and a
`Banner` lane reads "–Thu 00:00" with its time left.

## Minimal example

```html
<ts-session-clock id="clock" label="Session clock" size="S"></ts-session-clock>
```

```js
import { createCalendar, presets } from 'tickslate'

const calendar = createCalendar({
  sessions: [presets.nse(), presets.mcx()],
  holidays: { nse: ['2026-10-02'] },
})
const clock = document.querySelector('#clock')
clock.data = { calendar, sessions: ['nse'] }

// The same data on a Banner, with 5-minute and 1-hour candle closes:
// clock.size = 'Banner'
// clock.data = { calendar, sessions: ['nse', 'mcx'], timeframes: [5, 60] }
```

## Attributes and properties

| Name | Type | What it does |
|---|---|---|
| `size` | attribute and property | `S` or `Banner`; others snap. A grid sets it |
| `label` | attribute and property | The name in the loading view and the start of the tile's name. Defaults to "Session clock" |
| `heading-level` | attribute | The `aria-level` of the tile's heading, 1 to 6. Falls back to the nearest `<ts-grid>`'s `heading-level`, then 3 |
| `stale-after` | attribute | Accepted on every tile, and has no effect here: the dot says a session is open, not that data is fresh, and the clock reads its own time |
| `flash` | attribute | Accepted on every tile, and has no effect here: a clock changes every minute and rolls over at midnight, so nothing on this tile flashes |
| `data` | property | `SessionClockData` |
| `state` | attribute and property | `'loading'` or `'error'` |
| `error` | property | A message shows the error view; `null` clears it |
| `actions` | property | Names of the actions offered, such as `['retry']` |
| `clock` | property | A `() => number` the widget takes the time from; set it to freeze or replay the day in tests and demos |
| `locale`, `time-zone` | attributes | The clock's time zone comes from the first session, not from `time-zone`. `locale` still shapes the digits |
| `item` | attribute | The id a grid matches this child by |

It re-renders every second while connected and the page is visible, and catches
up at once when the tab becomes visible again. The base members are listed in
[Your own widget](../guide/your-own-widget.md).

## Freshness and change flashes

The session clock works out the time from its clock, not from data that ages, so its dot means an open session and the header has no "just now" or "Stale" text. It has no change flash either: a clock changes every minute and rolls over at midnight, and tinting that would be noise.

## Actions

`retry` only. With `actions = ['retry']` the error view's button fires
`ts-action` with `{ action: 'retry' }`. See [Events](../reference/events.md).

## Parts

| Part | Element |
|---|---|
| `tile` | The tile box, `role="group"` named by the headline sentence |
| `header` | The header row: the live dot, the label and the right-hand text |
| `label` | The label, a `role="heading"` whose level comes from `heading-level` (the open or closed title at `S`) |
| `value` | At `S`, the time of day |
| `empty` | The empty view's container |
| `error` | The error view's container (only while the error view shows) |
| `skeleton` | The loading view's container, around the skeleton blocks |

## States

| State | When | What the tile shows |
|---|---|---|
| Loading | `data` is `undefined`, or `state="loading"` | A skeleton of the size's layout (two lanes at `Banner`) |
| Empty | `data = null` | "No sessions set up", or your `slot="empty"` content |
| Error | `state="error"`, `error` set, or a throw | The message, and Retry if enabled |
| Content | An object | The clock. A missing calendar or an unknown session id does not throw: it shows "No calendar" or "Unknown session <id>" in place of the countdown (at `Banner`, in that session's lane) |

## Accessibility

- The tile is a `role="group"` named with the `label` followed by the state of every session:
  "Session clock: NSE open, closes 15:30" (several sessions are joined with
  semicolons). Without a `label` the name starts with "Session clock". The name updates each second, but is only rewritten when the state changes. ", live" is added while a session is open. The label is a heading.
- Open or closed is stated in words ("Market open", "Closed"); the live dot and
  the progress bar only repeat it.
- The "next close" marker and ticks are decorative; the countdown text carries
  the same information.
- The full sentence behind a shortened phone label is kept as a tooltip.
- The live pulse and the loading shimmer stop under `prefers-reduced-motion`.
