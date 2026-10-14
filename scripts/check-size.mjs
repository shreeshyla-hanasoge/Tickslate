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

/**
 * Budgets on min+gz bytes, per file.
 *
 * 'warn' prints a warning and exits 0; 'enforce' fails the run. A budget
 * starts as 'warn' while its target is provisional and moves to 'enforce'
 * once the target is approved, so an estimate made before the code existed
 * can't block a release, yet every run still shows how far off it is.
 */
const BUDGETS = {
  // Target: core ≤ 6 kB min+gz (RFC 0001 §13), set 2026-10-13. Warn until
  // RFC 0002 approves the final value, then enforce.
  'dist-lib/index.js': { maxKb: 6, mode: 'warn', target: 'RFC 0001 §13', date: '2026-10-13' },
  // Target: tickslate/elements ≤ 24 kB min+gz (RFC 0001 §13), set
  // 2026-10-13. Measured without the core, which has its own line above.
  // Warn until RFC 0002 approves the final value, then enforce.
  'dist-lib/elements.js': { maxKb: 24, mode: 'warn', target: 'RFC 0001 §13', date: '2026-10-13' },
}

const problems = []
const warnings = []

const files = ['dist-lib/index.js', 'dist-lib/elements.js']
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
  if (!files.includes(rel)) problems.push(`there is a budget for ${rel}, but that file is not measured`)
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
  const budget = BUDGETS[rel]
  if (budget) {
    row.budget = budget
    const limit = budget.maxKb * KB
    if (row.gz > limit) {
      const over = `${rel} is ${kb(row.gz)} min+gz, over its ${budget.maxKb} kB budget by ${row.gz - limit} B (${budget.target}, ${budget.date})`
      if (budget.mode === 'enforce') {
        row.status = 'FAIL'
        problems.push(over)
      } else {
        row.status = 'warn'
        warnings.push(over)
      }
    } else row.status = 'ok'
  }
  rows.push(row)
}

const header = ['file', 'raw', 'min', 'min+gz', 'budget', 'mode', 'status']
const table = rows.map((r) => [
  relative(out, resolve(root, r.rel)),
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

/**
 * What `import 'tickslate/elements'` costs a host in total: the entry bundled
 * with the core it imports. Reported, not budgeted, because RFC 0001 §13
 * budgets the two entries separately; it is here so the maintainer sees the
 * combined figure when RFC 0002 settles the final budgets.
 */
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
  console.log(`\nimport 'tickslate/elements' with its core, bundled: ${bytes(bundled.length)} min, ${bytes(gzipSync(bundled).length)} min+gz (not budgeted)`)
}

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
