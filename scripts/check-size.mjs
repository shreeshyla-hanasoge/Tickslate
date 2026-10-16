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
 * Two kinds of row. A *file* row is one file as built. An *entry* row is what
 * a host pays for `import 'tickslate/elements/<name>'`: the entry bundled with
 * the core and the shared chunks it needs, which is the figure a per-widget
 * entry is for. Entries are found in src/elements/define/, so a new widget
 * shows up here and must be given a budget before a release passes.
 *
 * Runs after pack:lib, against dist-lib/ as it will be published.
 */
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transform, build } from 'esbuild'
import { elementEntries } from './entries.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(root, 'dist-lib')

// 1024 bytes, as in Emberwick's check, so figures compare across the two.
const KB = 1024
const ALL_IN = 'tickslate/elements + core (bundled)'
const entryLabel = (name) => `tickslate/elements/${name} (bundled)`
const pairLabel = (name) => `grid + ${name} (bundled)`

/**
 * Budgets on min+gz bytes, per row.
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
  // Measured 2026-10-13: core 8,484 B. The messages story put the EN table in
  // the core, so both figures below were re-measured on 2026-10-14: core
  // 10,394 B.
  'dist-lib/index.js': { maxKb: 13, mode: 'enforce', target: 're-measured after locale-formatting, RFC 0003 §25, CI measurement', date: '2026-10-16' },
  // The UMD is the core plus a ~150 B wrapper. Measured 2026-10-14, after
  // messages: 10,551 B.
  'dist-lib/umd/tickslate.umd.js': { maxKb: 13, mode: 'enforce', target: 're-measured after locale-formatting, RFC 0003 §25, CI measurement', date: '2026-10-16' },
  // The all-in `tickslate/elements` and the two CDN files carry no budget:
  // P1 adds about a dozen widgets to them, so RFC 0002's 50 kB figure belongs
  // to the 0.1.0 widget set. They are reported, and 0.2.0 release preparation
  // resets their enforced budgets from measurement (RFC 0003 §25, Decision 38).
  // dist-lib/elements.js and the dev/ tree are reported too: the dev tree is
  // never shipped to production, and elements.js alone is not what a host
  // downloads.
}

/**
 * One budget per `tickslate/elements/<name>` entry (RFC 0003 §25), keyed by the
 * entry name, each the measured min+gz size of the entry bundled with its core
 * plus 10 %, rounded up to the next 0.5 kB. Same rule as above: raise a
 * figure only with the reason in the story's fragment and a new date.
 *
 * Measured 2026-10-14 (entries-and-cdn): grid 20,664 B, card 11,168 B,
 * metric 12,910 B, chart 13,865 B, today-pnl 13,567 B, equity-curve 13,720 B,
 * session-clock 12,868 B.
 *
 * Re-measured 2026-10-14 after messages put the EN table in the core, which
 * every entry bundles: card 13,328 B, metric 15,052 B, chart 16,049 B,
 * today-pnl 15,672 B, equity-curve 15,848 B, session-clock 15,006 B. The grid
 * (22,429 B) still fits its first figure, so it was not raised.
 *
 * Re-measured 2026-10-14 after tile-chrome (one header, heading and arrows in
 * every widget, forced-colour rules) and persist-attribute (the grid's storage
 * adapters), and the review fixes that followed: grid 25,109 B, equity-curve
 * 17,994 B, session-clock 16,905 B, today-pnl 17,812 B. Only the four that no
 * longer fitted were raised; card, metric and chart still sit under theirs.
 * The grid's figure includes the default tokens it now injects, about 1.4 kB.
 *
 * Re-measured 2026-10-14 after overnight-sessions, theme-presets and
 * reading-order: card 14,855 B (7 B over its figure) and chart 17,834 B (86 B
 * of headroom, under 1 %), both reset to measured + 10 % so ordinary follow-up
 * work does not fail on noise. The rest still fit with room: grid 26,127 B,
 * metric 16,655 B, today-pnl 18,063 B, equity-curve 18,184 B, session-clock
 * 17,179 B, core 11,080 B, UMD 11,211 B.
 *
 * Re-measured 2026-10-15 after locale-formatting (maintainer approved): metric
 * 17,193 B, reset to measured + 10 % (18,912 B), rounded up to 18.5 kB. No
 * other row moved.
 *
 * Re-measured 2026-10-16 from the CI run (gzip differs a little by machine)
 * after locale-formatting: core 11,659 B (117 B of headroom) and UMD 11,808 B
 * (32 B over), each reset to measured + 10 %, rounded up to 13 kB.
 *
 * Re-measured 2026-10-16 after tile-activation, which grew the shared base:
 * card 16,499 B, chart 20,616 B, session-clock 19,151 B, each reset to
 * measured + 10 %, rounded up to 18, 22.5 and 21 kB. No other row moved.
 *
 * Re-measured 2026-10-16 after widget-picker-and-controls (merged with the
 * typings story): grid 28,353 B, metric 18,987 B, today-pnl 20,512 B,
 * equity-curve 20,509 B, each reset to measured + 10 %, rounded up to 30.5,
 * 20.5, 22.5 and 22.5 kB. No other row moved.
 */
const entry = (maxKb) => ({ maxKb, mode: 'enforce', target: 'RFC 0003 §25, per-entry, measured + 10 %', date: '2026-10-14' })
const remeasured = (maxKb) => ({ ...entry(maxKb), target: 're-measured after messages, RFC 0003 §25, per-entry, measured + 10 %' })
const remeasuredAgain = (maxKb) => ({ ...entry(maxKb), target: 're-measured after tile-chrome and persist-attribute, RFC 0003 §25' })
const remeasuredThird = (maxKb) => ({ ...entry(maxKb), target: 're-measured after overnight-sessions, theme-presets and reading-order, RFC 0003 §25' })
const remeasuredFourth = (maxKb) => ({ ...entry(maxKb), target: 're-measured after locale-formatting, RFC 0003 §25, maintainer approved', date: '2026-10-15' })
const remeasuredFifth = (maxKb) => ({ ...entry(maxKb), target: 're-measured after tile-activation, RFC 0003 §25', date: '2026-10-16' })
const remeasuredSixth = (maxKb) => ({ ...entry(maxKb), target: 're-measured after widget-picker-and-controls, RFC 0003 §25', date: '2026-10-16' })
// A new entry (widget-picker-and-controls, 2026-10-16): the picker and the grid controls measure 13,594 B bundled
// with the core, so 14,953 B with 10 %, which rounds up to 15 kB.
const newEntry = (maxKb) => ({ ...entry(maxKb), target: 'new entry, RFC 0003 §25, per-entry, measured + 10 %', date: '2026-10-16' })
// A new entry (ts-table, 2026-10-16): the table measures 20,005 B bundled with the core, so 22,006 B with 10 %, which
// rounds up to 21.5 kB.
// Two new entries (watchlist-and-positions, 2026-10-16): the watchlist measures 21,398 B bundled with the core, so 23,538 B with
// 10 %, which rounds up to 23 kB; the open positions measure 21,873 B, so 24,060 B with 10 %, which rounds up to 23.5 kB.
const ENTRY_BUDGETS = {
  controls: newEntry(15),
  grid: remeasuredSixth(30.5),
  card: remeasuredFifth(18),
  metric: remeasuredSixth(20.5),
  chart: remeasuredFifth(22.5),
  'today-pnl': remeasuredSixth(22.5),
  'equity-curve': remeasuredSixth(22.5),
  'session-clock': remeasuredFifth(21),
  table: newEntry(21.5),
  watchlist: newEntry(23),
  'open-positions': newEntry(23.5),
}

/**
 * RFC 0003 §25: the grid plus any one widget is at most 15 kB. It is 'warn'
 * and not 'enforce' because it cannot hold today: the grid alone is over 15 kB
 * (see the grid row), so every pair is. Every run prints the overage; the
 * maintainer decides whether the figure or the grid moves.
 */
const PAIR_BUDGET = { maxKb: 15, mode: 'warn', target: 'RFC 0003 §25, grid + one widget', date: '2026-10-14' }

const problems = []
const warnings = []

const entries = elementEntries()

const files = [
  'dist-lib/index.js',
  'dist-lib/elements.js',
  'dist-lib/dev/elements.js',
  'dist-lib/umd/tickslate.umd.js',
  'dist-lib/cdn/tickslate.js',
  'dist-lib/cdn/tickslate.iife.js',
]

// A budget keyed on something that is never measured would silently never apply.
for (const rel of Object.keys(BUDGETS)) {
  if (!files.includes(rel)) problems.push(`there is a budget for ${rel}, but that file is not measured`)
}
for (const name of Object.keys(ENTRY_BUDGETS)) {
  if (!entries.some((e) => e.name === name)) problems.push(`there is a budget for tickslate/elements/${name}, but src/elements/define/ has no module for it`)
}
// And the reverse: an entry nobody budgeted is the one that grows unnoticed.
for (const e of entries) {
  if (!ENTRY_BUDGETS[e.name]) problems.push(`tickslate/elements/${e.name} has no budget in scripts/check-size.mjs: measure it and add one (RFC 0003 §25)`)
}

const rows = []
for (const rel of files) {
  const file = resolve(root, rel)
  // Never skip a missing build: the manifest advertises the CDN files to every
  // CDN user, so a release that lost one must not report a clean size table.
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
    label: relative(out, file),
    raw: Buffer.byteLength(raw),
    min: Buffer.byteLength(code),
    gz: gzipSync(code).length,
  }
  judge(row, BUDGETS[rel])
  rows.push(row)
}

/** Minified and gzipped size of `options`' bundle, which is what a host's bundler would add. */
async function bundled(label, options, budget) {
  const result = await build({
    bundle: true,
    minify: true,
    format: 'esm',
    target: 'es2019',
    write: false,
    logLevel: 'silent',
    external: ['emberwick'],
    ...options,
  })
  const contents = result.outputFiles[0].contents
  const row = { rel: label, label, raw: contents.length, min: contents.length, gz: gzipSync(contents).length }
  judge(row, budget)
  rows.push(row)
}

const built = (rel) => resolve(out, rel)
if (existsSync(built('elements.js')) && existsSync(built('index.js'))) {
  await bundled(ALL_IN, { entryPoints: [built('elements.js')] })
} else problems.push('the all-in elements size could not be measured: elements.js or index.js is missing')

for (const e of entries) {
  const file = built(`elements/${e.name}.js`)
  if (!existsSync(file)) {
    problems.push(`${entryLabel(e.name)} could not be measured: elements/${e.name}.js is missing`)
    continue
  }
  await bundled(entryLabel(e.name), { entryPoints: [file] }, ENTRY_BUDGETS[e.name])
}

// The grid plus each other widget, bundled together so what they share (the
// core, the widget base) is counted once, as a host that imports both pays.
const gridFile = built('elements/grid.js')
for (const e of entries) {
  if (e.name === 'grid') continue
  const file = built(`elements/${e.name}.js`)
  if (!existsSync(gridFile) || !existsSync(file)) continue
  await bundled(
    pairLabel(e.name),
    { stdin: { contents: `export * from ${JSON.stringify(gridFile)}\nexport * from ${JSON.stringify(file)}\n`, resolveDir: out, loader: 'js' } },
    PAIR_BUDGET
  )
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

const header = ['file', 'raw', 'min', 'min+gz', 'budget', 'mode', 'status']
const table = rows.map((r) => [
  r.label || r.rel,
  r.missing ? 'missing' : bytes(r.raw),
  r.missing ? '' : bytes(r.min),
  r.missing ? '' : bytes(r.gz),
  r.budget ? `${r.budget.maxKb} kB` : '',
  r.budget ? r.budget.mode : '',
  r.missing ? 'FAIL' : r.status || 'report',
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
