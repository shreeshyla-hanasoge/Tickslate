### Added

- `fmt.unit(value, unit, { decimals?, compact? })`: '182 ms' for an ECMA-402 sanctioned unit (or an `x-per-y` pair of them), formatted with `Intl.NumberFormat` style `'unit'`; any other unit is appended after a space ('3 seats', '1.2M users').
- `fmt.fit` takes `{ style: 'money' | 'number' | 'percent' }` (default `'money'`) and `decimals`.
- `Formatter` types declare `unit`, the `fit` options and `number`'s `compact`.

### Changed

- `fit` tries the full form, then (for `number` and `percent`) no decimals, then compact, and returns the compact form only when it is shorter than the best form so far.
- Documented that `percent` takes a fraction (0.12 is '+12.00%').

### Breaking

- None. Money `fit` keeps going straight from full to compact, because existing headlines pin that output; RFC 0002 §4.4 lists a no-decimals step, which is applied to `number` and `percent` only. The maintainer may choose to extend it to money.

### Internal

- Tests for en-US and de-DE cover each new member.
