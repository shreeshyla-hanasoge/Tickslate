### Added

- `createCalendar` accepts sessions that cross midnight or never close: a `close` before `open` is on the next local day (`open: '17:00', close: '16:00'`), and a `close` equal to `open` is a 24-hour session (`'00:00'` to `'00:00'` for crypto). `days` lists the weekdays a window opens on, and `holidays` and `specialSessions` are keyed by the opening date. `'24:00'` is still rejected.
- Windows that touch are one: a session written as daily windows from Sunday 17:00 is open until Friday 17:00, and `state`, `nextChange` and `windows` report that single window.
- A session that is still open a month ahead has no close to name: `state` returns `open: true` with `closesAt`, `startedAt` and `progress` all `null`, `nextChange` returns `null`, `activeProfile` stays `'market'` and `nextProfileChange` returns `null`.
- `<ts-session-clock>` shows "Open 24/7" for such a session, with a full track and no countdown, and an overnight window's lane and times span two dates, naming the day of any time that is not today.
- Message keys `session.open247` and `session.ariaOpen247`, so that text can be translated.

### Changed

- `SessionState.closesAt`, `startedAt` and `progress` can be `null` while `open` is `true`; read them as "no close in sight". `Calendar.nextChange` can then return `null` for an open session.
- `Calendar.hours(id, date)` returns the window that opens on `date`, and for an overnight session its `close` is on the next day. `Calendar.windows` merges windows that touch.
- `candleClose` for a session with no known start or end aligns to the day's own window.
- `zonedTime` puts a wall time inside a spring-forward gap just after the gap, shifted by its length (02:30 on the day New York springs forward is 03:30 EDT), in every zone; west of Greenwich it landed an hour early before. A time that happened twice when clocks went back is the earlier one. A window whose ends coincide once resolved is skipped.
- A calendar reads its specs and holidays once, at `createCalendar`, and keeps a frozen copy; `session(id)` returns it, and changing your own objects afterwards has no effect.
- `<ts-session-clock>` with a known close but no known start (open for over a month) shows no progress track, only the countdown and the close; a Banner lane reads "–Thu 00:00".
- A session spec with a `close` at or before its `open` used to throw `TypeError` ("sessions can't cross midnight"); it is now valid. A host that relied on the throw to catch a typo in `close` should check its specs.

### Internal

- `windowOn(spec, date)` returns the window that opens on a date, with a next-day close when `close <= open`, and `mergeWindows` joins windows that touch; neither is exported. `reachEnd` and `reachStart` walk the neighbours of a window for at most the 31-day look-ahead, and a walk that is still touching at the limit is what "never closes" means. Computed windows are cached per calendar (at most 4,096), because a session that never closes walks about 60 windows to say so, once a second per clock.
- Differences from RFC 0003 §12: `startedAt` is also `null` when the run began more than 31 days before `now`, even if its close is known, so `progress` is `null` there too (the RFC names only the forward case). `windows()` returns finite numbers, so a run that never closes is cut a look-ahead past `to` and before `from`; `activeProfile` reads a close beyond its horizon as "never". `specialSessions` may cross midnight as well, which the RFC does not state. `candleClose` for a session with no known start or end is not in the RFC. `session.ariaOpen247` is a second new key, beside the RFC's `session.open247`, for the tile's accessible name.
- The `validation` test that expected a close before the open to throw ("cross midnight") now expects `'24:00'` to throw instead, because that case is valid under the RFC. Every other existing calendar test passes unchanged.
- Tests: `test/zone.test.mjs` covers gap and fall-back times in New York, Chicago, London, Sydney, Lord Howe (30-minute gap) and Chatham (45-minute offset), and windows that end in a gap; `test/calendar.test.mjs` covers overnight windows, touching windows, sessions that never close, and the daylight-saving weeks of `America/Chicago` and `America/New_York`; `test/session-clock.test.mjs` covers the lanes, "Open 24/7" and a sweep for negative or NaN countdowns; `test/messages.test.mjs` runs a 24/7 session through the pseudo-locale.
- `docs/reference/core.md` and `docs/widgets/ts-session-clock.md` describe overnight and 24/7 sessions.
