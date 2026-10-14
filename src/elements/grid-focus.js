/**
 * The two decisions <ts-grid> makes about focus and pointers when edit mode
 * ends (RFC 0002 §5.5), kept pure so they are tested without a DOM.
 */

/**
 * Whether a pointerdown landed outside the grid. `path` is the event's
 * composedPath(), which, unlike `target`, still names the grid when the
 * press was on something in its shadow root (the pill, its list), and
 * `extras` are other nodes that count as inside, such as a host's own menu.
 */
export function isOutside(path, grid, extras = []) {
  if (!path) return true
  for (const node of path) {
    if (node === grid || extras.includes(node)) return false
  }
  return true
}

/**
 * The first candidate focus can go to: connected, not hidden and not
 * disabled. Null when none qualifies, so the caller falls back itself.
 * Entries may be null or undefined, for an origin that was never recorded.
 */
export function pickFocusTarget(candidates) {
  for (const c of candidates) {
    if (c && c.connected && !c.hidden && !c.disabled) return c.target
  }
  return null
}
