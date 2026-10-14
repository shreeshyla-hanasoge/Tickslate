/**
 * Undo history for <ts-grid> (RFC 0002 §5.3). Pure: no DOM, so node tests
 * cover it.
 *
 * One stack per profile, because a user who edits "closed" and then "market"
 * expects Undo to act on the layout they are looking at. Layouts are stored
 * as given: the core's edits are immutable, so a snapshot is just a reference.
 */

export function createHistory(cap = 20) {
  // A cap below 1 would make push() a silent no-op that looks like a bug.
  const limit = Math.max(1, Math.floor(cap) || 20)
  // A null-prototype map, so a profile called "toString" is an ordinary key.
  let stacks = Object.create(null)

  return {
    /** Remember `layout` as the state to return to for `profile`. The oldest entry goes past the cap. */
    push(profile, layout) {
      const stack = stacks[profile] || (stacks[profile] = [])
      stack.push(layout)
      if (stack.length > limit) stack.shift()
    },
    /** The most recent layout for `profile`, removed from the history, or null when there is none. */
    undo(profile) {
      const stack = stacks[profile]
      return stack && stack.length ? stack.pop() : null
    },
    /** Forget everything, as when the host sets a layout of its own. */
    clear() {
      stacks = Object.create(null)
    },
  }
}
