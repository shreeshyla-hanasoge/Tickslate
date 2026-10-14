### Added

- `configure()` and the `hour-cycle` attribute accept `h12`, `h23` or `auto`.
- `fmt.date()` formats dates for the active locale on the Gregorian calendar.

### Changed

- Word durations follow the active locale; English output is unchanged.
- Time labels follow `hour-cycle`: 24-hour by default, `auto` for the locale's own.
- Fit decisions and middle ticks follow the active locale, including right-to-left text.
- `<ts-grid>` passes changes to `locale`, `currency`, `time-zone` and `hour-cycle` on to its tiles.

### Internal

- The core formatter reworks its locale handling behind the existing API.
