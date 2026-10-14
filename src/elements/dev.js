/**
 * Development-only diagnostics (RFC 0002 §7.1).
 *
 * Call sites are written `if (DEV) warnOnce(…)` so a production build, which
 * defines __TS_DEV__ as false, drops the message strings and whatever
 * validation feeds them. Unbundled source has no such define, so DEV is true.
 */

/* global __TS_DEV__ */
export const DEV = typeof __TS_DEV__ === 'undefined' ? true : Boolean(__TS_DEV__)

const warned = new Set()

/** Warn once per key: a clock tick or a re-render must not repeat itself. */
export function warnOnce(key, message) {
  if (warned.has(key)) return
  warned.add(key)
  console.warn('tickslate: ' + message)
}

/** For tests, which need each warning to fire again. */
export function resetWarnings() {
  warned.clear()
}
