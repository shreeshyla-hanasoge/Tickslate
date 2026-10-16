### Added

- `<ts-pnl-calendar>` (sizes Tall, M, Banner): a heat map of daily profit and loss, one cell per trading day, green for a gain and red for a loss, stronger the bigger the day. Tall shows 6 weeks, M 13 and Banner a year; on a phone the Banner year folds into two half-year bands. It reads the same `days` series as the equity curve, `today` marks the later days as upcoming, and its entry is `tickslate/elements/pnl-calendar`.
- `dayStats(days, { timeZone })`: net, green and red days, the green rate and the best and worst day of a daily series. Rows with the same date are summed first, and empty input gives zeros and `null`.
- Each cell is named with its date and signed value ("Mon 12 Oct, +1,240.00"), and the grid is one image with a summary of the best day, the worst day and the net. A loss also carries a corner mark in the ink colour, so it never depends on colour alone.
- The cells are one tab stop with the arrow keys, Home, End and Control with Home or End to move between days; down from a half-year band's last row continues into the next band.
- The week starts on the locale's first day and its weekend days have no cell, where `Intl.Locale` week info exists (Monday and Saturday-Sunday elsewhere). A weekend entry, such as a special session, counts in every total and is not drawn.
- The `PnlCalendarData`, `PnlCalendarCell`, `CalendarModel`, `TsPnlCalendarAction` and `DayStats` types, `TsPnlCalendar.calendarModel()`, the `calendar.*` messages and `widget.pnlCalendar.empty`.

### Internal

- Deviation from RFC 0003 §21.1: a year is 53 week columns, not 52, so every weekday of the last 365 days has a cell whichever weekday today is. Tall and M count 6 and 13 columns as written.
- The RFC does not say how a phone is told from a desktop, so the tile measures itself: under 560px of width (`BAND_BELOW`) a Banner folds into two bands, the first holding the extra week of an odd count. A `ResizeObserver` re-renders it when the width crosses that line, and the focused date survives the fold.
- Deviation from §21.1, on the cell semantics: the grid is `role="img"` as written and each cell is a focusable `role="img"` named with its date and value, so a screen reader in browse mode hears the summary and a keyboard reader hears each day. axe reports nothing on it, but a reader may not announce a focusable child of an image the same way in every engine.
- Cell colours are placed with one CSSOM custom property (`--s`, the strength) so a strict `style-src` cannot blank them. Cells are made with `createElement`, since how many there are depends on the locale's week; no markup is built from data.
- The strength's maximum is over the days drawn, so a weekend entry (counted in the totals, not drawn) does not dim the days beside it. A day that rounds to nothing at the money format is flat, not a loss with no minus.
- Month names sit on the first column of a new month, never within four columns of each other (five after a January, which carries its year).
- The figures' shrink-to-fit rule is overridden at .72em a character, so a wide fallback face with tracking still fits; the shared .62 clipped it.
- Size: `tickslate/elements/pnl-calendar` is 23,301 B min+gz bundled with the core, with a new 25.5 kB budget. The core's messages and `dayStats` grew every bundle by about 0.1 to 0.2 kB; `equity-curve` is at 23,039 B of its 23,040 B budget and `today-pnl` at 22,977 B of 23,040 B, so the next change to the core will need one of them re-measured. No budget was raised.
- Tests: `test/pnl-calendar.test.mjs` (the model, the week layout, year boundaries, the phone wrap and the keyboard), `dayStats` in `test/stats.test.mjs`, `test/browser/calendar.spec.mjs` with `fixtures/calendar.html` and `pnlCalendar()` in `fixtures/data.js`. Existing tests that list widgets changed by a line each: `tile-chrome` and `entries`. `scripts/pack-lib.mjs` lists `CalendarModel` under `pnl-calendar` in `TYPE_EXTRAS`, because its name does not start with its widget's.
