#!/usr/bin/env node
/**
 * Size report and budgets for the built package.
 *
 *   npm run size
 *
 * The ESM build ships unminified because consumers minify, so its raw size
 * says little about what a page actually downloads. Each file is minified
 * here with esbuild (the minifier vite already uses) and gzipped with
 * node:zlib, so the min+gz column is the figure a host's bundle pays.
 *
 * Runs after pack:lib, against dist-lib/ as it will be published.
 */
import { readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transform, build } from 'esbuild'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(root, 'dist-lib')

// 1024 bytes, as in Emberwick's check, so figures compare across the two.
const KB = 1024
const ALL_IN = 'tickslate/elements + core (bundled)'

/**
 * Budgets on min+gz bytes, per file.
 *
 * 'warn' prints a warning and exits 0; 'enforce' fails the run. A budget
 * starts as 'warn' while its target is provisional and moves to 'enforce'
 * once the target is approved, so an estimate made before the code existed
 * can't block a release, yet every run still shows how far off it is.
 */
const BUDGETS = {
  // Re-baselined for 0.1.0 (release-0-1-0, RFC 0002 §9): each is the measured
  // min+gz size plus 10 %, rounded up to the next 0.5 kB. They are ceilings
  // against creep, not targets: when a change needs more room, say why in its
  // changes/ fragment and raise the figure here with the new date.
  // Measured 2026-10-13: core 8,484 B.
  'dist-lib/index.js': { maxKb: 9.5, mode: 'enforce', target: 'RFC 0002 §9, core, measured + 10 %', date: '2026-10-13' },
  // The UMD is the core plus a ~150 B wrapper. Measured 2026-10-13: 8,639 B.
  'dist-lib/umd/tickslate.umd.js': { maxKb: 9.5, mode: 'enforce', target: 'RFC 0002 §9, UMD, measured + 10 %', date: '2026-10-13' },
  // What a host pays for `import 'tickslate/elements'`: the entry bundled with
  // its core. A virtual row, measured below. Measured 2026-10-13: 46,478 B.
  [ALL_IN]: { maxKb: 50, mode: 'enforce', target: 'RFC 0002 §9, all-in elements, measured + 10 %', date: '2026-10-13' },
  // dist-lib/elements.dev.js and elements.js are reported only: the dev build
  // is never shipped to production, and elements.js alone is not what a host
  // downloads.
}

const problems = []
const warnings = []

const files = ['dist-lib/index.js', 'dist-lib/elements.js', 'dist-lib/elements.dev.js']
const umdDir = resolve(out, 'umd')
const umd = existsSync(umdDir)
  ? (await readdir(umdDir)).filter((n) => n.endsWith('.js')).sort().map((n) => `dist-lib/umd/${n}`)
  : []
// Never skip a missing build: the manifest advertises the UMD to every CDN
// user, so a release that lost it must not report a clean size table. The
// placeholder row fails below like any other missing file.
files.push(...(umd.length ? umd : ['dist-lib/umd/*.js']))

// A budget keyed on a path that is never measured would silently never apply.
for (const rel of Object.keys(BUDGETS)) {
  if (rel !== ALL_IN && !files.includes(rel)) problems.push(`there is a budget for ${rel}, but that file is not measured`)
}

const rows = []
for (const rel of files) {
  const file = resolve(root, rel)
  if (!existsSync(file)) {
    problems.push(`${rel} is missing — run \`npm run release\``)
    rows.push({ rel, missing: true })
    continue
  }
  const raw = await readFile(file, 'utf8')
  // es2019 matches the build target, so the minifier can't shrink the code
  // with syntax the package does not ship.
  const { code } = await transform(raw, { loader: 'js', minify: true, target: 'es2019' })
  const row = {
    rel,
    raw: Buffer.byteLength(raw),
    min: Buffer.byteLength(code),
    gz: gzipSync(code).length,
  }
  judge(row, BUDGETS[rel])
  rows.push(row)
}

function judge(row, budget) {
  if (!budget) return
  row.budget = budget
  const limit = budget.maxKb * KB
  if (row.gz <= limit) {
    row.status = 'ok'
    return
  }
  const over = `${row.rel} is ${kb(row.gz)} min+gz, over its ${budget.maxKb} kB budget by ${row.gz - limit} B (${budget.target}, ${budget.date})`
  if (budget.mode === 'enforce') {
    row.status = 'FAIL'
    problems.push(over)
  } else {
    row.status = 'warn'
    warnings.push(over)
  }
}

// The all-in row is built before the table so it prints with the others.
if (existsSync(resolve(out, 'elements.js')) && existsSync(resolve(out, 'index.js'))) {
  const result = await build({
    entryPoints: [resolve(out, 'elements.js')],
    bundle: true,
    minify: true,
    format: 'esm',
    target: 'es2019',
    write: false,
    logLevel: 'silent',
    external: ['emberwick'],
  })
  const bundled = result.outputFiles[0].contents
  const row = { rel: ALL_IN, raw: bundled.length, min: bundled.length, gz: gzipSync(bundled).length }
  judge(row, BUDGETS[ALL_IN])
  rows.push(row)
} else problems.push('the all-in elements size could not be measured: elements.js or index.js is missing')

const header = ['file', 'raw', 'min', 'min+gz', 'budget', 'mode', 'status']
const table = rows.map((r) => [
  r.rel === ALL_IN ? r.rel : relative(out, resolve(root, r.rel)),
  r.missing ? 'missing' : bytes(r.raw),
  r.missing ? '' : bytes(r.min),
  r.missing ? '' : bytes(r.gz),
  r.budget ? `${r.budget.maxKb} kB` : '',
  r.budget ? r.budget.mode : '',
  r.missing ? 'FAIL' : r.status || '',
])
const widths = header.map((h, i) => Math.max(h.length, ...table.map((r) => r[i].length)))
const line = (cells) => cells.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  ').trimEnd()
console.log(line(header))
console.log(widths.map((w) => '-'.repeat(w)).join('  '))
for (const r of table) console.log(line(r))

if (warnings.length) {
  console.warn(`\n${warnings.length} budget warning${warnings.length > 1 ? 's' : ''} (mode 'warn', so this run still passes):`)
  for (const w of warnings) console.warn(`  - ${w}`)
}

if (problems.length) {
  console.error(`\n${problems.length} size problem${problems.length > 1 ? 's' : ''}:`)
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}

function bytes(n) {
  return `${n} B`
}

function kb(n) {
  return `${(n / KB).toFixed(2)} kB`
}
