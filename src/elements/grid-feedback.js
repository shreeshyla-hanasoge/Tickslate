/**
 * What <ts-grid> shows to say what it is doing (RFC 0004 §3): the resize badge,
 * the first-run hint and the calm profile switch. Pure: no DOM, and timers are
 * passed in, so node tests drive every rule with a fake clock.
 */

import { SIZES } from '../core/sizes.js'

// How long the badge stays after the last pointer-up or key press, and how long its fade takes.
export const BADGE_HOLD_MS = 1000
export const BADGE_FADE_MS = 200
// --ts-motion when the grid can't read one; half of it is each way of the crossfade.
export const DEFAULT_MOTION_MS = 220

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k)

/**
 * "Medium · 2×2": the size's name and its nominal footprint. Nominal, not what a phone renders (an L is
 * placed 2 wide there), because the badge names the size the layout will save, as the picker does.
 */
export function badgeText(t, size) {
  if (!hasOwn(SIZES, size)) return String(size)
  return t('grid.badge', { name: t(`size.${size}`), cols: SIZES[size].cols, rows: SIZES[size].rows })
}

/**
 * The badge's life. `hooks.show(tile, text)` puts it up, `hooks.fade(tile)` starts its exit (or removes it
 * at once under reduced motion) and `hooks.hide(tile)` removes it now. `release()` starts the wait; each
 * later release restarts it, so the last key press decides.
 */
export function createBadgeLife(hooks, timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) }, hold = BADGE_HOLD_MS) {
  let id = null
  let timer = 0
  const stop = () => {
    timers.clear(timer)
    timer = 0
  }
  return {
    /** The tile the badge is on, or null once it has begun to leave. */
    get tile() {
      return id
    },
    show(tile, text) {
      stop()
      // One badge at a time: a second tile's resize takes it over.
      if (id !== null && id !== tile) hooks.hide(id)
      id = tile
      hooks.show(tile, text)
    },
    release() {
      if (id === null) return
      stop()
      timer = timers.set(() => {
        timer = 0
        const tile = id
        id = null
        hooks.fade(tile)
      }, hold)
    },
    /** A cancelled gesture, a removed tile, a disconnect: gone now. */
    clear() {
      stop()
      if (id !== null) hooks.hide(id)
      id = null
    },
  }
}

/**
 * The hint's state. `on` follows the attribute; `done` is set by a dismissal or by edit mode and is cleared
 * only when the attribute is removed, so a host that leaves `hint` on never sees the mark come back. The
 * library keeps this in memory and nowhere else (Decision 46).
 */
export function createHintState() {
  let on = false
  let done = false
  let eligible = false
  return {
    /** The attribute was set or removed. Removing it forgets a dismissal, and says nothing. */
    attribute(value) {
      on = !!value
      if (!on) done = false
    },
    /** Whether the grid could show it now: populated, unlocked, not editing, page visible. */
    eligible(value) {
      eligible = !!value
    },
    get visible() {
      return on && !done && eligible
    },
    /** Got it. The reason to report, or null when there was nothing to dismiss. */
    dismiss() {
      return end('dismiss')
    },
    /** Edit mode started, by any route. */
    edit() {
      return end('edit')
    },
  }
  function end(reason) {
    if (!on || done) return null
    done = true
    return reason
  }
}

/** Touch screens get the long-press wording; a pointer gets the one that also names Edit layout. */
export function hintKey(coarse) {
  return coarse ? 'grid.hint.touch' : 'grid.hint.pointer'
}

/**
 * What a profile change does beyond the apply. A crossfade runs when the schedule moved the board (a user's
 * own override, the attribute, the first render and every edit apply at once); the toast offering to keep
 * the previous profile is for a scheduled change only, since after 'override-ended' the user already chose.
 */
export function planSwitch({ reason, quiet = false, rendered = true }) {
  const calm = !quiet && rendered && (reason === 'schedule' || reason === 'override-ended')
  return { crossfade: calm, toast: calm && reason === 'schedule' }
}

/** A CSS time ('220ms', '.3s', '0') in milliseconds, or `fallback` for anything else. */
export function parseMs(value, fallback = DEFAULT_MOTION_MS) {
  const m = /^\s*(\d*\.?\d+)\s*(ms|s)?\s*$/i.exec(String(value))
  if (!m) return fallback
  const n = parseFloat(m[1]) * (m[2] && m[2].toLowerCase() === 's' ? 1000 : 1)
  return Number.isFinite(n) ? n : fallback
}

/** A profile's name for the toast and the status region: the built-ins by message, any other by its own name. */
export function profileName(t, profile) {
  return profile === 'market' || profile === 'closed' ? t(`controls.${profile}`) : String(profile)
}
