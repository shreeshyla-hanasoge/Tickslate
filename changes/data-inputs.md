### Added

- `toTime(v)` and `toDay(v, timeZone?)`, with the `Time` type, exported from `tickslate`. Every field that takes an instant now accepts epoch seconds or milliseconds, a `Date`, an ISO 8601 string (including Laravel's six-digit microseconds) or a numeric string. Days accept `'YYYY-MM-DD'` or any instant, read in the formatter's time zone. An ISO string at exact UTC midnight is read as the plain date it stands for.
- `equitySeries` and `equityStats` take `{ timeZone }` (default `'UTC'`). The equity curve passes its formatter's zone, so `'2026-10-11T18:30:00.000000Z'` is 12 October in `Asia/Kolkata`.
- `toNumber` accepts decimal-library objects with a numeric `toNumber()` method (Decimal.js, big.js).
- `createFormatter` validates `locale`, `currency` and `timeZone`. An invalid option falls back to the `configure()` default and is listed in `formatter.issues` as `{ option, value, message }`. `money()` no longer throws because of a bad option.
- The Today's P&L, Equity curve and Session clock view models return `dropped`, the count of rows they couldn't use.

### Changed

- Today's P&L reads `intraday[].t`, `marks[].t`, `window` and `asOf` with `toTime`, and the Equity curve reads days with `toDay`.
- `filterRange(days, range, timeZone?)` takes the time zone used to read instants as days.

### Breaking

- A number below 1e11 in an instant field is now read as seconds, not milliseconds. Millisecond values before March 1973 would be misread; send an ISO string for those.
- `toNumber` rejects strings it used to accept: `'0x10'`, `'0b1'`, `'Infinity'` and `''` are `NaN`. Only decimal and exponent strings parse.

### Internal

- Time and date parsing live in `src/core/time.js`. Session clock `dropped` counts session ids that aren't strings and timeframes that aren't positive numbers; an id the calendar doesn't know still shows as an error lane.
- New regression tests cover the seconds/ms boundary, negative epochs, ISO offsets, microsecond strings, `Date` objects, the IST day, hex strings, a bad currency and 200,000 readings.
