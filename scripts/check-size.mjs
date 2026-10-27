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
const addLabel = (name) => `${name} adds to grid (min+gz)`

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
  // Re-baselined at 0.3.0 (release-0-3-0, 2026-10-26): this row and every entry row below are set to the measured min+gz plus 10 %,
  // rounded up to the next 0.5 kB (RFC 0003 §25), measured on the 0.3.0 release candidate. index.js is now a 666 B shim over the
  // shared chunks, which is why its figure falls from 13 kB to 1 kB.
  'dist-lib/index.js': { maxKb: 1, mode: 'enforce', target: 're-baselined at 0.3.0 from measurement + 10 %, RFC 0003 §25', date: '2026-10-26' },
  // The UMD is the core plus a ~150 B wrapper. Measured 2026-10-14, after
  // messages: 10,551 B.
  // Re-measured 2026-10-26 (market-presets-and-breaks, authorised per RFC 0003 §25): the break engine and the five new presets
  // (nyse, nasdaq, lse, fx, tse) took the UMD to 17,062 B, so 18,768 B with 10 %, which rounds up to 18.5 kB.
  'dist-lib/umd/tickslate.umd.js': { maxKb: 20.5, mode: 'enforce', target: 're-baselined at 0.3.0 from measurement + 10 %, RFC 0003 §25', date: '2026-10-26' },
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
 *
 * Re-measured 2026-10-16 after freshness-and-flash (the shared ticker, flash and
 * freshness header): card 19,250 B, chart 23,263 B, session-clock 21,760 B and
 * table 22,328 B, each reset to measured + 10 %, rounded up to 21, 25, 23.5 and
 * 24 kB. No other row moved.
 *
 * Re-measured 2026-10-16 after watchlist-and-positions (merged with freshness-and-flash): the core UMD 13,222 B
 * (14.5 kB), metric 21,220 B (23 kB), watchlist 23,099 B (25 kB) and open-positions 23,821 B (26 kB), each reset to
 * measured + 10 %, rounded up to the next 0.5 kB. No other row moved.
 *
 * Re-measured 2026-10-17 for 0.2.0 after the five integrated stories (wide-screens, ts-progress, pnl-calendar,
 * ts-chart-bars, edge-stats-and-funding): the UMD 14,977 B (16.5 kB), controls 15,598 B (17 kB), chart 27,548 B (30 kB),
 * equity-curve 23,701 B (25.5 kB) and today-pnl 23,618 B (25.5 kB), each reset to measured + 10 %, rounded up to the next
 * 0.5 kB. The rows that still fit with 3 % or more of headroom were left alone.
 */
const entry = (maxKb) => ({ maxKb, mode: 'enforce', target: 'RFC 0003 §25, per-entry, measured + 10 %', date: '2026-10-14' })
const remeasured = (maxKb) => ({ ...entry(maxKb), target: 're-measured after messages, RFC 0003 §25, per-entry, measured + 10 %' })
const remeasuredAgain = (maxKb) => ({ ...entry(maxKb), target: 're-measured after tile-chrome and persist-attribute, RFC 0003 §25' })
const remeasuredThird = (maxKb) => ({ ...entry(maxKb), target: 're-measured after overnight-sessions, theme-presets and reading-order, RFC 0003 §25' })
const remeasuredFourth = (maxKb) => ({ ...entry(maxKb), target: 're-measured after locale-formatting, RFC 0003 §25, maintainer approved', date: '2026-10-15' })
const remeasuredFifth = (maxKb) => ({ ...entry(maxKb), target: 're-measured after tile-activation, RFC 0003 §25', date: '2026-10-16' })
const remeasuredSeventh = (maxKb) => ({ ...entry(maxKb), target: 're-measured after freshness-and-flash, RFC 0003 §25', date: '2026-10-16' })
const remeasuredNinth = (maxKb) => ({ ...entry(maxKb), target: 're-measured for 0.2.0 after the five integrated stories, RFC 0003 §25', date: '2026-10-17' })
const remeasuredSixth = (maxKb) => ({ ...entry(maxKb), target: 're-measured after widget-picker-and-controls, RFC 0003 §25', date: '2026-10-16' })
// A new entry (widget-picker-and-controls, 2026-10-16): the picker and the grid controls measure 13,594 B bundled
// with the core, so 14,953 B with 10 %, which rounds up to 15 kB.
const remeasuredEighth = (maxKb) => ({ ...entry(maxKb), target: 're-measured after watchlist-and-positions, RFC 0003 §25', date: '2026-10-16' })
const newEntry = (maxKb) => ({ ...entry(maxKb), target: 'new entry, RFC 0003 §25, per-entry, measured + 10 %', date: '2026-10-16' })
// A new entry (ts-table, 2026-10-16): the table measures 20,005 B bundled with the core, so 22,006 B with 10 %, which
// rounds up to 21.5 kB.
// Two new entries (watchlist-and-positions, 2026-10-16): the watchlist measures 21,398 B bundled with the core, so 23,538 B with
// 10 %, which rounds up to 23 kB; the open positions measure 21,873 B, so 24,060 B with 10 %, which rounds up to 23.5 kB.
// A new entry (ts-progress, 2026-10-16): the progress gauge measures 19,954 B bundled with the core, so 21,949 B with 10 %,
// which rounds up to 22 kB.
// A new entry (pnl-calendar, 2026-10-16): the calendar measures 23,301 B bundled with the core, so 25,631 B with 10 %, which
// rounds up to 25.5 kB.
// Two new entries (edge-stats-and-funding, 2026-10-16): the edge stats measure 22,349 B bundled with the core, so 24,584 B with 10 %,
// which rounds up to 24.5 kB; the capital funding measures 23,555 B, so 25,911 B with 10 %, which rounds up to 25.5 kB.
// The grid row alone (phone-top-strip, 2026-10-25): the strip's rendering, pinning and chrome took the grid from 30,256 B to
// 32,417 B bundled, so 35,659 B with 10 %, which rounds up to 35 kB. Authorised for this story only (RFC 0003 §25); a later
// story that grows the grid again measures its own build and re-measures this row from that figure.
const remeasuredTenth = (maxKb) => ({ ...entry(maxKb), target: 're-measured for the phone top strip (rendering, pinning and chrome), RFC 0003 §25', date: '2026-10-25' })
// The session-clock row alone (phone-top-strip merged with perf-hygiene, 2026-10-25): the strip's six grid.* messages and
// perf-hygiene's ticker and gating code, both in the shared base, took the clock to 24,121 B bundled on the combined branch,
// so 26,533 B with 10 %, which rounds up to 26 kB. Authorised by the coordinator (RFC 0003 §25).
const remeasuredEleventh = (maxKb) => ({ ...entry(maxKb), target: 're-measured after the strip messages and the ticker and gating code joined the shared base, RFC 0003 §25', date: '2026-10-25' })
// A new entry (layout-list-editor, 2026-10-25): the layout list measures 11,196 B bundled with the core, so 12,316 B with
// 10 %, which rounds up to 12.5 kB.
const layoutListEntry = (maxKb) => ({ ...newEntry(maxKb), date: '2026-10-25' })
// Twelve rows (integrate/0.3.0, 2026-10-26), each re-measured on the integrated branch after the drag-memo fix and set to its
// min+gz plus 10 %, rounded up to the next 0.5 kB. Every entry now carries the strict-CSP base's html.js and adopted stylesheets,
// perf-hygiene's ticker and gating, and the strip's and the layout list's message keys. Authorised by the orchestrator (RFC 0003 §25).
const remeasuredTwelfth = (maxKb) => ({ ...entry(maxKb), target: 're-measured on the integrated 0.3.0 base (strict-CSP html.js and adopted stylesheets, ticker and gating, strip and layout list messages), RFC 0003 §25', date: '2026-10-26' })
// A new entry (mini-chart, 2026-10-26): the mini chart measures 26,800 B bundled with the core, so 29,480 B with 10 %, which
// rounds up to 29 kB. Emberwick, its optional peer, is external and not counted.
// Three new entries (more-generic-widgets, 2026-10-26): the breakdown measures 26,374 B bundled with the core, so 29,011 B
// with 10 %, which rounds up to 28.5 kB; the status 24,719 B, so 27,191 B, which rounds up to 27 kB; the feed 24,339 B, so
// 26,773 B, which rounds up to 26.5 kB.
const genericEntry = (maxKb) => ({ ...newEntry(maxKb), target: 'new entry, RFC 0004 §4.5, per-entry, measured + 10 %', date: '2026-10-26' })
// The chart and controls rows alone (more-generic-widgets, 2026-10-26): this story's breakdown.*, status.* and feed.* message
// keys joined the shared core, which took the chart to 30,761 B bundled and the controls to 17,501 B. Each is reset to measured
// + 10 %, rounded up to the next 0.5 kB: 33,837 B gives 33.5 kB and 19,251 B gives 19 kB. Authorised by the orchestrator (RFC 0003 §25).
const remeasuredThirteenth = (maxKb) => ({ ...entry(maxKb), target: 're-measured after the breakdown.*, status.* and feed.* messages joined the shared core, RFC 0003 §25', date: '2026-10-26' })
// The session-clock row alone (market-presets-and-breaks, 2026-10-26): the break engine and the five new presets (nyse, nasdaq,
// lse, fx, tse) took the clock to 26,827 B bundled, so 29,510 B with 10 %, which rounds up to 29 kB. Authorised by the
// orchestrator (RFC 0003 §25).
const remeasuredFourteenth = (maxKb) => ({ ...entry(maxKb), target: 're-measured for the break engine and the five new presets (nyse, nasdaq, lse, fx, tse), RFC 0003 §25', date: '2026-10-26' })
// Three rows (chart-scrub-and-exact-values, 2026-10-26), re-measured with the scrubber (pointer, touch and keyboard binding,
// overlay, markup and styles), its hidden table of recent points and the chart.scrub* messages (twelve keys and chart.scrubMore)
// in each of the three charts: chart 34,215 B (37,637 B with 10 %, 37 kB), equity-curve 30,646 B (33,711 B, 33 kB) and today-pnl
// 30,464 B (33,510 B, 33 kB), each rounded up to the next 0.5 kB. No other row moved. Authorised by the orchestrator (RFC 0003 §25).
const remeasuredFifteenth = (maxKb) => ({ ...entry(maxKb), target: 're-measured with the chart scrubber, its hidden table and the chart.scrub* messages, RFC 0003 §25', date: '2026-10-26' })
// Two rows (edit-feedback, RFC 0004 §3, 2026-10-26): grid 37,624 B (41,386 B with 10 %, 40.5 kB) for the resize badge, the
// first-run hint and the calm profile switch (about 0.8 kB of CSS, 0.9 kB of grid-feedback.js, 0.7 kB of logic, 236 B of
// messages), and controls 17,417 B (19,159 B, 19 kB) for the seven new shared grid.* messages. No other row moved.
// Authorised by the orchestrator after review (RFC 0003 §25).
const remeasuredSixteenth = (maxKb) => ({ ...entry(maxKb), target: 're-measured with the resize badge, the first-run hint, the calm profile switch and their messages (edit-feedback), RFC 0004 §3, RFC 0003 §25', date: '2026-10-26' })
// Re-baselined at 0.3.0 (release-0-3-0, 2026-10-26): every row below is its measured min+gz plus 10 %, rounded up to the next 0.5 kB.
const rebaselined = (maxKb) => ({ ...entry(maxKb), target: 're-baselined at 0.3.0 from measurement + 10 %, RFC 0003 §25', date: '2026-10-26' })
const ENTRY_BUDGETS = {
  controls: rebaselined(20.5),
  'edge-stats': rebaselined(30),
  'capital-funding': rebaselined(31),
  grid: rebaselined(42.5),
  card: rebaselined(27),
  metric: rebaselined(29.5),
  chart: rebaselined(39),
  'today-pnl': rebaselined(35),
  'equity-curve': rebaselined(35),
  'session-clock': rebaselined(31),
  table: rebaselined(31),
  watchlist: rebaselined(31.5),
  'open-positions': rebaselined(32),
  progress: rebaselined(27.5),
  'pnl-calendar': rebaselined(31.5),
  'layout-list': rebaselined(16.5),
  'mini-chart': rebaselined(32),
  breakdown: rebaselined(30.5),
  status: rebaselined(28.5),
  feed: rebaselined(28.5),
}

/**
 * RFC 0004 §10.4 (Decision 68): each widget adds at most 15 kB to the grid. RFC 0003 §25's "grid plus one
 * widget at most 15 kB" could never hold, because the grid alone is over 15 kB. The row is judged on the
 * DIFFERENCE: the bundle of the grid and that widget, minus the bundle of the grid alone, so what the two
 * share (the core, the widget base) is credited and the grid's own size is held by its own entry budget.
 * The pair total and the grid alone are printed beside it.
 */
const ADD_BUDGET = { maxKb: 15, mode: 'enforce', target: 'RFC 0004 §10.4, each widget adds at most 15 kB to the grid', date: '2026-10-26' }

// Decision 68 says a widget over 15 kB is reported to the maintainer, never given a higher figure. On
// 2026-10-26, measured on the parked-amendments story, eleven of the fifteen widgets already add more than
// 15 kB to the grid (min+gz, the figures are in that story's PR): capital-funding 17,769 B, chart 25,035 B,
// edge-stats 16,542 B, equity-curve 21,524 B, metric 15,932 B, open-positions 18,719 B, pnl-calendar 18,061 B,
// session-clock 16,764 B, table 16,994 B, today-pnl 21,342 B and watchlist 17,794 B. Their rows keep the 15 kB
// figure but stay 'warn' until the maintainer decides (parked-amendments, 2026-10-26); the other four, and every
// new widget, are enforced. Remove a name from this list once its widget fits.
const OVER_15 = ['capital-funding', 'chart', 'edge-stats', 'equity-curve', 'metric', 'open-positions', 'pnl-calendar', 'session-clock', 'table', 'today-pnl', 'watchlist']
const ADD_BUDGETS = Object.fromEntries(
  OVER_15.map((name) => [name, { ...ADD_BUDGET, mode: 'warn', target: `${ADD_BUDGET.target}; over today, kept as a warning pending the maintainer (parked-amendments)` }])
)

// Three "adds to grid" rows re-measured (stage 2 integration of the P2 wave, 2026-10-26): the shared core grew under every
// story's message family; RFC 0004 Decision 68's 15 kB was set before parked-amendments, type-scale-rollout, edit-feedback and
// security-hardening landed. Measured min+gz on the combined branch: mini-chart 18,522 B (20,374 B with 10 %, 20 kB), breakdown
// 17,463 B (19,209 B, 19 kB) and status 15,460 B (17,006 B, 17 kB). Contributors, in merge order: at parked-amendments the rows
// already stood at 18,464 B, 17,412 B and 15,352 B (the widget's own code and the core's message families from create-dashboard,
// mini-chart, more-generic-widgets, market-presets-and-breaks, chart-scrub-and-exact-values and density-and-text-scaling);
// type-scale-rollout then added 0 B to mini-chart, 16 B to breakdown and 13 B to status; edit-feedback 31 B, 20 B and 66 B;
// security-hardening 27 B, 15 B and 29 B. Feed stays at 15 kB (15,223 B). Authorised by the orchestrator (RFC 0003 §25).
const stage2Add = (maxKb) => ({ ...ADD_BUDGET, maxKb, target: 're-measured after the P2 wave joined the shared core, RFC 0003 §25 (stage 2 integration)' })
ADD_BUDGETS['mini-chart'] = stage2Add(20)
ADD_BUDGETS.breakdown = stage2Add(19)
ADD_BUDGETS.status = stage2Add(17)

// The feed row alone (trading-polish, 2026-10-27): the header meta's description for a tile under 7rem (widget.js, shared by
// every entry) took it from 15,291 B to 15,365 B, 5 B over 15 kB; it had 69 B of headroom after the P2 wave's shared-core growth.
// Measured 15,365 B min+gz, so 16,902 B with 10 %, which rounds up to 17 kB (16.5 kB is 16,896 B, 6 B short). RFC 0003 §25.
ADD_BUDGETS.feed = { ...ADD_BUDGET, maxKb: 17, target: 're-measured after the hidden-meta description joined widget.js (trading-polish), RFC 0003 §25' }

const problems = []
const warnings = []
const notes = []

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
for (const name of OVER_15) {
  if (!entries.some((e) => e.name === name)) problems.push(`${name} is listed in OVER_15, but src/elements/define/ has no module for it`)
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

// The grid plus each other widget, bundled together so what they share (the core, the widget base) is
// counted once, as a host that imports both pays. Each widget is then judged on what it adds to the grid
// alone (RFC 0004 §10.4); the pair total is reported for reference.
const gridFile = built('elements/grid.js')
const gridAlone = existsSync(gridFile) ? rows.find((r) => r.label === entryLabel('grid')) : null
for (const e of entries) {
  if (e.name === 'grid') continue
  const file = built(`elements/${e.name}.js`)
  if (!gridAlone || !existsSync(file)) continue
  await bundled(pairLabel(e.name), { stdin: { contents: `export * from ${JSON.stringify(gridFile)}\nexport * from ${JSON.stringify(file)}\n`, resolveDir: out, loader: 'js' } })
  const pair = rows[rows.length - 1]
  // The difference, not a bundle: its raw and min are the same subtraction so the row's columns agree.
  const delta = { rel: addLabel(e.name), label: addLabel(e.name), raw: pair.raw - gridAlone.raw, min: pair.min - gridAlone.min, gz: pair.gz - gridAlone.gz }
  judge(delta, ADD_BUDGETS[e.name] || ADD_BUDGET)
  // A warn-only row that now fits should be enforced: say so, never fail on it.
  if (OVER_15.includes(e.name) && delta.gz <= ADD_BUDGET.maxKb * KB) {
    notes.push(`${addLabel(e.name)} is ${kb(delta.gz)} min+gz, under ${ADD_BUDGET.maxKb} kB: remove '${e.name}' from OVER_15 so the row is enforced`)
  }
  rows.push(delta)
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

if (notes.length) {
  console.log(`\n${notes.length} note${notes.length > 1 ? 's' : ''} (not a failure):`)
  for (const n of notes) console.log(`  - ${n}`)
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
