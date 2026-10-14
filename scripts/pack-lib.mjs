#!/usr/bin/env node
/**
 * Assembles dist-lib/ into a directory that can be published as-is:
 *
 *   npm run release
 *   npm publish ./dist-lib
 *
 * The leading ./ matters: `npm publish dist-lib` makes npm treat the argument
 * as a registry package spec ("dist-lib@*") and fail with E404.
 *
 * Publishing from dist-lib (rather than the repo root) keeps the private dev
 * package.json, the playground and src/ out of the published package.
 */
import { copyFile, readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { elementEntries, describeEntry } from './entries.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(root, 'dist-lib')

if (!existsSync(out)) {
  console.error('dist-lib/ not found — run `npm run build:lib` first.')
  process.exit(1)
}

const entries = elementEntries().map(describeEntry)

// 1. manifest. package.lib.json holds what is written by hand; the element
// entries are generated from src/elements/define/ (RFC 0003 §2.1), so adding a
// widget never means editing a list here or there.
const base = JSON.parse(await readFile(resolve(root, 'package.lib.json'), 'utf8'))

// Every elements entry has all four conditions, in this order: a bundler or
// Node takes the first that matches, so `development` must come before `import`.
const conditions = (types, file) => ({
  types: `./${types}`,
  development: `./dev/${file}`,
  import: `./${file}`,
  default: `./${file}`,
})
const { '.': core, ...staticExports } = base.exports
const exports = {
  '.': core,
  './elements': conditions('elements.d.ts', 'elements.js'),
  ...Object.fromEntries(entries.map((e) => [`./elements/${e.name}`, conditions(`elements/${e.name}.d.ts`, `elements/${e.name}.js`)])),
  './cdn/tickslate.js': './cdn/tickslate.js',
  './cdn/tickslate.iife.js': './cdn/tickslate.iife.js',
  ...staticExports,
}
// The entry files register elements, so a bundler must not drop an import of
// one as unused. Chunks are left out on purpose: they define classes and
// register nothing. The CDN files register everything too.
const sideEffects = [
  './elements.js',
  './elements/*.js',
  './dev/elements.js',
  './dev/elements/*.js',
  './cdn/*.js',
  '*.css',
]
// For TypeScript's older module resolution, which ignores "exports".
const typesVersions = {
  '*': {
    elements: ['elements.d.ts'],
    ...Object.fromEntries(entries.map((e) => [`elements/${e.name}`, [`elements/${e.name}.d.ts`]])),
  },
}

const manifest = {}
for (const [key, value] of Object.entries(base)) {
  if (key === 'exports') {
    manifest.sideEffects = sideEffects
    manifest.typesVersions = typesVersions
    manifest.exports = exports
  } else manifest[key] = value
}
await writeFile(resolve(out, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')

// 2. docs + licence
for (const f of ['README.md', 'LICENSE', 'CHANGELOG.md']) {
  if (existsSync(resolve(root, f))) await copyFile(resolve(root, f), resolve(out, f))
}

// 3. theme tokens
await copyFile(resolve(root, 'src/themes/tokens.css'), resolve(out, 'tokens.css'))

// 4. type declarations, flattened to sit beside their entry points. The
// elements entry points at the core as '../core/index.js'; at the package
// root that is './index.js'. It also imports './widget.js' for the widget base
// class, whose declarations ship as widget.d.ts beside it: TypeScript maps
// that specifier to widget.d.ts, so no rewrite is needed. grid.d.ts is the
// same: the entry re-exports it from './grid.js'.
const types = [
  ['src/core/index.d.ts', 'index.d.ts'],
  ['src/elements/index.d.ts', 'elements.d.ts'],
  ['src/elements/widget.d.ts', 'widget.d.ts'],
  ['src/elements/grid.d.ts', 'grid.d.ts'],
]
const shipped = []
for (const [from, to] of types) {
  const src = resolve(root, from)
  if (!existsSync(src)) continue
  const text = (await readFile(src, 'utf8')).replace(/(['"])\.\.\/core\/index\.js\1/g, '$1./index.js$1')
  const dest = resolve(out, to)
  await mkdir(dirname(dest), { recursive: true })
  await writeFile(dest, text)
  shipped.push(dest)
}

// 5. one declaration stub per element entry, at elements/<name>.d.ts. Each
// re-exports from the declarations above rather than repeating them, so the
// types stay in one place: the class the define module exports and the
// types named for it. An entry whose declarations already have a file of their
// own (grid.d.ts) re-exports that file whole.
const elementsDts = await readFile(resolve(root, 'src/elements/index.d.ts'), 'utf8')
// Every type elements.d.ts declares or re-exports, for the check below.
const declaredTypes = [
  ...[...elementsDts.matchAll(/^export (?:interface|type) (\w+)/gm)].map((m) => m[1]),
  ...[...elementsDts.matchAll(/^export type \{([^}]*)\}/gm)].flatMap((m) => m[1].split(',').map((n) => n.trim()).filter(Boolean)),
]
// Types every widget's data and view model are built from. Each widget stub
// exports them, so `MetricData extends WidgetFreshness` can be named from the
// same import as `MetricData`.
const SHARED_TYPES = ['WidgetFreshness', 'ViewModelContext', 'WidgetState']
// Types whose names don't start with their widget's, or that belong to no
// widget (the layout persistence options go with the grid). A type that fits
// neither rule fails the check below, so it is placed on purpose.
const TYPE_EXTRAS = { grid: ['PersistLayoutOptions'], 'equity-curve': ['EquityRange'] }
const stubTypes = new Set()
for (const entry of entries) {
  const lines = []
  const extras = TYPE_EXTRAS[entry.name] || []
  if (existsSync(resolve(root, `src/elements/${entry.file}.d.ts`))) {
    lines.push(`export * from '../${entry.file}.js'`)
    // What the define module exports besides its class (the grid's persistLayout) is a value declared in elements.d.ts.
    const values = entry.exports.filter((name) => !/^Ts[A-Z]/.test(name))
    if (values.length) lines.push(`export { ${values.join(', ')} } from '../elements.js'`)
    if (extras.length) lines.push(`export type { ${extras.join(', ')} } from '../elements.js'`)
    extras.forEach((n) => stubTypes.add(n))
  } else {
    const stems = entry.exports.map((name) => name.replace(/^Ts/, ''))
    const own = declaredTypes.filter((name) => stems.some((stem) => name.startsWith(stem)) || extras.includes(name))
    const types = [...new Set([...SHARED_TYPES, ...own])]
    lines.push(`export { ${entry.exports.join(', ')} } from '../elements.js'`)
    lines.push(`export type { ${types.join(', ')} } from '../elements.js'`)
    types.forEach((n) => stubTypes.add(n))
  }
  const dest = resolve(out, 'elements', `${entry.name}.d.ts`)
  await mkdir(dirname(dest), { recursive: true })
  await writeFile(dest, `/** Registers ${entry.tags.map((t) => `<${t}>`).join(' and ')} (generated by scripts/pack-lib.mjs). */\n${lines.join('\n')}\n`)
  shipped.push(dest)
}
// No type may be reachable only from the all-in entry: a host that imports
// `tickslate/elements/metric` should not have to import `tickslate/elements`
// for a type. A widget added later whose types don't start with its name
// fails here until its types are listed in TYPE_EXTRAS.
const orphaned = declaredTypes.filter((name) => !stubTypes.has(name))
if (orphaned.length) {
  console.error(`elements.d.ts declares ${orphaned.join(', ')}, which no per-widget declaration stub exports. Name them for their widget, or list them in TYPE_EXTRAS in scripts/pack-lib.mjs.`)
  process.exit(1)
}

// Every relative import in a shipped declaration must land on a file in
// dist-lib/, or consumers get `any` (or an error) for the whole entry point.
for (const file of shipped) {
  const text = await readFile(file, 'utf8')
  for (const [, spec] of text.matchAll(/\bfrom\s+['"](\.[^'"]*)['"]/g)) {
    const target = resolve(dirname(file), spec.replace(/\.js$/, ''))
    if (!existsSync(`${target}.d.ts`)) {
      console.error(`${file} imports '${spec}', but ${target}.d.ts is not in dist-lib/.`)
      process.exit(1)
    }
  }
}

console.log('packed dist-lib/ — publish with: npm publish ./dist-lib')
