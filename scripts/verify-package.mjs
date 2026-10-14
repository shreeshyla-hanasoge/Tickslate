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
import { readFile } from 'node:fs/promises'
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
for (const rel of ['index.js', 'elements.js']) {
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

for (const rel of ['index.js', 'elements.js']) {
  const mod = modules[rel]
  if (!mod) continue
  if (typeof mod.version !== 'string') fail(`dist-lib/${rel} has no version export`)
  else if (mod.version !== manifest.version) {
    fail(`version mismatch: dist-lib/package.json is ${manifest.version}, dist-lib/${rel} exports ${mod.version} ` +
         '(bump package.lib.json and src/core/index.js together)')
  } else ok(`${rel} exports version ${mod.version}, matching dist-lib/package.json`)
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
