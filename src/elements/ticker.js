/**
 * The one timer behind every widget's periodic re-render (RFC 0003 §6.2, §23).
 *
 * A page of thirty live tiles needs one interval, not thirty, so subscribers
 * share it. It beats once a second, aligned to the wall clock's second
 * boundary so the tiles' clocks all change together and a flash lands in step.
 * A subscriber asks for a period in whole seconds (1 s for a clock, 15 s for
 * freshness, 60 s for a calendar) and is called every that-many beats.
 *
 * It runs only while someone is subscribed and the page is visible, and a
 * widget that comes back to a visible page renders itself (the base's
 * visibilitychange handler), so the ticker has no catching up to do.
 */

const BEAT = 1000
const DEFAULT_PERIOD = 15000

const subscribers = new Map() // fn -> { every: beats, left: beats until the next call }
let align = 0 // the timeout that waits for the next second boundary
let timer = 0 // the interval that beats once a second after that

const hidden = () => typeof document !== 'undefined' && (document.hidden === true || document.visibilityState === 'hidden')

/** Whether a period can ride the shared beat: a whole number of seconds. */
export const shareable = (ms) => ms >= BEAT && ms % BEAT === 0

const unref = (handle) => {
  // Never keep a Node process (a test, server rendering) alive for a re-render nobody will see.
  if (handle && typeof handle === 'object' && handle.unref) handle.unref()
  return handle
}

const beat = () => {
  // A copy: a subscriber's render may unsubscribe itself or another.
  for (const [fn, entry] of [...subscribers]) {
    if (subscribers.get(fn) !== entry) continue
    if (--entry.left > 0) continue
    entry.left = entry.every
    fn()
  }
}

const stop = () => {
  clearTimeout(align)
  clearInterval(timer)
  align = 0
  timer = 0
}

const start = () => {
  // Waiting for the boundary first, then a plain interval from there: an
  // interval started on the boundary stays on it to within a few ms.
  align = unref(
    setTimeout(() => {
      align = 0
      timer = unref(setInterval(beat, BEAT))
      beat()
    }, BEAT - (Date.now() % BEAT)),
  )
}

const sync = () => {
  const want = subscribers.size > 0 && !hidden()
  if (want && !align && !timer) start()
  else if (!want && (align || timer)) stop()
}

/**
 * Calls `fn` every `ms` (a whole number of seconds, default 15 s) while the
 * page is visible; returns the function that stops it.
 */
export function subscribe(fn, ms = DEFAULT_PERIOD) {
  const every = Math.max(1, Math.round(ms / BEAT))
  // The same function again replaces its period rather than doubling up.
  subscribers.set(fn, { every, left: every })
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', sync)
  sync()
  return () => {
    subscribers.delete(fn)
    sync()
    if (!subscribers.size && typeof document !== 'undefined') document.removeEventListener('visibilitychange', sync)
  }
}
