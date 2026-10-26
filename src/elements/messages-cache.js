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

// A custom widget's English defaults (RFC 0004 §10.2), recorded by defineWidget under the class that
// registered them. Held here, not in registry.js, so widget.js can read them without importing the catalog.
const classDefaults = new WeakMap()

export function setClassDefaults(Ctor, type, table) {
  classDefaults.set(Ctor, { type, table })
}

/** `{ type, table }` for a class registered with messages, else null. */
export function classDefaultsOf(Ctor) {
  return classDefaults.get(Ctor) || null
}

/**
 * The Translate for configure()'s table, the grid's, the element's and a locale.
 * `defaults` is a custom widget's own English table: it answers only what none of
 * the three layers did, and before EN (RFC 0004 §10.2), so a host's text always wins.
 */
export function translator(config, grid, own, locale, defaults) {
  const layers = [config, grid, own]
  let level = tree
  for (const layer of [...layers, defaults]) {
    const key = layer && typeof layer === 'object' ? layer : NONE
    let next = level.get(key)
    if (!next) level.set(key, (next = new WeakMap()))
    level = next
  }
  // The locale is a string, so the leaf is an ordinary Map held in the last WeakMap.
  let byLocale = level.get(NONE)
  if (!byLocale) level.set(NONE, (byLocale = new Map()))
  let t = byLocale.get(locale)
  if (!t) byLocale.set(locale, (t = withDefaults(createMessages(merge(layers), locale), defaults)))
  return t
}

// The host's chain (and EN, which a default can never shadow: defineWidget refuses a built-in key)
// answers first. A key nobody has comes back as itself, and only then do the author's defaults speak,
// with English plural rules because they are English text.
function withDefaults(host, defaults) {
  if (!defaults) return host
  const own = createMessages(defaults, 'en')
  return (key, params, count) => {
    const text = host(key, params, count)
    return text === key ? own(key, params, count) : text
  }
}
