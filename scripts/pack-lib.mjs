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
import { copyFile, readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { elementEntries, describeEntry } from './entries.mjs'
import { writeManifests } from './gen-manifest.mjs'
import { runtimeFrameworkImports } from './types-guard.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(root, 'dist-lib')

if (!existsSync(out)) {
  console.error('dist-lib/ not found — run `npm run build:lib` first.')
  process.exit(1)
}

const entries = elementEntries().map(describeEntry)

// The framework typings (RFC 0003 §22.1): every src/types/<name>.d.ts is a types-only
// entry `tickslate/<name>`, except common.d.ts, which they share and which is not an
// entry. Found rather than listed, like the element entries.
const typesDir = resolve(root, 'src/types')
const typeFiles = existsSync(typesDir) ? (await readdir(typesDir)).filter((n) => n.endsWith('.d.ts')).sort() : []
const typeEntries = typeFiles.map((n) => n.slice(0, -'.d.ts'.length)).filter((n) => n !== 'common')

// 1. manifest. package.lib.json holds what is written by hand; the element
// entries are generated from src/elements/define/ (RFC 0003 §2.1), so adding a
// widget never means editing a list here or there.
const base = JSON.parse(await readFile(resolve(root, 'package.lib.json'), 'utf8'))

// Emberwick is an optional peer of tickslate/elements/mini-chart (RFC 0004 §6.1). It must stay a peer, at 0.14.0 or
// later (the first release with both the countdown and emberwick/profiles), and stay optional, or every host would be
// told to install a charting library it never imports. It must never become a dependency.
{
  const peer = base.peerDependencies && base.peerDependencies.emberwick
  const optional = base.peerDependenciesMeta && base.peerDependenciesMeta.emberwick && base.peerDependenciesMeta.emberwick.optional
  const direct = ['dependencies', 'optionalDependencies'].find((f) => base[f] && base[f].emberwick)
  if (peer !== '>=0.14.0' || optional !== true || direct) {
    console.error(`package.lib.json must list emberwick as an optional peer at ">=0.14.0" (peerDependencies and peerDependenciesMeta.emberwick.optional), and nowhere else; it has ${JSON.stringify({ peer, optional, direct })}.`)
    process.exit(1)
  }
}

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
  // Types only, so a single `types` condition: the one exception to the three-condition rule (RFC 0003 §22.1).
  ...Object.fromEntries(typeEntries.map((n) => [`./${n}`, { types: `./types/${n}.d.ts` }])),
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
    ...Object.fromEntries(typeEntries.map((n) => [n, [`types/${n}.d.ts`]])),
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

// 3. theme tokens, and the opt-in presets beside them at themes/<name>.css
// (exported as tickslate/themes/*.css by package.lib.json). They are plain
// files rather than part of tokens.css so a host that uses none pays nothing.
await copyFile(resolve(root, 'src/themes/tokens.css'), resolve(out, 'tokens.css'))
await mkdir(resolve(out, 'themes'), { recursive: true })
for (const name of (await readdir(resolve(root, 'src/themes/presets'))).filter((n) => n.endsWith('.css'))) {
  await copyFile(resolve(root, 'src/themes/presets', name), resolve(out, 'themes', name))
}

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
  ['src/elements/controls.d.ts', 'controls.d.ts'],
  ['src/elements/mini-chart.d.ts', 'mini-chart.d.ts'],
]
const shipped = []
for (const [from, to] of types) {
  const src = resolve(root, from)
  if (!existsSync(src)) continue
  // mini-chart.d.ts names the shared widget types from './index.js' (the elements declarations in the repo); at the package
  // root that is elements.d.ts. This runs before the core rewrite below, whose result is also './index.js'.
  let text = await readFile(src, 'utf8')
  if (to === 'mini-chart.d.ts') text = text.replace(/(['"])\.\/index\.js\1/g, '$1./elements.js$1')
  text = text.replace(/(['"])\.\.\/core\/index\.js\1/g, '$1./index.js$1')
  const dest = resolve(out, to)
  await mkdir(dirname(dest), { recursive: true })
  await writeFile(dest, text)
  shipped.push(dest)
}

// 4b. the framework typings, at types/<name>.d.ts. In the repo they import the
// element declarations as '../elements/index.js'; in the package those are
// elements.d.ts at the root, so the path is rewritten, as for the core above.
// Each entry must stay types only: an import from react, vue or svelte that is
// not `import type` would load the framework when the host's bundler follows it.
for (const name of typeFiles) {
  const text = (await readFile(resolve(typesDir, name), 'utf8')).replace(/(['"])\.\.\/elements\/index\.js\1/g, '$1../elements.js$1')
  const runtime = runtimeFrameworkImports(text)
  if (runtime.length) {
    console.error(`src/types/${name} imports ${runtime[0]} other than with \`import type\`; the framework typings are types only.`)
    process.exit(1)
  }
  const dest = resolve(out, 'types', name)
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
const SHARED_TYPES = ['WidgetFreshness', 'ViewModelContext', 'WidgetState', 'TsCommonAction', 'TsOpenAction']
// Types whose names don't start with their widget's, or that belong to no
// widget (the layout persistence options go with the grid, and so do the
// attribute tables the framework typings read). A type that fits neither rule
// fails the check below, so it is placed on purpose.
const TYPE_EXTRAS = { grid: ['PersistLayoutOptions', 'TsWidgetAttributes', 'TsElementAttributes'], 'equity-curve': ['EquityRange'], 'open-positions': ['OpenPosition'], 'pnl-calendar': ['CalendarModel'], 'edge-stats': ['EdgeStatName', 'EdgeStatFigure'] }
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
    // MetricData and TsMetricAction both belong to `metric`: older names start with the stem, the action unions (§22.2) with Ts and the stem.
    const own = declaredTypes.filter((name) => stems.some((stem) => name.startsWith(stem) || name.startsWith(`Ts${stem}`)) || extras.includes(name))
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

// 6. the custom elements manifest and VS Code's HTML custom data (RFC 0003 §22.3),
// read from the same declarations. This throws, and so fails the release, when a
// tag a define module registers has no `@element` block.
try {
  const { tags, notBuilt } = await writeManifests(out)
  console.log(`wrote custom-elements.json and vscode.html-custom-data.json (${tags.length} tags)`)
  if (notBuilt.length) console.log(`note: the catalog lists ${notBuilt.join(', ')}, which have no define module yet`)
} catch (err) {
  console.error(err.message)
  process.exit(1)
}

console.log('packed dist-lib/ — publish with: npm publish ./dist-lib')
