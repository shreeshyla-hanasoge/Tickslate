/**
 * One translate function per set of tables and locale, shared by every widget
 * and grid that resolves to the same ones (RFC 0003 §1.1). A dashboard of fifty
 * tiles then builds one merged table and one set of plural rules, not fifty.
 *
 * Keyed by the identity of each layer, so a host changes a table by assigning a
 * new object; one changed in place is not noticed. Entries go when the tables
 * they were built from are released.
 */

import { createMessages } from '../core/index.js'

// Stands in for "no table", which cannot be a WeakMap key.
const NONE = {}
const tree = new WeakMap()

// Layers merge key by key, nearest last, and only string values count, so an
// element's `undefined` or `5` does not hide the grid's translation. Plural
// forms are ordinary keys here: a layer that sets only `days.few` and one that
// sets `days.one` and `days.other` give a table with all three, each form from
// the nearest layer that has it. createMessages then reads that one table.
function merge(layers) {
  const out = {}
  for (const layer of layers) {
    if (layer) for (const key of Object.keys(layer)) if (typeof layer[key] === 'string') out[key] = layer[key]
  }
  return out
}

/** The Translate for configure()'s table, the grid's, the element's and a locale. */
export function translator(config, grid, own, locale) {
  const layers = [config, grid, own]
  let level = tree
  for (const layer of layers) {
    const key = layer && typeof layer === 'object' ? layer : NONE
    let next = level.get(key)
    if (!next) level.set(key, (next = new WeakMap()))
    level = next
  }
  // The locale is a string, so the leaf is an ordinary Map held in the last WeakMap.
  let byLocale = level.get(NONE)
  if (!byLocale) level.set(NONE, (byLocale = new Map()))
  let t = byLocale.get(locale)
  if (!t) byLocale.set(locale, (t = createMessages(merge(layers), locale)))
  return t
}
