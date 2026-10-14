/**
 * Element registration (RFC 0002 §2.2) and the authoring kit's catalog
 * (RFC 0003 §3).
 *
 * Every class Tickslate registers is stamped with the core's version, so a
 * second copy of Tickslate that meets this tag can say which version got
 * there first.
 */
import { version, WIDGETS, SIZE_NAMES, isSize } from '../core/index.js'
import { DEV, warnOnce } from './dev.js'

export function define(tag, ctor) {
  if (typeof customElements === 'undefined') return
  ctor.tickslateVersion = version
  const owner = customElements.get(tag)
  if (!owner) {
    customElements.define(tag, ctor)
    return
  }
  // The same class again is two bundles or a hot reload importing the entry,
  // which is fine. A different class is a real clash and shouldn't be silent.
  if (owner === ctor) return
  if (DEV) {
    const by = owner.tickslateVersion ? `Tickslate ${owner.tickslateVersion}` : 'a non-Tickslate element'
    warnOnce(`define:${tag}`, `<${tag}> is already defined by ${by}, so this copy (${version}) was not registered.`)
  }
}

// Module-level, so every import of this bundle shares one catalog. A second
// copy of Tickslate has its own, which is why its defineWidget() for a tag the
// first copy owns throws below rather than splitting the catalog in two.
const registered = new Map() // type → { Ctor, spec }
const listeners = new Set()
let merged = null // widgetCatalog()'s cache, cleared by each registration

const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key)

/**
 * The entry recorded for a class: `{ tag, label, sizes, phoneRows?,
 * description?, category? }` from its static spec. Validated here, at
 * registration, so a mistaken catalog entry fails the call that made it.
 * widget.js reads the same spec per element but degrades instead of throwing,
 * which suits a render and not a registration.
 */
function recordedSpec(tag, Ctor, type) {
  const raw = Ctor.spec
  const sizes = raw && Array.isArray(raw.sizes) ? raw.sizes.filter(isSize) : []
  if (!sizes.length) {
    throw new TypeError(`defineWidget('${tag}', …, { type: '${type}' }): the class's static spec needs at least one valid size, such as { label: 'MRR', sizes: ['S', 'Wide'] }.`)
  }
  const spec = { tag, label: typeof raw.label === 'string' ? raw.label : '', sizes: Object.freeze([...new Set(sizes)]) }
  if (raw.phoneRows && typeof raw.phoneRows === 'object') {
    const rows = {}
    for (const size of SIZE_NAMES) {
      if (Number.isInteger(raw.phoneRows[size]) && raw.phoneRows[size] > 0) rows[size] = raw.phoneRows[size]
    }
    if (Object.keys(rows).length) spec.phoneRows = Object.freeze(rows)
  }
  if (typeof raw.description === 'string') spec.description = raw.description
  if (typeof raw.category === 'string') spec.category = raw.category
  return Object.freeze(spec)
}

/**
 * Defines `tag` as `Ctor` under the rules of define(), and records the class's
 * static spec in the catalog under `options.type`. The same class again does
 * nothing, but only for the same class object: a re-evaluated module makes a
 * new class, which throws. It throws a TypeError for a built-in key, a class
 * with a catalogKey, a type another class recorded, a tag another class owns,
 * and a spec with no valid size: a wrong catalog entry is worse than a failed
 * call (RFC 0003 §29.7). The recorded spec is a snapshot taken here.
 */
export function defineWidget(tag, Ctor, options) {
  const type = options && options.type
  if (typeof tag !== 'string' || typeof Ctor !== 'function') {
    throw new TypeError('defineWidget(tag, Ctor, { type }) needs a tag name and a widget class.')
  }
  if (typeof type !== 'string' || !type) {
    throw new TypeError(`defineWidget('${tag}', …) needs options.type, the key hosts use for this widget in a layout.`)
  }
  if (own(WIDGETS, type)) {
    throw new TypeError(`defineWidget: '${type}' is a built-in widget type. Pick another, such as 'acme-${type}'.`)
  }
  // An element with a catalogKey reads that built-in's spec and label, so the entry recorded here
  // would describe a widget the element doesn't behave as. Inherited keys count: a subclass of TsMetric has one.
  if (Ctor.catalogKey) {
    throw new TypeError(`defineWidget: this class has catalogKey '${Ctor.catalogKey}', so its elements use the built-in '${Ctor.catalogKey}' spec, not the one recorded under '${type}'. Extend TsWidget directly (or set static catalogKey = null) and give it a static spec.`)
  }
  const known = registered.get(type)
  if (known) {
    if (known.Ctor !== Ctor) throw new TypeError(`defineWidget: type '${type}' is already recorded by another class (<${known.spec.tag}>).`)
    if (known.spec.tag === tag) return
    throw new TypeError(`defineWidget: this class is already recorded as <${known.spec.tag}> under '${type}', so it cannot also be <${tag}>.`)
  }
  for (const [other, entry] of registered) {
    if (entry.spec.tag === tag) throw new TypeError(`defineWidget: <${tag}> is already recorded under type '${other}' by another class.`)
    if (entry.Ctor === Ctor) throw new TypeError(`defineWidget: this class is already recorded under type '${other}', so it cannot also be '${type}'.`)
  }
  if (typeof customElements !== 'undefined') {
    const owner = customElements.get(tag)
    if (owner && owner !== Ctor) {
      const by = owner.tickslateVersion ? `Tickslate ${owner.tickslateVersion}` : 'another class'
      throw new TypeError(`defineWidget: <${tag}> is already defined by ${by}, so '${type}' was not recorded.`)
    }
  }
  const spec = recordedSpec(tag, Ctor, type)
  // Before recording, so a tag the browser refuses (no hyphen, say) leaves the catalog as it was.
  define(tag, Ctor)
  registered.set(type, { Ctor, spec })
  merged = null
  // A copy, so a listener that unsubscribes itself doesn't skip the next one; and one that
  // another listener stopped during this dispatch is skipped, not run once more.
  for (const fn of [...listeners]) {
    if (!listeners.has(fn)) continue
    try {
      fn(type)
    } catch (err) {
      // One host's broken listener mustn't stop the grid's, nor undo a registration that happened.
      console.error(`tickslate: an onCatalogChange listener threw for '${type}'.`, err)
    }
  }
}

/** A frozen merge of `WIDGETS` and every registered spec, the same object until the next registration. */
export function widgetCatalog() {
  if (!merged) {
    const all = { ...WIDGETS }
    // defineProperty, not assignment: a type called "__proto__" would otherwise set the prototype and vanish.
    for (const [type, { spec }] of registered) Object.defineProperty(all, type, { value: spec, enumerable: true, writable: true, configurable: true })
    merged = Object.freeze(all)
  }
  return merged
}

/** `fn(type)` runs after each registration. Returns the function that stops it. */
export function onCatalogChange(fn) {
  if (typeof fn !== 'function') throw new TypeError('onCatalogChange(fn) needs a function.')
  // Wrapped, because a Set holds a function once: subscribing one function
  // twice gives two subscriptions, each stopped on its own.
  const entry = (type) => fn(type)
  listeners.add(entry)
  return () => {
    listeners.delete(entry)
  }
}
