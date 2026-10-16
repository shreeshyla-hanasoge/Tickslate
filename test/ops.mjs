/**
 * Counts the reads a pure function makes of its input, so a test can assert on
 * how the work grows with the input instead of on how long it took. Time flakes
 * under CPU load; a count of property reads is the same on every run. A loop
 * that visits other rows (an accidental O(n^2)) shows up as extra reads.
 *
 * Not named *.test.mjs, so `npm test` never runs it on its own. Imports nothing.
 */
export function counter() {
  const state = { reads: 0 }
  const cache = new WeakMap()
  const wrap = (value) => {
    if (value === null || typeof value !== 'object') return value
    if (cache.has(value)) return cache.get(value)
    const proxy = new Proxy(value, {
      get(target, key, receiver) {
        state.reads++
        return wrap(Reflect.get(target, key, receiver))
      },
      has(target, key) {
        state.reads++
        return Reflect.has(target, key)
      },
      ownKeys(target) {
        state.reads++
        return Reflect.ownKeys(target)
      },
    })
    cache.set(value, proxy)
    return proxy
  }
  return { wrap, get reads() { return state.reads } }
}

/** Reads made by `fn(wrap(input))`. */
export function readsOf(input, fn) {
  const c = counter()
  fn(c.wrap(input))
  return c.reads
}
