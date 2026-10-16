/**
 * Keyed rows (RFC 0003 §16): the diffing every list-shaped widget shares.
 *
 * A live table that rebuilt its rows on each tick would drop the focus a
 * keyboard user holds, reset the scroll position and make the browser redo
 * layout for every cell. Rows are matched by `id` instead: `sync` inserts the
 * new ones, removes the departed ones and moves only what a new order needs,
 * and `update` writes only the cells whose text changed.
 *
 * Internal: this module is not exported from the package. It touches the DOM
 * only through the container and the elements `create` returns, so a test can
 * drive it with a few lines of fake DOM and count every write.
 */

/** Writes `text` only when it differs from what the node holds; returns whether it wrote. */
export function setText(node, text) {
  if (node.textContent === text) return false
  node.textContent = text
  return true
}

/**
 * The indices of one longest increasing run in `seq` (which holds distinct
 * numbers), so the rows already in the right order relative to each other are
 * the ones left alone.
 */
function stableRun(seq) {
  const tails = []
  const prev = new Array(seq.length)
  for (let i = 0; i < seq.length; i++) {
    let lo = 0
    let hi = tails.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (seq[tails[mid]] < seq[i]) lo = mid + 1
      else hi = mid
    }
    prev[i] = lo ? tails[lo - 1] : -1
    tails[lo] = i
  }
  const keep = new Set()
  for (let i = tails.length ? tails[tails.length - 1] : -1; i >= 0; i = prev[i]) keep.add(i)
  return keep
}

/**
 * `create(row)` makes the element for a row that is new; `update(el, row, prev)`
 * writes what changed into it (`prev` is the row it last showed, or undefined
 * for a new element). A row is an object with an `id`, a string or a number.
 * A second row with an id already seen in the same `sync` is skipped.
 * `rescue(el)` is called when the row holding focus was removed, with the
 * element now in its place (or null when no row is left), to move focus there.
 */
export function createRows(container, { create, update, rescue }) {
  // id → { el, row }, and the ids in the order the elements are in the container.
  let held = new Map()
  let order = []

  return {
    sync(rows) {
      const next = new Map()
      for (const row of rows) if (!next.has(row.id)) next.set(row.id, row)

      // A moved element loses focus in some engines, so it is put back after.
      const root = container.getRootNode ? container.getRootNode() : null
      const focused = root && root.activeElement && container.contains(root.activeElement) ? root.activeElement : null

      let lostAt = -1
      order.forEach((id, i) => {
        if (!next.has(id)) {
          const { el } = held.get(id)
          if (focused && el.contains(focused)) lostAt = i
          container.removeChild(el)
          held.delete(id)
        }
      })

      // Where each surviving element is now, to find the ones that can stay.
      const was = new Map()
      order.forEach((id, i) => {
        if (next.has(id)) was.set(id, was.size)
      })
      const ids = [...next.keys()]
      const known = []
      for (const id of ids) if (was.has(id)) known.push(was.get(id))
      const stay = stableRun(known)
      const staying = new Set()
      let n = 0
      for (const id of ids) if (was.has(id) && stay.has(n++)) staying.add(id)

      // Made and written in the order given, then placed from the end, so each element goes in front of the one already placed after it.
      const fresh = new Set()
      for (const id of ids) {
        const row = next.get(id)
        let entry = held.get(id)
        if (!entry) {
          entry = { el: create(row), row: undefined }
          held.set(id, entry)
          fresh.add(id)
        }
        update(entry.el, row, entry.row)
        entry.row = row
      }
      let after = null
      for (let i = ids.length - 1; i >= 0; i--) {
        const id = ids[i]
        const { el } = held.get(id)
        if (fresh.has(id) || !staying.has(id)) container.insertBefore(el, after)
        after = el
      }
      order = ids

      if (lostAt >= 0) {
        const near = ids.length ? held.get(ids[Math.min(lostAt, ids.length - 1)]).el : null
        if (rescue) rescue(near)
        else if (near && near.focus) near.focus({ preventScroll: true })
      } else if (focused && root.activeElement !== focused && focused.isConnected !== false) focused.focus({ preventScroll: true })
    },
  }
}
