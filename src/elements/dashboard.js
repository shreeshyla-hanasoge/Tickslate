/**
 * createDashboard(): a <ts-grid> and its tiles from a layout and an object of
 * data, for a host with no framework (RFC 0004 §7).
 *
 * It is the host's helper, so it stays on the grid's public surface: the
 * `layout`, `catalog` and `addTypes` properties, the attributes, the events and
 * the DOM. It reads no `_` member and imports no grid internals, which a test
 * asserts. It is not an element and registers nothing, so it is safe to import
 * where there is no DOM; the DOM check runs when it is called.
 */

import { typeOf } from '../core/index.js'
import { DEV, warnOnce } from './dev.js'
import { onCatalogChange, widgetCatalog } from './registry.js'

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k)

// Same order the grid resolves in: the host's catalog, then every registered type.
function specOf(item, catalog) {
  if (typeof catalog === 'function') return catalog(item) || null
  const type = typeOf(item)
  // Own entries only, so a type called "toString" is unknown rather than a match on Object.prototype.
  return catalog && typeof type === 'string' && hasOwn(catalog, type) ? catalog[type] : null
}

/**
 * Every item of every profile, once per id. The top strip holds ids of items
 * in the profiles (readLayout drops any other), so walking the profiles
 * reaches them too: a profile switch then needs no further code (Decision 58).
 */
function allItems(layout) {
  const seen = new Set()
  const items = []
  const profiles = layout && layout.profiles
  if (!profiles || typeof profiles !== 'object') return items
  for (const name of Object.keys(profiles)) {
    const list = profiles[name]
    if (!Array.isArray(list)) continue
    for (const item of list) {
      if (!item || typeof item.id !== 'string' || seen.has(item.id)) continue
      seen.add(item.id)
      items.push(item)
    }
  }
  return items
}

// The grid each target holds, so a second call on the same target can say so.
const gridOf = new WeakMap()

/** `target` is the element to put the grid in, or a CSS selector for it. */
export function createDashboard(target, options = {}) {
  if (typeof document === 'undefined') throw new TypeError('createDashboard needs a DOM')
  let host = target
  if (typeof target === 'string') {
    host = document.querySelector(target)
    if (!host) throw new TypeError(`createDashboard found no element for the selector "${target}".`)
  } else if (!target || typeof target.appendChild !== 'function') {
    throw new TypeError('createDashboard needs an element or a selector for the grid to go in.')
  }
  const { layout, data, catalog, persist, locale, currency, timeZone, label } = options
  const addTypes = options.addTypes === undefined ? '*' : options.addTypes

  const earlier = gridOf.get(host)
  if (DEV && earlier && earlier.parentElement === host) warnOnce('dashboard-twice', 'createDashboard was called again on a target that already holds a dashboard, so the page now has two grids. Call destroy() on the first before making another.')
  const grid = document.createElement('ts-grid')
  gridOf.set(host, grid)
  if (locale) grid.setAttribute('locale', locale)
  if (currency) grid.setAttribute('currency', currency)
  if (timeZone) grid.setAttribute('time-zone', timeZone)
  if (persist) grid.setAttribute('persist', persist)
  if (label) grid.setAttribute('aria-label', label)

  const tiles = new Map() // id → child element, including the hidden ones
  // The latest data per id. It outlives a tile that has no child yet, so a
  // ts-add-request for that id (the host gave `data` for it) arrives with its figures.
  const values = new Map()
  if (data && typeof data === 'object') for (const id of Object.keys(data)) values.set(id, data[id])
  let alive = true

  const tagFor = (item) => {
    const spec = specOf(item, catalog) || specOf(item, widgetCatalog())
    return spec && typeof spec.tag === 'string' && spec.tag ? spec.tag : null
  }

  function createTile(item) {
    const tag = tagFor(item)
    if (!tag) {
      if (DEV) warnOnce(`dashboard-type:${typeOf(item)}`, `createDashboard has no widget called "${String(typeOf(item))}" in the catalog (item "${item.id}"), so it made no tile for it. Register it with defineWidget(), or pass it in the catalog option.`)
      return null
    }
    if (DEV && typeof customElements !== 'undefined' && !customElements.get(tag)) {
      warnOnce(`dashboard-tag:${tag}`, `createDashboard made a <${tag}> for item "${item.id}", but that tag is not defined yet. The tile upgrades when it is; import the widget's entry, or tickslate/elements.`)
    }
    const el = document.createElement(tag)
    el.setAttribute('item', item.id)
    if (values.has(item.id)) el.data = values.get(item.id)
    tiles.set(item.id, el)
    grid.appendChild(el)
    return el
  }

  // Idempotent: a restored layout, a late defineWidget() and the first connect all call it.
  function ensureTiles() {
    if (!alive) return
    for (const item of allItems(grid.layout)) if (!tiles.has(item.id)) createTile(item)
  }

  function onAddRequest(event) {
    if (!alive || event.target !== grid) return
    const detail = event.detail || {}
    const { type, id } = detail
    const allowed = grid.addTypes
    if (typeof type !== 'string' || typeof id !== 'string') return
    // A type outside addTypes is left alone, so another listener may take it.
    if (!(allowed === '*' || (Array.isArray(allowed) && allowed.includes(type)))) return
    const item = { id, type }
    if (!tagFor(item)) return
    event.preventDefault()
    if (!tiles.has(id)) createTile(item)
  }

  // Both events can mean a layout the dashboard has not seen: persist restores
  // on the first measure, and a picker adds ids of its own.
  const onLayout = () => ensureTiles()
  grid.addEventListener('ts-add-request', onAddRequest)
  grid.addEventListener('ts-columns-change', onLayout)
  grid.addEventListener('ts-layout-change', onLayout)
  // A widget defined after the dashboard may be the type of a tile that was skipped.
  const offCatalog = onCatalogChange(onLayout)

  if (DEV && layout === undefined) warnOnce('dashboard-layout', 'createDashboard was given no layout, so the grid is empty. Pass the layout option: a Layout or an array of items.')

  function start() {
    if (!alive) return
    if (catalog) grid.catalog = catalog
    grid.addTypes = addTypes
    grid.layout = layout
    ensureTiles()
    if (!grid.isConnected) host.appendChild(grid)
    // The grid may have restored a saved layout while connecting.
    ensureTiles()

    // With persist, a saved layout may hold ids this one does not yet, so they are not yet "unknown".
    if (DEV && !persist) {
      for (const id of values.keys()) {
        if (!tiles.has(id)) warnOnce(`dashboard-data:${id}`, `createDashboard was given data for "${id}", which is no item in any profile of the layout, so it is ignored.`)
      }
    }
  }

  if (typeof customElements === 'undefined' || customElements.get('ts-grid')) start()
  else {
    // Properties set on a grid that has not upgraded shadow its accessors and
    // are lost, so wait for the tag. The grid is in the page meanwhile.
    host.appendChild(grid)
    customElements.whenDefined('ts-grid').then(start)
  }

  function set(id, value) {
    if (!alive) {
      if (DEV) warnOnce('dashboard-destroyed-set', 'dashboard.set() was called after destroy(), so it did nothing.')
      return false
    }
    const el = typeof id === 'string' && tiles.get(id)
    if (!el) {
      if (DEV) warnOnce(`dashboard-id:${String(id)}`, `dashboard.set() was given "${String(id)}", which is no item of this dashboard yet, so no tile was changed. The data is kept for a tile added later.`)
      // A poller sends every id each tick; a tile the user adds later should come with its figures.
      if (typeof id === 'string') values.set(id, value)
      return false
    }
    values.set(id, value)
    // A hidden tile (one the user removed) is still a child, so it is current when it comes back.
    el.data = value
    return true
  }

  function update(dataById) {
    if (!alive) {
      if (DEV) warnOnce('dashboard-destroyed-update', 'dashboard.update() was called after destroy(), so it did nothing.')
      return
    }
    if (!dataById || typeof dataById !== 'object') return
    for (const id of Object.keys(dataById)) set(id, dataById[id])
  }

  function destroy() {
    if (!alive) return
    alive = false
    grid.removeEventListener('ts-add-request', onAddRequest)
    grid.removeEventListener('ts-columns-change', onLayout)
    grid.removeEventListener('ts-layout-change', onLayout)
    offCatalog()
    // Removing the grid disconnects it, which stops its persistence, observers and timers.
    grid.remove()
    tiles.clear()
    values.clear()
  }

  return { grid, set, update, destroy }
}
