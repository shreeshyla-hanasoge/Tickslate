#!/usr/bin/env node
/**
 * Checks the assembled dist-lib/ before anyone runs `npm publish ./dist-lib`.
 *
 *   npm run verify:package
 *
 * Each check names a way a package can pack cleanly and still be broken for
 * the people who install it. vite's emptyOutDir wipes dist-lib/ on every lib
 * build, so skipping build:umd yields a tarball whose unpkg and jsdelivr
 * entries 404 for every CDN user, and nothing else in the release notices.
 */
import { readFile, mkdtemp, mkdir, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { existsSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve, dirname, relative, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

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

// ------------------------------------------------------------ manifest targets
//
// Every path the published manifest points at must be a file in dist-lib/.
// A field that is missing altogether fails too: dropping "unpkg" would hide a
// lost CDN build rather than fix it.

const FIELDS = ['main', 'module', 'types', 'unpkg', 'jsdelivr', 'exports']
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

const targetFiles = new Set()
for (const [target, where] of targets) {
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
    // A subpath pattern ('*') also ends up here until this check learns to
    // expand one, which fails safe.
    fail(`${where} points at ${target}, which is not in dist-lib/`)
  }
}

// ------------------------------------------------- export conditions (RFC 0002 §8)
//
// A bundler or Node picks the first matching condition in key order, so a
// missing "default" breaks require-less tooling and a "development" listed
// after "import" is never reached.

for (const [subpath, entry] of Object.entries(manifest.exports || {})) {
  if (typeof entry === 'string') continue // tokens.css and package.json stay plain paths
  const keys = Object.keys(entry)
  const missing = ['types', 'import', 'default'].filter((k) => !keys.includes(k))
  if (missing.length) fail(`exports["${subpath}"] has no ${missing.join(', ')} condition`)
  else ok(`exports["${subpath}"] has types, import and default`)
}
const elementsEntry = (manifest.exports || {})['./elements']
if (!elementsEntry || elementsEntry.development !== './elements.dev.js') {
  fail('exports["./elements"] has no "development" condition pointing at ./elements.dev.js')
} else if (Object.keys(elementsEntry).indexOf('development') > Object.keys(elementsEntry).indexOf('import')) {
  fail('exports["./elements"] lists "development" after "import", so it is never reached')
} else ok('exports["./elements"] has "development" -> ./elements.dev.js, before "import"')
for (const f of ['./elements.js', './elements.dev.js']) {
  if (!Array.isArray(manifest.sideEffects) || !manifest.sideEffects.includes(f)) {
    fail(`sideEffects does not list ${f}, so a bundler may drop its import as unused`)
  } else ok(`sideEffects lists ${f}`)
}
if (manifest.engines && manifest.engines.node !== '>=20') {
  fail(`engines.node is "${manifest.engines.node}", but RFC 0002 §8 requires ">=20"`)
} else if (!manifest.engines) fail('dist-lib/package.json has no engines field')
else ok('engines.node is >=20')

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

const modules = {}
for (const rel of ['index.js', 'elements.js', 'elements.dev.js']) {
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

for (const rel of ['index.js', 'elements.js', 'elements.dev.js']) {
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
// The two element builds differ only in their warnings, and must share one
// core: a dev build that bundled its own copy would hold a second configure()
// state, so a host's settings would reach one build's widgets and not the
// other's. elements.dev.js may be unreadable if build:dev was skipped; that
// shows up above as a missing manifest target.

const read = (rel) => readFile(resolve(out, rel), 'utf8').catch(() => null)
const prod = await read('elements.js')
const dev = await read('elements.dev.js')
if (prod !== null) {
  if (prod.includes('console.warn')) fail('elements.js contains console.warn, so a development warning leaked into production (is __TS_DEV__ defined false in vite.lib.config.js?)')
  else ok('elements.js contains no console.warn')
}
if (dev !== null) {
  if (!dev.includes('console.warn')) fail('elements.dev.js contains no console.warn, so it has no development warnings (is __TS_DEV__ defined true in vite.dev.config.js?)')
  else ok('elements.dev.js contains console.warn')
  const specifiers = [...dev.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*(['"])([^'"]+)\1/g)].map((m) => m[2])
  const norm = (sp) => sp.replace(/^\.\//, '')
  if (!specifiers.includes('./index.js')) fail('elements.dev.js does not import ./index.js, so it does not share the core')
  else if (specifiers.some((sp) => norm(sp) === 'elements.js')) fail('elements.dev.js imports elements.js, which would register every element twice')
  else ok('elements.dev.js imports ./index.js and never elements.js')
}

// Resolved by Node itself in a scratch consumer that finds the package the way
// an install would, rather than by reading the manifest back to ourselves.
// The scratch dir holds a symlink, so nothing is copied or installed.
const scratch = await mkdtemp(resolve(tmpdir(), 'tickslate-resolve-'))
try {
  await mkdir(resolve(scratch, 'node_modules'))
  await symlink(out, resolve(scratch, 'node_modules', manifest.name), 'dir')
  const resolveIn = (flags) => execFileSync(process.execPath, [
    ...flags, '--input-type=module', '-e',
    `console.log(import.meta.resolve('${manifest.name}/elements'))`,
  ], { cwd: scratch, encoding: 'utf8' }).trim()
  const base = (url) => url.slice(url.lastIndexOf('/') + 1)
  const plain = base(resolveIn([]))
  const withDev = base(resolveIn(['--conditions=development']))
  if (plain !== 'elements.js') fail(`${manifest.name}/elements resolves to ${plain} by default, not elements.js`)
  else ok(`${manifest.name}/elements resolves to elements.js by default`)
  if (withDev !== 'elements.dev.js') fail(`${manifest.name}/elements resolves to ${withDev} under --conditions=development, not elements.dev.js`)
  else ok(`${manifest.name}/elements resolves to elements.dev.js under --conditions=development`)
} catch (e) {
  fail(`could not resolve ${manifest.name}/elements from a scratch consumer: ${(e && (e.stderr || e.message) || '').toString().trim()}`)
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
// declarations pack-lib flattens to the root, and the shared chunks the lib
// build may split out (chunkFileNames in vite.lib.config.js). A new entry
// point is allowed by adding it to package.lib.json, not here.

const ALLOWED = [
  'package.json',
  'README.md',
  'LICENSE',
  'CHANGELOG.md',
  '*.d.ts',
  'chunks/*.js',
  'chunks/*.js.map',
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
