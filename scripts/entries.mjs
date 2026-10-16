/**
 * The per-widget entries (RFC 0003 §2.1), found rather than listed: every
 * file in src/elements/define/ is one entry, so a story that adds a widget
 * adds one file and touches no build script. Shared by the two vite element
 * builds and pack-lib, which would otherwise each carry their own copy of the
 * naming rule.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const defineDir = resolve(root, 'src/elements/define')

// The chart's define module keeps the name of its class's file, series-chart.js
// (chart.js already holds the drawing helpers), but its entry is
// `tickslate/elements/chart`: the tag without `ts-` (RFC 0003 §29.2). The name
// is applied here, in the build's entry names, because renaming a built file
// afterwards would break every chunk that imports it.
const ENTRY_NAMES = { 'series-chart': 'chart' }

/** `[{ file: 'metric', name: 'metric', input: '<abs path>' }, …]`, sorted by name. */
export function elementEntries() {
  return readdirSync(defineDir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => f.slice(0, -'.js'.length))
    .map((file) => ({ file, name: ENTRY_NAMES[file] || file, input: resolve(defineDir, `${file}.js`) }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}

/**
 * What a define module registers and exports, read from its source (the
 * modules are a few lines each, and importing them would need a DOM): the tags
 * in its `define('…', Class)` calls and the names in its `export { … }` or
 * `export class/const/function`.
 *
 * A module this reading finds nothing in throws. The checks that compare a
 * bundle with these lists would otherwise pass with nothing to compare, the
 * day a module is written in a form the reading doesn't know.
 */
export function describeEntry(entry) {
  const text = readFileSync(entry.input, 'utf8')
  const tags = [...text.matchAll(/\bdefine\(\s*(['"])([a-z][a-z0-9-]*)\1/g)].map((m) => m[2])
  const exports = [
    ...[...text.matchAll(/export\s*\{([^}]*)\}/g)]
      .flatMap((m) => m[1].split(','))
      .map((name) => name.trim().split(/\s+as\s+/).pop())
      .filter(Boolean),
    ...[...text.matchAll(/export\s+(?:class|const|let|function)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]),
  ]
  const where = `src/elements/define/${entry.file}.js`
  if (!tags.length) throw new Error(`${where} has no define('ts-tag', Class) call that scripts/entries.mjs can read`)
  if (!exports.length) throw new Error(`${where} exports no class that scripts/entries.mjs can read (export { Class } or export class Class)`)
  return { ...entry, tags, exports }
}
