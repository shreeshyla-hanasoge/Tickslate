# Sessions, presets and holidays

`<ts-session-clock>` and the grid's `schedule` read a **calendar**: plain data
that says when each market trades. Tickslate ships presets for the markets
below, reads breaks such as a lunch break, and warns when your holiday list is
about to run out. It never fetches anything: the hours are written into the
presets, and holidays are yours to pass in.

```js
import { createCalendar, presets } from 'tickslate'

const calendar = createCalendar({
  sessions: [presets.nyse(), presets.lse(), presets.tse()],
})
```

## The presets

Each preset gives a market's **regular** hours, read from the exchange's own
page on the date shown. Exchanges change their hours, so the table says where
they came from, and a host can always pass its own `SessionSpec`.

| Preset | Ids | Hours (local) | Source | Checked |
|---|---|---|---|---|
| `nyse` | `nyse`, `nyse-pre`, `nyse-post`, `nyse-ext` | Mon to Fri, New York: 09:30 to 16:00. The `pre`, `post` and `extended` segments are NYSE **Arca Equities'** early session (04:00 to 09:30) and late session (16:00 to 20:00), not NYSE's own: Tape A has only the core session, and other NYSE venues start early trading at 07:00 | https://www.nyse.com/markets/hours-calendars | 2026-10-26 |
| `nasdaq` | `nasdaq`, `nasdaq-pre`, `nasdaq-post`, `nasdaq-ext` | Mon to Fri, New York: 09:30 to 16:00; pre-market 04:00 to 09:30; after hours 16:00 to 20:00 | https://www.nasdaq.com/market-activity/stock-market-holiday-schedule | 2026-10-26 |
| `lse` | `lse` | Mon to Fri, London: 08:00 to 16:30. The opening and closing auctions either side are not drawn | https://www.londonstockexchange.com/personal-investing/faqs | 2026-10-26 |
| `tse` | `tse` | Mon to Fri, Tokyo: 09:00 to 11:30 and 12:30 to 15:30, with a lunch break | https://www.jpx.co.jp/english/equities/trading/domestic/01.html | 2026-10-26 |
| `fx` | `fx` | Sunday 17:00 to Friday 17:00, New York | https://www.cboe.com/about/hours/fx/ | 2026-10-26 |
| `nse` | `nse`, `nse-fo` | Mon to Fri, India: 09:15 to 15:30 (equity), 09:15 to 15:40 (derivatives) | https://www.nseindia.com/static/market-data/market-timings | 2026-10-26 |
| `mcx` | `mcx`, `mcx-cotton`, `mcx-agri` | Mon to Fri, India: 09:00 to 23:30 or 23:55 by US daylight saving, 21:00 for cotton, 17:00 for other agri. Not re-read on the date shown: the exchange's site refused automated requests, so these are the hours last confirmed on 2026-10-13 | https://www.mcxindia.com/docs/default-source/circulars/english/2026/february/circular---068---2026.pdf | 2026-10-13 |

The spot FX market has no exchange of its own; the `fx` preset follows one
venue's published week. Two markets are not here: **CME Globex equity index
futures**, whose site would not answer an automated request when this was
written, and **crypto**, for which no exchange page could be read. Write them
as your own specs (a 24/7 spec is `open: '00:00', close: '00:00'` on every
day) until a preset can cite its source.

Presets carry no holidays and no early closes.

## Early closes and special days

A half day replaces that day's hours. Name the date in `specialSessions`; a
special session has only its own breaks, so a half day with no lunch break is
written without one.

```js
const nyse = {
  ...presets.nyse(),
  specialSessions: { '2027-11-26': { open: '09:30', close: '13:00' } },
}
```

The extended segments are sessions of their own, so on an early-close day
override `nyse-post` and `nyse-ext` as well (the late session ends at 17:00
that day, not 20:00), or they keep running to 20:00.

## Breaks

`SessionSpec.breaks` lists gaps inside each window, such as a lunch break. They
are `'HH:MM'` local times, sorted, apart from each other and strictly inside
the window, at most four. `presets.tse()` is written this way:

```js
{
  id: 'tse', label: 'TSE', timeZone: 'Asia/Tokyo', days: [1, 2, 3, 4, 5],
  open: '09:00', close: '15:30',
  breaks: [{ from: '11:30', to: '12:30' }],
}
```

During a break `calendar.state(id, now)` is closed with `onBreak: true`, and
`opensAt` is the break's end. Before a break `ends` is `'break'` (it is
`'close'` before the close). `windows()` returns the two segments, and
`hours()` returns the whole window with its `breaks`. A candle never crosses a
break: `candleClose` stops at it, and the candles after it count from its end.

`<ts-session-clock>` reads "Break" and "resumes 12:30" while one lasts, draws it
as a gap in the track, and counts "1h 12m to break" before it.

**The layout profile does not change at lunch.** `activeProfile` and
`nextProfileChange` treat a break as open, so a grid's market layout stays put.
To switch during it, set `duringBreaks: 'closed'` on the schedule:

```js
const schedule = { market: { sessions: ['tse'], duringBreaks: 'closed' } }
```

## Holidays are yours

A preset has no holiday list, because the dates change every year and only the
exchange knows them. Fetch the list from the exchange (or a data source you
trust) in your own code, shape it into `{ sessionId: ['YYYY-MM-DD', …] }` and
pass it to `createCalendar`. The dates below are made up.

```js
import { createCalendar, presets } from 'tickslate'

// Your own code: fetch the exchange's list for the sessions you show.
const dates = await loadHolidays('nyse')           // ['2027-01-01', '2027-01-18', …]

let calendar = createCalendar({
  sessions: [presets.nyse()],
  holidays: { nyse: dates },       // '*' applies to every session
})
clock.data = { calendar, sessions: ['nyse'] }
```

A holiday removes the window that **opens** that day, breaks included. Holidays
are per session id: `holidays: { nyse: dates }` closes `nyse` only, so a host
that shows `nyse-pre`, `nyse-post` or `nyse-ext`, or `nse-fo`, passes the dates
under each id it uses (or under `'*'`). A Friday holiday removes nothing from
`fx`: the week's windows open Sunday to Thursday, so a holiday on a Friday
(Cboe lists 25 December and 1 January) does not shorten it. A
calendar is immutable: when you renew the list, build a new one and set it on
the clock (`clock.data = { calendar: renewed, sessions }`) and pass it to
anything else that holds the old one.

## When the list runs out

A market looks open on a holiday the list does not know about, so the calendar
checks the list when it is created.

- `calendar.holidaysThrough(id)` is the last date any list covers for that
  session (the later of `holidays['*']` and `holidays[id]`), or `null` when it
  has none.
- `calendar.issues` holds a `'holiday-coverage'` entry for each session whose
  non-empty list ends less than **30 days** after `now`, with a message such as
  `The holiday list for "nyse" ends on 2027-12-31, 22 days from now.` A session
  with no list at all gets no issue: leaving it out is a choice (crypto, FX, a
  test).
- `<ts-session-clock>` logs each issue once per calendar in development builds,
  followed by "See docs/guide/sessions.md". Production builds contain neither
  the check nor the text, and the clock looks the same either way.

`now` is read once when the calendar is created. Pass it in tests, or on a
server that renders at a fixed time (`createCalendar({ …, now })`). A page
left open for months keeps the issues it was built with, so a long-lived
host rebuilds its calendars when its holiday list is renewed, or each day.

```js
const calendar = createCalendar({ sessions, holidays, now: Date.UTC(2027, 11, 9) })
calendar.issues.forEach((issue) => report(issue.message))
```

See [Session calendars](../reference/core.md#session-calendars) for every member
and [`<ts-session-clock>`](../widgets/ts-session-clock.md).
