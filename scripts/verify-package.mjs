#!/usr/bin/env node
/**
 * Checks the assembled dist-lib/ before anyone runs `npm publish ./dist-lib`.
 *
 *   npm run verify:package
 *
 * Each check names a way a package can pack cleanly and still be broken for
 * the people who install it. vite's emptyOutDir wipes dist-lib/ on every lib
 * build, so skipping build:umd or build:cdn yields a tarball whose unpkg and
 * jsdelivr entries 404 for every CDN user, and nothing else in the release
 * notices.
 */
import { readFile, readdir, mkdtemp, mkdir, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { existsSync, statSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { runInNewContext } from 'node:vm'
import { resolve, dirname, relative, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { elementEntries, describeEntry } from './entries.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(root, 'dist-lib')

const problems = []
const fail = (msg) => problems.push(msg)
const ok = (msg) => console.log(`ok   ${msg}`)

if (!existsSync(resolve(out, 'package.json'))) {
  console.error('FAIL dist-lib/package.json is missing — run `npm run release` first.')
  process.exit(1)
}
const manifest = JSON.parse(await readFile(resolve(out, 'package.json'), 'utf8'))
// The element entries come from src/elements/define/, the same list the builds
// and pack-lib read, so a widget added there is checked here with no edit.
const entries = elementEntries().map(describeEntry)
const allTags = entries.flatMap((e) => e.tags)

// ------------------------------------------------------------ manifest targets
//
// Every path the published manifest points at must be a file in dist-lib/.
// A field that is missing altogether fails too: dropping "unpkg" would hide a
// lost CDN build rather than fix it.

const FIELDS = ['main', 'module', 'types', 'customElements', 'unpkg', 'jsdelivr', 'exports']
const targets = []
const collect = (value, where) => {
  if (typeof value === 'string') targets.push([value, where])
  // null in an exports map blocks a subpath on purpose; it names no file.
  else if (value && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) collect(v, `${where}["${key}"]`)
  }
}
for (const field of FIELDS) {
  if (manifest[field] === undefined) fail(`dist-lib/package.json has no "${field}" field`)
  else collect(manifest[field], field)
}
// typesVersions names declaration files too, and an old resolver that follows a
// dead path gets no types for that entry.
collect(manifest.typesVersions, 'typesVersions')

const targetFiles = new Set()
for (const [target, where] of targets) {
  // A subpath pattern ('./themes/*.css') names every file it matches, and must
  // match at least one: an empty pattern is a dead export.
  if (target.includes('*')) {
    const dir = dirname(target)
    const re = glob(target.slice(dir.length + 1))
    const matched = (await readdir(resolve(out, dir)).catch(() => [])).filter((n) => re.test(n))
    if (!target.startsWith('./') || dir.includes('*')) fail(`${where} is "${target}", but only a pattern in the last path segment of a ./ target is checked`)
    else if (!matched.length) fail(`${where} is "${target}", which matches no file in dist-lib/`)
    else {
      for (const n of matched) targetFiles.add(`${dir.slice(2)}/${n}`)
      ok(`${where} -> ${target} (${matched.length} files)`)
    }
    continue
  }
  const file = resolve(out, target)
  // Node ignores an exports target without the leading ./, and one that
  // climbs out of the package resolves to nothing once installed.
  if (where.startsWith('exports') && !target.startsWith('./')) {
    fail(`${where} is "${target}", but exports targets must start with ./`)
  } else if (!file.startsWith(out + sep)) {
    fail(`${where} is "${target}", which is outside dist-lib/`)
  } else if (existsSync(file) && statSync(file).isFile()) {
    targetFiles.add(relative(out, file).split(sep).join('/'))
    ok(`${where} -> ${target}`)
  } else {
    fail(`${where} points at ${target}, which is not in dist-lib/`)
  }
}

// ------------------------------------------- export conditions (RFC 0003 §2.2)
//
// A bundler or Node picks the first matching condition in key order, so a
// missing "default" breaks require-less tooling and a "development" listed
// after "import" is never reached.

const exportsMap = manifest.exports || {}
const CONDITIONS = ['types', 'development', 'import', 'default']
for (const [subpath, entry] of Object.entries(exportsMap)) {
  if (typeof entry === 'string') continue // tokens.css, the CDN files and package.json stay plain paths
  const keys = Object.keys(entry)
  const isElements = subpath === './elements' || subpath.startsWith('./elements/')
  // The framework typings are types only, so they carry the `types` condition alone
  // (RFC 0003 §22.1). pack-lib refuses a typings file that imports a framework without `import type`.
  const typesOnly = keys.length === 1 && keys[0] === 'types' && /^\.\/types\/[\w-]+\.d\.ts$/.test(entry.types)
  if (typesOnly) {
    ok(`exports["${subpath}"] is types only`)
    continue
  }
  if (!isElements) {
    const missing = ['types', 'import', 'default'].filter((k) => !keys.includes(k))
    if (missing.length) fail(`exports["${subpath}"] has no ${missing.join(', ')} condition`)
    else ok(`exports["${subpath}"] has types, import and default`)
    continue
  }
  if (keys.join() !== CONDITIONS.join()) {
    fail(`exports["${subpath}"] has conditions ${keys.join(', ')}, but every elements entry has exactly ${CONDITIONS.join(', ')}, in that order`)
  } else ok(`exports["${subpath}"] has ${CONDITIONS.join(', ')}, in that order`)
  // Every `import` export has a `development` one, and it is the same file
  // inside the parallel dev/ tree.
  if (entry.import && entry.development !== `./dev/${entry.import.replace(/^\.\//, '')}`) {
    fail(`exports["${subpath}"] has import ${entry.import} but development ${entry.development}, not its twin under ./dev/`)
  }
}
// The export list is the define list: one entry each, and nothing extra.
const expectedSubpaths = ['./elements', ...entries.map((e) => `./elements/${e.name}`)]
const actualSubpaths = Object.keys(exportsMap).filter((k) => k === './elements' || k.startsWith('./elements/'))
for (const sub of expectedSubpaths) if (!actualSubpaths.includes(sub)) fail(`exports has no "${sub}", though src/elements/define/ has a module for it`)
for (const sub of actualSubpaths) if (!expectedSubpaths.includes(sub)) fail(`exports["${sub}"] has no module in src/elements/define/`)
if (actualSubpaths.length === expectedSubpaths.length && expectedSubpaths.every((s) => actualSubpaths.includes(s))) {
  ok(`exports has ./elements and one entry for each of the ${entries.length} define modules`)
}

// The types-only entries are the files in src/types/ (minus common.d.ts, which they share):
// each needs an exports entry and a typesVersions one (node10 ignores exports), and nothing extra.
{
  const typeNames = readdirSync(resolve(root, 'src/types')).filter((n) => n.endsWith('.d.ts')).map((n) => n.slice(0, -'.d.ts'.length)).filter((n) => n !== 'common')
  const isTypesEntry = (v) => v && typeof v === 'object' && Object.keys(v).length === 1 && /^\.\/types\//.test(v.types || '')
  const inExports = Object.entries(exportsMap).filter(([, v]) => isTypesEntry(v)).map(([k]) => k.slice(2))
  const inVersions = Object.entries(manifest.typesVersions?.['*'] || {}).filter(([, v]) => (v || []).some((p) => p.startsWith('types/'))).map(([k]) => k)
  let good = true
  for (const n of typeNames) {
    if (!inExports.includes(n)) (good = false), fail(`exports has no types-only "./${n}", though src/types/${n}.d.ts exists`)
    if (!inVersions.includes(n)) (good = false), fail(`typesVersions has no "${n}" path to types/${n}.d.ts, so moduleResolution node10 cannot find tickslate/${n}`)
  }
  for (const n of inExports) if (!typeNames.includes(n)) (good = false), fail(`exports["./${n}"] is types only but src/types/${n}.d.ts does not exist`)
  for (const n of inVersions) if (!typeNames.includes(n)) (good = false), fail(`typesVersions["${n}"] points into types/ but src/types/${n}.d.ts does not exist`)
  if (good) ok(`exports and typesVersions both have the ${typeNames.length} types-only entries (${typeNames.join(', ')})`)
}

// ------------------------------------------------ custom elements manifest (RFC 0003 §22.3)
//
// Both files must list every tag a define module registers, each with the
// attribute, event, part and slot arrays a tool reads; a tag added by a story
// that never documented it is caught here as well as in the generator.
{
  const cem = JSON.parse(await readFile(resolve(out, 'custom-elements.json'), 'utf8'))
  const data = JSON.parse(await readFile(resolve(out, 'vscode.html-custom-data.json'), 'utf8'))
  if (cem.schemaVersion !== '1.0.0') fail(`custom-elements.json has schemaVersion ${JSON.stringify(cem.schemaVersion)}, not "1.0.0"`)
  const declared = new Map(cem.modules.flatMap((m) => m.declarations).filter((d) => d.tagName).map((d) => [d.tagName, d]))
  const listed = new Set((data.tags || []).map((t) => t.name))
  for (const tag of allTags) {
    const d = declared.get(tag)
    if (!d) fail(`custom-elements.json has no declaration for <${tag}>`)
    else if (!['attributes', 'events', 'slots', 'cssParts', 'members'].every((k) => Array.isArray(d[k]))) fail(`custom-elements.json's <${tag}> lacks attributes, events, slots, cssParts or members`)
    if (!listed.has(tag)) fail(`vscode.html-custom-data.json has no <${tag}>`)
  }
  if (allTags.every((tag) => declared.has(tag) && listed.has(tag))) ok(`custom-elements.json and vscode.html-custom-data.json list all ${allTags.length} tags`)
}

for (const field of ['unpkg', 'jsdelivr']) {
  if (manifest[field] !== './cdn/tickslate.iife.js') fail(`"${field}" is ${JSON.stringify(manifest[field])}, not ./cdn/tickslate.iife.js`)
  else ok(`"${field}" points at the all-in IIFE`)
}
for (const f of ['./cdn/tickslate.js', './cdn/tickslate.iife.js']) {
  if (exportsMap[f] !== f) fail(`exports["${f}"] is ${JSON.stringify(exportsMap[f])}, not the plain path ${f}`)
}

// ----------------------------------------------------- theme presets (RFC 0003 §13.1)
//
// Presets are opt-in files, so nothing else in the package imports them and
// a lost copy step would pass every other check. Each source preset must ship
// as the same bytes, and be reachable through the ./themes/*.css export.

const presetsDir = resolve(root, 'src/themes/presets')
const presetNames = (await readdir(presetsDir)).filter((n) => n.endsWith('.css')).sort()
if (!presetNames.length) fail('src/themes/presets/ has no preset, so there is nothing to ship')
if (exportsMap['./themes/*.css'] !== './themes/*.css') {
  fail(`exports["./themes/*.css"] is ${JSON.stringify(exportsMap['./themes/*.css'])}, not "./themes/*.css", so tickslate/themes/<name>.css does not resolve`)
}
for (const name of presetNames) {
  const shipped = await readFile(resolve(out, 'themes', name), 'utf8').catch(() => null)
  if (shipped === null) fail(`dist-lib/themes/${name} is missing — pack-lib copies it from src/themes/presets/`)
  else if (shipped !== (await readFile(resolve(presetsDir, name), 'utf8'))) fail(`dist-lib/themes/${name} differs from src/themes/presets/${name}`)
  else ok(`themes/${name} ships and matches its source`)
}

const REQUIRED_SIDE_EFFECTS = ['./elements.js', './elements/*.js', './dev/elements.js', './dev/elements/*.js', '*.css']
for (const f of REQUIRED_SIDE_EFFECTS) {
  if (!Array.isArray(manifest.sideEffects) || !manifest.sideEffects.includes(f)) {
    fail(`sideEffects does not list ${f}, so a bundler may drop its import as unused`)
  } else ok(`sideEffects lists ${f}`)
}
if (Array.isArray(manifest.sideEffects) && manifest.sideEffects.some((f) => /chunks/.test(f))) {
  fail('sideEffects lists a chunk, but chunks register nothing and listing them stops a bundler dropping the ones a host does not use')
}
if (manifest.engines && manifest.engines.node !== '>=20') {
  fail(`engines.node is "${manifest.engines.node}", but RFC 0002 §8 requires ">=20"`)
} else if (!manifest.engines) fail('dist-lib/package.json has no engines field')
else ok('engines.node is >=20')

if (existsSync(resolve(out, 'umd/tickslate.umd.js'))) ok('umd/tickslate.umd.js (the core-only UMD) is in dist-lib/')
else fail('umd/tickslate.umd.js is missing — run `npm run build:umd` (build:lib wipes dist-lib/, so it must run after it)')

// ----------------------------------------------------------------------- docs

for (const f of ['README.md', 'LICENSE', 'CHANGELOG.md']) {
  if (existsSync(resolve(out, f))) ok(f)
  else fail(`${f} is missing from dist-lib/ (pack-lib copies it from the repo root)`)
}

// ------------------------------------------------------- imports with no DOM
//
// Hosts that render on the server evaluate every module in their graph in
// Node, so an entry that touches window or document at module scope breaks
// their production build with a stack trace inside node_modules. Imported
// rather than grepped, because only running the module proves it.

const DOM_GLOBALS = ['window', 'document', 'HTMLElement', 'customElements']
const present = DOM_GLOBALS.filter((name) => typeof globalThis[name] !== 'undefined')
if (present.length) {
  // A DOM shim here would make the next check pass without proving anything.
  fail(`DOM globals are defined (${present.join(', ')}), so the no-DOM import check proves nothing`)
}

const importable = [
  'index.js',
  'elements.js',
  'dev/elements.js',
  ...entries.flatMap((e) => [`elements/${e.name}.js`, `dev/elements/${e.name}.js`]),
  'cdn/tickslate.js',
]
const modules = {}
for (const rel of importable) {
  try {
    const mod = await import(pathToFileURL(resolve(out, rel)).href)
    if (Object.keys(mod).length) {
      modules[rel] = mod
      ok(`${rel} imports in plain Node with no DOM globals`)
    } else fail(`${rel} imports with no DOM but exports nothing`)
  } catch (e) {
    fail(`${rel} does not import in plain Node with no DOM: ${e && e.message}`)
  }
}

// ------------------------------------------------------------------- version
//
// The version lives in two places that must agree: the manifest npm
// publishes, and the `version` export hosts read at runtime. Read from the
// imported module, because the bundler is free to rename the binding.

for (const rel of ['index.js', 'elements.js', 'dev/elements.js', 'cdn/tickslate.js']) {
  const mod = modules[rel]
  if (!mod) continue
  if (typeof mod.version !== 'string') fail(`dist-lib/${rel} has no version export`)
  else if (mod.version !== manifest.version) {
    fail(`version mismatch: dist-lib/package.json is ${manifest.version}, dist-lib/${rel} exports ${mod.version} ` +
         '(bump package.lib.json and src/core/index.js together)')
  } else ok(`${rel} exports version ${mod.version}, matching dist-lib/package.json`)
}

// ------------------------------------------------ development and production
//
// The two element trees differ only in their warnings, and must share one
// core: a dev build that bundled its own copy would hold a second configure()
// state, so a host's settings would reach one tree's widgets and not the
// other's. And a file from one tree importing the other would register every
// element twice, or put a development warning into a production page.

const listJs = async (dir) => {
  const names = await readdir(resolve(out, dir)).catch(() => [])
  return names.filter((n) => n.endsWith('.js')).sort().map((n) => `${dir}/${n}`)
}
const prodFiles = ['elements.js', ...(await listJs('elements')), ...(await listJs('chunks'))]
const devFiles = ['dev/elements.js', ...(await listJs('dev/elements')), ...(await listJs('dev/chunks'))]
const corePath = resolve(out, 'index.js')
const devDir = resolve(out, 'dev') + sep

const read = (rel) => readFile(resolve(out, rel), 'utf8').catch(() => null)
// What a file imports, as absolute paths. Only relative specifiers are
// followed: 'emberwick' is a peer, and the two trees never name each other that way.
async function importsOf(rel) {
  const text = await read(rel)
  if (text === null) return null
  const specifiers = [...text.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*(['"])([^'"]+)\1/g)].map((m) => m[2])
  return specifiers.filter((s) => s.startsWith('.')).map((s) => resolve(dirname(resolve(out, rel)), s))
}

let separated = true
for (const rel of prodFiles) {
  const found = await importsOf(rel)
  if (found === null) continue
  for (const target of found) {
    if (target.startsWith(devDir)) {
      separated = false
      fail(`production file ${rel} imports ${relative(out, target)} from the development tree`)
    }
  }
}
let devReachesCore = false
for (const rel of devFiles) {
  const found = await importsOf(rel)
  if (found === null) continue
  for (const target of found) {
    if (target === corePath) devReachesCore = true
    else if (!target.startsWith(devDir)) {
      separated = false
      fail(`development file ${rel} imports ${relative(out, target)}, which is neither the core (index.js) nor another development file`)
    }
  }
}
if (existsSync(resolve(out, 'dev/index.js'))) {
  separated = false
  fail('dist-lib/dev/index.js exists, so the development tree carries its own core instead of sharing index.js')
}
if (!devFiles.length) fail('dist-lib/dev/ has no files — run `npm run build:dev` (build:lib wipes dist-lib/, so it must run after it)')
else if (!devReachesCore) fail('no development file imports the core index.js, so the development tree does not share the core')
if (separated && devFiles.length) {
  ok(`${prodFiles.length} production and ${devFiles.length} development files never import each other, and the development files share the one core index.js`)
}

const leaked = []
for (const rel of [...prodFiles, 'cdn/tickslate.js', 'cdn/tickslate.iife.js']) {
  const text = await read(rel)
  if (text !== null && text.includes('console.warn')) leaked.push(rel)
}
if (leaked.length) fail(`${leaked.join(', ')} contain console.warn, so a development warning leaked into production (is __TS_DEV__ defined false in the build config?)`)
else ok('no production or CDN file contains console.warn')
const devTexts = await Promise.all(devFiles.map(read))
if (devFiles.length && !devTexts.some((t) => t && t.includes('console.warn'))) {
  fail('no development file contains console.warn, so the development tree has no warnings (is __TS_DEV__ defined true in vite.dev.config.js?)')
} else if (devFiles.length) ok('the development tree contains console.warn')

// --------------------------------------------------- the CDN bundle (RFC 0003 §2.3)
//
// The IIFE is run in a bare vm context with just enough of a browser to define
// custom elements: a plain <script> is how it is used. `var Tickslate` at the
// top of a classic script becomes window.Tickslate, and here the context's
// global stands in for window.

const iifeText = await read('cdn/tickslate.iife.js')
if (iifeText !== null) {
  const registry = new Map()
  const sandbox = {
    HTMLElement: class {},
    customElements: { get: (tag) => registry.get(tag), define: (tag, ctor) => registry.set(tag, ctor) },
  }
  sandbox.window = sandbox
  const before = Object.getOwnPropertyNames(sandbox)
  try {
    runInNewContext(iifeText, sandbox, { filename: 'cdn/tickslate.iife.js' })
    // A classic script's top-level `var` is a global. The bundle may add
    // Tickslate and nothing else, or a page's own `const E` would clash with a
    // minified helper.
    const added = Object.getOwnPropertyNames(sandbox).filter((k) => !before.includes(k))
    if (added.join() !== 'Tickslate') fail(`running cdn/tickslate.iife.js adds the globals ${added.join(', ') || '(none)'}, not just Tickslate`)
    else ok('cdn/tickslate.iife.js adds exactly one global, Tickslate')
    const api = sandbox.window.Tickslate
    // Every export of tickslate and tickslate/elements, which share `version`.
    const wanted = [...new Set([...Object.keys(modules['index.js'] || {}), ...Object.keys(modules['elements.js'] || {})])]
    const missing = wanted.filter((name) => !(api && name in api))
    if (!api) fail('running cdn/tickslate.iife.js did not set window.Tickslate')
    else if (missing.length) fail(`window.Tickslate lacks ${missing.join(', ')}, which tickslate or tickslate/elements exports`)
    else ok(`window.Tickslate has all ${wanted.length} exports of tickslate and tickslate/elements`)
    const defined = [...registry.keys()].sort()
    if (defined.join() !== [...allTags].sort().join()) {
      fail(`cdn/tickslate.iife.js registered ${defined.join(', ') || 'nothing'}, but the define modules register ${[...allTags].sort().join(', ')}`)
    } else ok(`cdn/tickslate.iife.js registers all ${defined.length} elements`)
  } catch (e) {
    fail(`cdn/tickslate.iife.js does not run as a plain script: ${e && e.message}`)
  }
  const umdText = await read('umd/tickslate.umd.js')
  if (umdText !== null) {
    const umdBox = {}
    const umdBefore = Object.getOwnPropertyNames(umdBox)
    try {
      runInNewContext(umdText, umdBox, { filename: 'umd/tickslate.umd.js' })
      const added = Object.getOwnPropertyNames(umdBox).filter((k) => !umdBefore.includes(k))
      if (added.join() !== 'Tickslate') fail(`running umd/tickslate.umd.js adds the globals ${added.join(', ') || '(none)'}, not just Tickslate`)
      else ok('umd/tickslate.umd.js adds exactly one global, Tickslate')
    } catch (e) {
      fail(`umd/tickslate.umd.js does not run as a plain script: ${e && e.message}`)
    }
  }
  const esm = modules['cdn/tickslate.js']
  if (esm && modules['index.js'] && modules['elements.js']) {
    const wanted = new Set([...Object.keys(modules['index.js']), ...Object.keys(modules['elements.js'])])
    const got = new Set(Object.keys(esm))
    const differ = [...wanted].filter((n) => !got.has(n)).concat([...got].filter((n) => !wanted.has(n)))
    if (differ.length) fail(`cdn/tickslate.js and the packages' exports differ on ${differ.join(', ')}`)
    else ok('cdn/tickslate.js exports the same names as tickslate and tickslate/elements together')
  }
}

// ------------------------------------------------ resolution and tree-shaking
//
// Resolved by Node itself and bundled by esbuild in a scratch consumer that
// finds the package the way an install would, rather than by reading the
// manifest back to ourselves. The scratch dir holds a symlink, so nothing is
// copied or installed.

const scratch = await mkdtemp(resolve(tmpdir(), 'tickslate-resolve-'))
try {
  await mkdir(resolve(scratch, 'node_modules'))
  await symlink(out, resolve(scratch, 'node_modules', manifest.name), 'dir')

  const subpaths = expectedSubpaths.map((s) => s.replace(/^\./, manifest.name))
  const resolveAll = (flags) => JSON.parse(execFileSync(process.execPath, [
    ...flags, '--input-type=module', '-e',
    `console.log(JSON.stringify(${JSON.stringify(subpaths)}.map((s) => import.meta.resolve(s))))`,
  ], { cwd: scratch, encoding: 'utf8' }))
  const asPath = (url) => relative(out, fileURLToPath(url)).split(sep).join('/')
  const plain = resolveAll([]).map(asPath)
  const withDev = resolveAll(['--conditions=development']).map(asPath)
  let resolved = true
  subpaths.forEach((s, i) => {
    const entry = exportsMap[expectedSubpaths[i]]
    if (!entry) return
    if (plain[i] !== entry.import.slice(2)) {
      resolved = false
      fail(`${s} resolves to ${plain[i]} by default, not ${entry.import.slice(2)}`)
    }
    if (withDev[i] !== entry.development.slice(2)) {
      resolved = false
      fail(`${s} resolves to ${withDev[i]} under --conditions=development, not ${entry.development.slice(2)}`)
    }
  })
  if (resolved) ok(`all ${subpaths.length} elements entries resolve to their production file by default and to their dev/ twin under --conditions=development`)

  // `import 'tickslate/elements/<name>'` bundled with esbuild registers exactly
  // that entry's tags and carries no other widget (RFC 0003 §2.4). The tag
  // *strings* 'ts-grid' and 'ts-equity-curve' can't be the test: the core's
  // WIDGETS catalog, the not-yet-defined CSS and the widget base's grid lookup
  // all name them as data, in every bundle. What a bundle must not hold is a
  // define() call for another tag, or another widget's class.
  const bundleOf = async (name, conditions) => {
    const result = await build({
      stdin: { contents: `import '${manifest.name}/elements/${name}'`, resolveDir: scratch, loader: 'js' },
      bundle: true,
      write: false,
      format: 'esm',
      target: 'es2019',
      logLevel: 'silent',
      external: ['emberwick'],
      conditions,
    })
    return result.outputFiles[0].text
  }
  for (const mode of [[], ['development']]) {
    const label = mode.length ? 'development' : 'production'
    let shaken = true
    for (const entry of entries) {
      const text = await bundleOf(entry.name, mode)
      const defines = [...text.matchAll(/\bdefine\(\s*["']([a-z][a-z0-9-]*)["']/g)].map((m) => m[1])
      if (defines.sort().join() !== [...entry.tags].sort().join()) {
        shaken = false
        fail(`a ${label} bundle of ${manifest.name}/elements/${entry.name} registers ${defines.join(', ') || 'nothing'}, not just ${entry.tags.join(', ')}`)
      }
      for (const other of entries.filter((o) => o !== entry)) {
        for (const cls of other.exports) {
          if (!entry.exports.includes(cls) && new RegExp(`\\b${cls}\\d*\\b`).test(text)) {
            shaken = false
            fail(`a ${label} bundle of ${manifest.name}/elements/${entry.name} contains ${cls}, which belongs to ${manifest.name}/elements/${other.name}`)
          }
        }
      }
      if (mode.length && !text.includes('console.warn')) {
        shaken = false
        fail(`a development bundle of ${manifest.name}/elements/${entry.name} has no console.warn, so the development condition did not reach dev/`)
      }
      if (!mode.length && text.includes('console.warn')) {
        shaken = false
        fail(`a production bundle of ${manifest.name}/elements/${entry.name} contains console.warn`)
      }
    }
    if (shaken) ok(`a ${label} esbuild bundle of each of the ${entries.length} entries registers only its own tag and holds no other widget`)
  }
} catch (e) {
  fail(`could not resolve or bundle ${manifest.name} from a scratch consumer: ${(e && (e.stderr || e.message) || '').toString().trim()}`)
} finally {
  await rm(scratch, { recursive: true, force: true })
}

// ---------------------------------------------------------------- pack list
//
// What npm would actually put in the tarball, not what is on disk: npm adds
// and drops files by its own rules. Anything outside the allowlist fails, so
// a file can only arrive in the package on purpose. For example, vite copies
// a public/ folder into outDir by default, which would publish whatever a
// demo page keeps there.
//
// The allowlist is the docs, every manifest target and its source map, the
// declarations pack-lib flattens to the root, and the shared chunks the two
// element builds split out (chunkFileNames in vite.lib.config.js and
// vite.dev.config.js). A new entry point is allowed by adding a module to
// src/elements/define/, not here.

const ALLOWED = [
  'package.json',
  'README.md',
  'LICENSE',
  'CHANGELOG.md',
  '*.d.ts',
  // The framework typings, and common.d.ts which they share (RFC 0003 §22.1).
  'types/*.d.ts',
  'chunks/*.js',
  'chunks/*.js.map',
  'dev/chunks/*.js',
  'dev/chunks/*.js.map',
  // The core-only UMD is no longer a manifest target (unpkg and jsdelivr moved
  // to the CDN IIFE) but still ships, as RFC 0003 §2.3 says; it is checked below.
  'umd/tickslate.umd.js',
  'umd/tickslate.umd.js.map',
]
const patterns = ALLOWED.map(glob)
const allowed = (path) =>
  targetFiles.has(path) ||
  (path.endsWith('.js.map') && targetFiles.has(path.slice(0, -'.map'.length))) ||
  patterns.some((re) => re.test(path))

let packed = null
try {
  const stdout = execFileSync('npm', ['pack', '--dry-run', '--json', './dist-lib'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    // npm is a .cmd shim on Windows, which only a shell can run.
    shell: process.platform === 'win32',
  })
  const report = JSON.parse(stdout.slice(stdout.indexOf('[')))
  packed = report[0].files.map((f) => f.path)
} catch (e) {
  fail(`npm pack --dry-run --json ./dist-lib failed: ${(e && (e.stderr || e.message) || '').toString().trim()}`)
}

if (packed) {
  const stray = packed.filter((path) => !allowed(path))
  if (stray.length) {
    fail(`npm pack would publish ${stray.length} file${stray.length > 1 ? 's' : ''} outside the allowlist: ` +
         `${stray.join(', ')} (allow it in scripts/verify-package.mjs only if it ships on purpose)`)
  } else ok(`npm pack lists ${packed.length} files, all on the allowlist`)

  // The reverse: a "files" field or an .npmignore can drop a target that
  // exists on disk, and the tarball would then 404 the same way.
  const dropped = [...targetFiles].filter((path) => !packed.includes(path))
  if (dropped.length) fail(`npm pack leaves out manifest targets: ${dropped.join(', ')}`)
  else ok('npm pack includes every manifest target')
}

if (problems.length) {
  console.error(`\n${problems.length} problem${problems.length > 1 ? 's' : ''} with dist-lib/:`)
  for (const p of problems) console.error(`  - ${p}`)
  console.error('\nNot publishable.')
  process.exit(1)
}
console.log(`\ndist-lib/ looks publishable (${manifest.name}@${manifest.version}).`)

/** A '*' matches within one path segment; everything else is literal. */
function glob(pattern) {
  const body = pattern.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')
  return new RegExp(`^${body}$`)
}
