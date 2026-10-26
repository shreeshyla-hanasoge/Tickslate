/**
 * What the add-a-widget picker shows (RFC 0003 §18.3), as a pure function:
 * no DOM, so it is tested under node and the element only draws the result.
 */

import { EN } from '../core/messages.js'

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k)

// A spec with no category of its own (a host's tile, an element's own spec)
// is listed with the generic widgets rather than under a blank heading.
const DEFAULT_CATEGORY = 'General'

/**
 * A catalog entry's words: the spec's own text, else the message. A spec that
 * carries only the English default (the built-ins do) gives way to the message,
 * so a translation is seen, as the label does in the grid.
 */
export function wording(t, type, spec, field) {
  const given = spec && typeof spec[field] === 'string' ? spec[field] : ''
  const key = `widget.${type}.${field}`
  if (given && given !== EN[key]) return given
  const text = t(key)
  return text !== key ? text : given
}

/** The group name: the category's message when there is one, else the category as written. */
function categoryName(t, category) {
  const key = `category.${category}`
  const text = t(key)
  return text === key ? category : text
}

function collator(locale) {
  try {
    return new Intl.Collator(locale, { numeric: true, sensitivity: 'base' })
  } catch (err) {
    return new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
  }
}

/**
 * The picker's groups for a query.
 *
 * - `hidden` are the grid's hidden children: each is a restore, listed under
 *   its type's category, before the new types in the same group.
 * - `catalog` is an object of specs. Its types are offered as new tiles only
 *   when `addTypes` lists them (or is '*'): the host decides what it can render.
 *   A type may be offered again while one is on the layout, because tiles of one
 *   type are separate children.
 * - `query` matches the label and the description, ignoring case, in `locale`.
 *
 * Groups are ordered by their translated category name and items by label.
 */
export function pickerItems({ hidden = [], catalog = {}, addTypes = null, query = '', t, locale }) {
  const specOf = (type) => (catalog && typeof catalog === 'object' && typeof type === 'string' && hasOwn(catalog, type) ? catalog[type] : null)
  const lower = (text) => String(text).toLocaleLowerCase(locale)
  const needle = lower(query).trim()
  const matches = (item) => !needle || lower(item.label).includes(needle) || lower(item.description).includes(needle)
  const describe = (type, spec) => ({
    description: wording(t, type, spec, 'description'),
    category: categoryName(t, (spec && typeof spec.category === 'string' && spec.category) || DEFAULT_CATEGORY),
  })

  const items = []
  for (const child of hidden) {
    const spec = specOf(child.type)
    const item = { kind: 'restore', id: child.id, type: child.type, label: child.label, ...describe(child.type, spec) }
    if (matches(item)) items.push(item)
  }

  const offered = addTypes === '*' ? Object.keys(catalog || {}) : Array.isArray(addTypes) ? addTypes : []
  const seen = new Set()
  for (const type of offered) {
    const spec = specOf(type)
    // A type the catalog doesn't know has nothing to say about its sizes, so it can't be placed.
    if (!spec || seen.has(type) || !Array.isArray(spec.sizes) || !spec.sizes.length) continue
    seen.add(type)
    const label = wording(t, type, spec, 'label') || type
    const item = { kind: 'add', type, label, ...describe(type, spec), sizes: [...spec.sizes] }
    if (matches(item)) items.push(item)
  }

  const collate = collator(locale).compare
  const groups = new Map()
  for (const item of items) {
    if (!groups.has(item.category)) groups.set(item.category, [])
    groups.get(item.category).push(item)
  }
  return [...groups]
    .sort(([a], [b]) => collate(a, b))
    .map(([category, list]) => ({
      category,
      // Restores first, then by label; a stable sort keeps two equal labels in the order they came.
      items: list.sort((a, b) => (a.kind === b.kind ? collate(a.label, b.label) : a.kind === 'restore' ? -1 : 1)),
    }))
}
