/**
 * The one timer behind every widget's freshness re-render (RFC 0003 §6.2, §23).
 *
 * A page of thirty live tiles needs one interval, not thirty, so subscribers
 * share it. It runs only while someone is subscribed and the page is visible,
 * and a widget that comes back to a visible page renders itself (the base's
 * visibilitychange handler), so the ticker has no catching up to do.
 */

const PERIOD = 15000

const subscribers = new Set()
let timer = 0

const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden'

const tick = () => {
  // A copy: a subscriber's render may unsubscribe itself.
  for (const fn of [...subscribers]) fn()
}

const sync = () => {
  const want = subscribers.size > 0 && !hidden()
  if (want && !timer) {
    timer = setInterval(tick, PERIOD)
    // Never keep a Node process (a test, server rendering) alive for a re-render nobody will see.
    if (typeof timer === 'object' && timer.unref) timer.unref()
  } else if (!want && timer) {
    clearInterval(timer)
    timer = 0
  }
}

/** Calls `fn` every 15 s while the page is visible; returns the function that stops it. */
export function subscribe(fn) {
  subscribers.add(fn)
  // The same function each time, which adding twice does not duplicate.
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', sync)
  sync()
  return () => {
    subscribers.delete(fn)
    sync()
    if (!subscribers.size && typeof document !== 'undefined') document.removeEventListener('visibilitychange', sync)
  }
}
