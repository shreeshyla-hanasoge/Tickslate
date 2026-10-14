/**
 * What a key or a tap means while <ts-grid> is editing (RFC 0002 §5.9), kept
 * pure so every row of the table is tested in Node without a DOM.
 *
 * Both inputs share one "held" state: the tile that has been picked up and
 * not yet dropped. That is what lets a keyboard user and a single-pointer
 * user (WCAG 2.5.7) do the same things, in the same order, to the same tile.
 *
 * @typedef {{ held: string | null }} EditState
 * @typedef {(
 *   { type: 'pickUp', id: string } |
 *   { type: 'moveBy', id: string, dCol: -1 | 0 | 1, dRow: -1 | 0 | 1 } |
 *   { type: 'placeAt', id: string, targetId: string } |
 *   { type: 'resizeStep', id: string, dir: 1 | -1 } |
 *   { type: 'remove', id: string } |
 *   { type: 'cancel', id: string } |
 *   { type: 'drop', id: string }
 * )} EditAction
 */

const ARROWS = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

// 'Spacebar' is what old Edge and Firefox reported for the space bar.
const isActivate = (key) => key === ' ' || key === 'Enter' || key === 'Spacebar'

/**
 * @param {string} key a KeyboardEvent.key
 * @param {string} focusedId the tile whose handle has focus
 * @param {EditState} state
 * @returns {EditAction | null}
 */
export function keyAction(key, focusedId, state) {
  const held = state && state.held ? state.held : null
  if (held) {
    // The held tile is the subject even if focus has wandered to another handle.
    if (isActivate(key)) return { type: 'drop', id: held }
    if (key === 'Escape') return { type: 'cancel', id: held }
    const arrow = ARROWS[key]
    if (arrow) return { type: 'moveBy', id: held, dCol: arrow[0], dRow: arrow[1] }
    return null
  }
  if (!focusedId) return null
  if (isActivate(key)) return { type: 'pickUp', id: focusedId }
  if (key === '+' || key === '=') return { type: 'resizeStep', id: focusedId, dir: 1 }
  if (key === '-' || key === '_') return { type: 'resizeStep', id: focusedId, dir: -1 }
  if (key === 'Delete' || key === 'Backspace') return { type: 'remove', id: focusedId }
  return null
}

/**
 * @param {string | null} tappedId the tile whose handle was activated, or null for the empty board
 * @param {EditState} state
 * @returns {EditAction | null}
 */
export function tapAction(tappedId, state) {
  const held = state && state.held ? state.held : null
  if (held) {
    if (!tappedId) return { type: 'cancel', id: held }
    if (tappedId === held) return { type: 'drop', id: held }
    return { type: 'placeAt', id: held, targetId: tappedId }
  }
  return tappedId ? { type: 'pickUp', id: tappedId } : null
}
