### Added

- `SessionSpec.breaks` (and `breaks` on a special session): gaps such as a lunch break. The session is closed during one, `calendar.state()` gains `onBreak` and `ends`, and `<ts-session-clock>` reads "Break" and "resumes 12:30", counts "to break", draws the gap and names itself "on break".
- `presets.nyse()`, `presets.nasdaq()` (each with `pre`, `post` and `extended` segments), `presets.lse()`, `presets.fx()` and `presets.tse()` (with a lunch break), each citing the exchange page and the date its hours were read; `presets.nse()` and `presets.mcx()` now cite theirs too. The guide lists them.
- `calendar.holidaysThrough(id)`, `calendar.issues` and the `now` option of `createCalendar`: a holiday list that ends less than 30 days ahead is a `'holiday-coverage'` issue, and `<ts-session-clock>` logs it once in development. Tickslate still fetches no holidays.
- `calendar.windows(id, from, to, { throughBreaks })` and `duringBreaks: 'closed'` on a profile schedule: a lunch break does not change the layout profile unless the schedule asks.
- A guide, `docs/guide/sessions.md`: the presets and their sources, breaks, special days, passing a holiday list and rebuilding the calendar.
- Messages `session.break`, `session.resumes`, `session.toBreak` and `session.ariaBreak`.

### Internal

- Deviations from RFC 0004 §5: `hours(id, date)` has `breaks` only when the window has any, so a session without breaks answers as before; `calendar.state()` has `onBreak` and `ends` on every result, so the one existing assertion on an exact state (the crypto probes) names them. Two breaks that touch are rejected as overlapping, and a break at the very edge of its window is rejected, because it would be a different open or close.
- `presets.cme()` and `presets.crypto()` are not written: cmegroup.com refused every automated request (HTTP 403) and no crypto exchange page could be read, and a preset is never written from memory. `mcx` was not re-read either (mcxindia.com answered 403), so its citation keeps the date it was last confirmed, 2026-10-13, and says so.
- The NYSE extended segments are NYSE Arca Equities' early and late sessions on the exchange's page, not NYSE's own (Tape A has only the core session); the preset comment, the typings and the guide say so, and that an early-close day needs `nyse-post` and `nyse-ext` overridden too.
- Holidays stay per session id (`nse` and `nse-fo` are different lists); the guide says a segment needs its own entry or `'*'`, and that a Friday holiday removes nothing from `fx`. Segments inheriting the base id's holidays was tried and dropped, because it closed `nse-fo` on `nse`'s dates and an existing test (and the F&O segment's own list) says otherwise.
- A break that touches an end of its window (a close range ends it early, or a spring-forward gap swallows the start) moves that end of the window instead of leaving a gap with nothing after it: `state()`, `nextChange` and `candleClose` no longer throw. A break that starts at or after a shorter close is ignored. A break that begins inside a spring-forward gap and ends outside it is dropped, as `open` resolves forward by the same rule.
- The dev warning for a short holiday list is now once per calendar, as the guide said; it was once per message.
- Tests: breaks, DST weeks (London, New York, Tokyo), every invalid break shape, the profile through a break, each preset, the citation test (which also reads the guide), holiday coverage with a given and a stubbed clock, and the clock's break lane and development warning.
