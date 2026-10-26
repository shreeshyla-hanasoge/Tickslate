// Compact density and the rem type scale (RFC 0004 §2): the tokens in both files, the px floors at every root font size,
// and a scan of the files this story converts. The browser half is test/browser/density.spec.mjs.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { TOKENS_CSS } from '../src/elements/default-tokens.js'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** The custom properties declared by the first rule whose selector is exactly `selector`. */
function block(css, selector) {
  const text = stripComments(css)
  const at = text.indexOf(`${selector} {`)
  assert.ok(at >= 0, `no block ${selector}`)
  const body = text.slice(text.indexOf('{', at) + 1, text.indexOf('}', at))
  return Object.fromEntries([...body.matchAll(/(--ts-[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
}

// The scale, by token: the px size it replaces and its rem value (Decision 75).
const SCALE = {
  '--ts-text-2xs': [9, '.5625rem'],
  '--ts-text-xs': [10, '.625rem'],
  '--ts-text-sm': [11, '.6875rem'],
  '--ts-text-md': [12, '.75rem'],
  '--ts-text-base': [13, '.8125rem'],
  '--ts-text-lg': [14, '.875rem'],
  '--ts-text-xl': [16, '1rem'],
  '--ts-text-2xl': [17, '1.0625rem'],
  '--ts-text-3xl': [26, '1.625rem'],
  '--ts-text-big': [34, '2.125rem'],
  '--ts-text-xbig': [48, '3rem'],
}
const LABEL = 'max(11px, .6875rem)'
const COMPACT = { '--ts-row': '120px', '--ts-pad': '12px', '--ts-gap': '10px' }

/** What a `max(<n>px, <m>rem)` or a plain `<n>px` resolves to at a root font size, in px. */
function resolve(value, root) {
  const m = /^max\((\d+(?:\.\d+)?)px, (\.?\d+(?:\.\d+)?)rem\)$/.exec(value)
  if (m) return Math.max(Number(m[1]), Number(m[2]) * root)
  const px = /^(\d+(?:\.\d+)?)px$/.exec(value)
  assert.ok(px, `not a size: ${value}`)
  return Number(px[1])
}

const tokens = block(read('src/themes/tokens.css'), ':where(:root)')
const defaults = block(TOKENS_CSS, ':where(:root)')
const densityCss = block(read('src/themes/tokens.css'), ':where([data-ts-density="compact"])')
const densityJs = block(TOKENS_CSS, ':where([data-ts-density="compact"])')

describe('the type scale tokens', () => {
  for (const [name, [px, rem]] of Object.entries(SCALE)) {
    test(`${name} is max(${px}px, ${rem}) in both token files`, () => {
      assert.equal(tokens[name], `max(${px}px, ${rem})`)
      assert.equal(defaults[name], tokens[name])
    })
  }

  test('every step is the px size it replaces at a 16px root, so only the label moves (Decision 44)', () => {
    for (const [name, [px]] of Object.entries(SCALE)) assert.equal(resolve(tokens[name], 16), px, name)
    assert.equal(resolve(tokens['--ts-label-size'], 16), 11)
  })

  test('no step is below its px size at a 62.5% root, and each grows with a larger one (Decision 75)', () => {
    for (const [name, [px]] of Object.entries(SCALE)) {
      assert.equal(resolve(tokens[name], 10), px, `${name} at a 10px root`)
      assert.ok(resolve(tokens[name], 20) >= px, `${name} at a 20px root`)
      assert.ok(resolve(tokens[name], 24) > px, `${name} grows at a 24px root`)
    }
  })

  test('--ts-label-size is at least 11px at a 10px, 16px and 20px root, in the defaults and in every preset', () => {
    const sizes = [['tokens.css', tokens['--ts-label-size']], ['default-tokens.js', defaults['--ts-label-size']]]
    for (const preset of ['calm', 'graphite', 'neutral', 'paper', 'signal', 'terminal']) {
      const value = block(read(`src/themes/presets/${preset}.css`), `:where([data-ts-theme='${preset}'])`)['--ts-label-size']
      assert.ok(value, `${preset} sets --ts-label-size`)
      sizes.push([preset, value])
    }
    for (const [where, value] of sizes) {
      for (const root of [10, 16, 20]) assert.ok(resolve(value, root) >= 11, `${where}: ${value} is ${resolve(value, root)}px at a ${root}px root`)
    }
    // Decision 72: terminal, graphite and paper took the token's value, where they had 10px.
    for (const preset of ['terminal', 'graphite', 'paper']) {
      assert.equal(block(read(`src/themes/presets/${preset}.css`), `:where([data-ts-theme='${preset}'])`)['--ts-label-size'], LABEL, preset)
    }
  })

  test('the label is the only text token that is not a scale step: it keeps its own name and value', () => {
    assert.equal(tokens['--ts-label-size'], LABEL)
    assert.equal(defaults['--ts-label-size'], LABEL)
  })
})

describe('the compact density tokens', () => {
  test('are 120px, 12px and 10px under data-ts-density="compact", equal in both token files', () => {
    assert.deepEqual(densityCss, COMPACT)
    assert.deepEqual(densityJs, COMPACT)
  })

  test('come after the theme blocks, so they beat a theme\'s padding on the same element', () => {
    const css = read('src/themes/tokens.css')
    const at = (s) => css.indexOf(s)
    assert.ok(at(':where([data-ts-density="compact"]) {') > at(':where([data-theme="light"]) {'))
    assert.ok(at(':where([data-ts-density="compact"]) {') > at(':where([data-theme="dark"], .dark) {'))
  })

  test('are not a preset\'s to set: the presets yield their padding to density and leave rows, gap and the scale alone', () => {
    for (const preset of ['calm', 'graphite', 'neutral', 'paper', 'signal', 'terminal']) {
      const css = stripComments(read(`src/themes/presets/${preset}.css`))
      // Density is named once, in the block that yields the preset's padding to it (test/presets.test.mjs); no preset sets a density token.
      assert.equal((css.match(/data-ts-density/g) || []).length, 2, preset)
      for (const name of ['--ts-row', '--ts-gap']) assert.ok(!css.includes(name + ':'), `${preset} sets ${name}`)
      for (const name of Object.keys(SCALE)) assert.ok(!css.includes(name), `${preset} sets ${name}`)
    }
  })

  test('<ts-grid> declares the same three values on :host([density="compact"]), and observes the attribute', () => {
    const source = read('src/elements/grid.js')
    const host = /:host\(\[density="compact"\]\) \{ ([^}]*)\}/.exec(source)
    assert.ok(host, 'the grid has a :host([density="compact"]) rule')
    assert.deepEqual(Object.fromEntries([...host[1].matchAll(/(--ts-[\w-]+): ([^;]+);/g)].map((m) => [m[1], m[2]])), COMPACT)
    assert.match(source, /static get observedAttributes\(\) \{\n\s+return \[[^\]]*'density'/)
    // The grid's rule is on :host, so a rule on the element in the page's CSS outranks it; it must not be !important.
    assert.ok(!/density="compact"\]\) \{[^}]*!important/.test(source))
  })
})

// ── The scan: every file that draws text (RFC 0004 §2.3, widened by type-scale-rollout, Decision 73) ───────────────────

// Every element file and the three presets that restate a label size. density-and-text-scaling converted the first
// seven; type-scale-rollout converted the rest, so nothing is left out and a new file is scanned the day it appears.
const ELEMENT_FILES = readdirSync(new URL('../src/elements/', import.meta.url)).filter((name) => name.endsWith('.js')).map((name) => `src/elements/${name}`)
const CONVERTED = [...ELEMENT_FILES, ...readdirSync(new URL('../src/themes/presets/', import.meta.url)).filter((name) => name.endsWith('.css')).map((name) => `src/themes/presets/${name}`)]
// A px size that is allowed to stay, each with its reason. A glyph or icon box is a size, not a text size. The figures
// capped by the tile's width (min(<token>, 15cqi)) are not here: their cap is a token, so no px is left in them.
const ALLOWED = [['calc(8.6cqi - 2px)', 'a 2px offset inside a container-relative size, not a text size']]

const TOKEN = /^--ts-(?:text-\w+|label-size)$/

/**
 * Source with every var(...) of a type token reduced to var(), because that fallback is the token's own value and the
 * fallback test below holds it to that. Any other var(--x, <fallback>) keeps its fallback in the text, so a size hidden
 * in one is found. Balanced to any depth.
 */
function withoutVars(text) {
  let out = ''
  for (let i = 0; i < text.length; ) {
    if (text.startsWith('var(', i)) {
      let depth = 0
      let j = i + 3
      do {
        if (text[j] === '(') depth++
        else if (text[j] === ')') depth--
        j++
      } while (depth > 0 && j < text.length)
      const inner = text.slice(i + 4, j - 1)
      const comma = inner.indexOf(',')
      const name = (comma < 0 ? inner : inner.slice(0, comma)).trim()
      out += TOKEN.test(name) || comma < 0 ? 'var()' : `var(${withoutVars(inner.slice(comma + 1))})`
      i = j
    } else out += text[i++]
  }
  return out
}

/**
 * Every font size a source draws in an absolute unit, as the text of its declaration. It finds `font-size` and the
 * `font` shorthand in a stylesheet, in an inline `style="…"` or `style='…'`, in a `cssText = "…"` string and in a
 * `fontSize` property, in any case (CSS keywords are not case sensitive), and an unnamed-unit `font-size="11"` SVG
 * attribute, which is px.
 */
function fontSizeProblems(source) {
  const text = withoutVars(stripComments(source))
  const found = []
  for (const m of text.matchAll(/(?:^|[\s;{"'`])(font-size|font)\s*:\s*([^;}`"']*)/gi)) if (/\b\d*\.?\d+(?:px|pt|pc)\b/i.test(m[2])) found.push(`${m[1]}: ${m[2].trim()}`)
  for (const m of text.matchAll(/\bfontSize\s*[:=]\s*([^;,}\n]*)/gi)) if (/\b\d*\.?\d+(?:px|pt|pc)\b/i.test(m[1])) found.push(`fontSize: ${m[1].trim()}`)
  for (const m of text.matchAll(/\bfont-size\s*=\s*["']?\s*(\d*\.?\d+)(?:px|pt)?\b/gi)) found.push(`font-size="${m[1]}"`)
  return found
}

describe('the scan of every element file and preset', () => {
  for (const path of CONVERTED) {
    test(`${path} declares no font size in px`, () => {
      const found = fontSizeProblems(read(path))
      const unexplained = found.filter((f) => !ALLOWED.some(([text]) => f.includes(text)))
      assert.deepEqual(unexplained, [], `${path} has a px font size: use a --ts-text-* token (or --ts-label-size)`)
    })

    test(`${path} has no 10px label fallback`, () => {
      assert.ok(!/var\(--ts-label-size,\s*10px\)/.test(read(path)), path)
    })
  }

  // The scan is only worth its name if it fails on each way a px size can be written. Each form is planted in a scratch
  // copy of a real element's source (nothing on disk changes) and must be found; the forms the files may use must not be.
  const PLANTED = {
    'a declaration in a stylesheet': '.x { font-size: 11px; }',
    'a stylesheet declaration in capitals': '.x { FONT-SIZE: 11PX; }',
    'the font shorthand': '.x { font: 500 12px/1 sans-serif; }',
    'an !important size': '.x { font-size: 11px!important; }',
    'a size inside calc': '.x { font-size: calc(var(--a) + 11px); }',
    'an inline style in double quotes': 'const a = `<span style="font-size:11px">x</span>`',
    'an inline style in single quotes': "const a = `<span style='font-size:11px'>x</span>`",
    'a cssText string in double quotes': 'el.style.cssText = "font-size:11px"',
    'a cssText string in single quotes': "el.style.cssText = 'font-size:11px'",
    'a var() whose fallback is not a token': '.x { font-size: var(--foo, 11px); }',
    'a var() nested in a var() fallback': '.x { font-size: var(--foo, var(--bar, 11px)); }',
    'a fontSize property': "el.style.fontSize = '11px'",
    'a fontSize key': "Object.assign(el.style, { fontSize: '11px' })",
    'a point size': '.x { font-size: 9pt; }',
    'an SVG attribute with no unit': '<text font-size="11">x</text>',
  }
  const ALLOWED_FORMS = {
    'a type token with its own fallback': '.x { font-size: var(--ts-text-sm, max(11px, .6875rem)); }',
    'the label token': '.x { font: 600 var(--ts-label-size, max(11px, .6875rem)) / 1 sans-serif; }',
    'a cap that is a token': '.x { font-size: min(var(--ts-text-big, max(34px, 2.125rem)), 15cqi); }',
    'a relative size': '.x { font-size: .7em; }',
    'a px that is not a size': '.x { width: var(--foo, 11px); margin: 11px; }',
    'a comment': '/* font-size: 11px */ .x { color: red; }',
  }
  for (const [form, planted] of Object.entries(PLANTED)) {
    test(`the scan fails on ${form}`, () => {
      assert.deepEqual(fontSizeProblems('const a = 1'), [])
      const scratch = `${read('src/elements/card.js')}\n${planted}\n`
      assert.ok(fontSizeProblems(scratch).length > 0, `not found: ${planted}`)
    })
  }
  for (const [form, allowed] of Object.entries(ALLOWED_FORMS)) {
    test(`the scan lets ${form} through`, () => {
      assert.deepEqual(fontSizeProblems(allowed), [])
    })
  }

  test('every --ts-text-* fallback in the converted files is that token\'s own value, so a host without the tokens sees the same size', () => {
    for (const path of CONVERTED) {
      for (const m of read(path).matchAll(/var\((--ts-(?:text-[\w]+|label-size)),\s*(max\([^)]*\))\)/g)) {
        const expected = m[1] === '--ts-label-size' ? LABEL : tokens[m[1]]
        assert.equal(m[2], expected, `${path}: the fallback of ${m[1]}`)
      }
    }
  })

  test('the inventory: every size the files use maps to a token, and each file reads the tokens it should', () => {
    const used = (path) => new Set([...read(path).matchAll(/var\((--ts-(?:text-\w+|label-size))\b/g)].map((m) => m[1]))
    // The file, then the tokens it reads: the px sizes it drew before, by the table of RFC 0004 §2.3.
    const INVENTORY = {
      'widget.js': ['--ts-label-size', '--ts-text-2xl', '--ts-text-base', '--ts-text-big', '--ts-text-md', '--ts-text-sm', '--ts-text-xbig', '--ts-text-xs'],
      'grid.js': ['--ts-text-base', '--ts-text-lg', '--ts-text-xl', '--ts-text-xs'],
      'today-pnl.js': ['--ts-text-big', '--ts-text-xbig'],
      'equity-curve.js': ['--ts-text-3xl', '--ts-text-big', '--ts-text-md'],
      'card.js': ['--ts-text-big', '--ts-text-sm'],
      'metric.js': ['--ts-text-md'],
      'series-chart.js': ['--ts-text-sm', '--ts-text-xs'],
      'table.js': ['--ts-label-size', '--ts-text-md'],
      'watchlist.js': ['--ts-text-base', '--ts-text-md', '--ts-text-sm', '--ts-text-xl', '--ts-text-xs'],
      'open-positions.js': ['--ts-text-base', '--ts-text-md', '--ts-text-xs'],
      'pnl-calendar.js': ['--ts-text-2xl', '--ts-text-2xs', '--ts-text-md'],
      'edge-stats.js': ['--ts-text-2xs', '--ts-text-big', '--ts-text-sm'],
      // 15px snapped to 16px (the one visible change of the rollout, RFC 0004 §2.3).
      'capital-funding.js': ['--ts-text-base', '--ts-text-big', '--ts-text-md', '--ts-text-sm', '--ts-text-xl', '--ts-text-xs'],
      'progress.js': ['--ts-text-3xl'],
      'picker.js': ['--ts-label-size', '--ts-text-2xl', '--ts-text-base', '--ts-text-lg', '--ts-text-xl'],
      'grid-controls.js': ['--ts-text-base'],
      // Not in the RFC's list of twelve: the layout list and the scrub read-out drew px too, so the widened scan covers them.
      'layout-list.js': ['--ts-text-base', '--ts-text-lg'],
      'scrub.js': ['--ts-text-sm'],
      // Added by more-generic-widgets, which merged after the widened scan was written; the one 15px (breakdown's share) snaps to 16px like capital funding's.
      'breakdown.js': ['--ts-text-base', '--ts-text-md', '--ts-text-xl'],
      'status.js': ['--ts-text-3xl', '--ts-text-base', '--ts-text-sm', '--ts-text-xs'],
      'feed.js': ['--ts-text-base', '--ts-text-md', '--ts-text-sm', '--ts-text-xs'],
    }
    for (const [name, tokensRead] of Object.entries(INVENTORY)) assert.deepEqual([...used(`src/elements/${name}`)].sort(), tokensRead, name)
    // A file that is not in the table draws no text size of its own: it reads no token.
    for (const path of ELEMENT_FILES) if (!INVENTORY[path.replace('src/elements/', '')]) assert.deepEqual([...used(path)], [], path)
    // The token names read are all defined.
    for (const path of CONVERTED) for (const name of used(path)) assert.ok(name in tokens, `${path} reads ${name}, which tokens.css does not define`)
  })

  test('a figure capped by the tile\'s width takes its cap from a token: min(var(--ts-text-*), <n>cqi)', () => {
    for (const path of ELEMENT_FILES) {
      for (const m of read(path).matchAll(/font-size:\s*min\(([^;]*?),\s*(?:calc\([^;]*\)|[\d.]+cqi)\)\s*;/g)) {
        assert.match(m[1], /^var\(--ts-text-\w+, max\(\d+px, [\d.]+rem\)\)$/, `${path}: ${m[0]}`)
      }
    }
  })

  test('every widget in the widened scan resolves its text at a 62.5% root to the size it drew before (the px floors)', () => {
    // Each fallback is max(<px>, <rem>): at a 10px root the rem part is smaller, so the px size wins everywhere.
    for (const path of ELEMENT_FILES) {
      for (const m of read(path).matchAll(/var\(--ts-(?:text-\w+|label-size),\s*(max\([^)]*\))\)/g)) {
        assert.ok(resolve(m[1], 10) >= 9, `${path}: ${m[1]}`)
        assert.equal(resolve(m[1], 10), resolve(m[1], 16) , `${path}: ${m[1]} shrinks with the root`)
      }
    }
  })
})

describe('tiles are size containers (RFC 0004 §2.2)', () => {
  test('the tile is container: ts-tile / size, and the tiers are named for it, snug at 6.5rem and tight at 5rem', async () => {
    const { SHARED_CSS } = await import('../src/elements/widget.js')
    assert.match(SHARED_CSS, /\.tile \{[^}]*container: ts-tile \/ size;/)
    assert.match(SHARED_CSS, /@container ts-tile \(max-height: 6\.5rem\) \{ \.sec, \.tile > \.f1 \{ display: none; \} \}/)
    assert.match(SHARED_CSS, /@container ts-tile \(max-height: 5rem\) \{ \.ter \{ display: none; \} \}/)
    // Unnamed width queries keep matching the tile.
    assert.match(SHARED_CSS, /@container \(max-width: 200px\) \{ \.pre \{ display: none; \} \}/)
  })

  test('the thresholds leave every default tile whole: a comfortable content box is 7rem or more, a compact one is snug but not tight', () => {
    const content = (row, pad) => row - 2 * pad - 2
    const rem = (px, root = 16) => px / root
    const snug = 6.5
    const tight = 5
    for (const [name, px] of [['comfortable, light', content(150, 18)], ['comfortable, dark', content(150, 16)], ['phone, compact density', content(150, 12)]]) {
      assert.ok(rem(px) > snug, `${name} (${px}px) is not snug`)
    }
    const compact = content(120, 12)
    assert.equal(compact, 94)
    assert.ok(rem(compact) <= snug && rem(compact) > tight, 'compact is snug and not tight')
    // At a 20px root the same tiles are shorter in rem: compact is tight, comfortable is snug.
    assert.ok(rem(compact, 20) <= tight)
    assert.ok(rem(content(150, 18), 20) <= snug && rem(content(150, 18), 20) > tight)
  })

  test('every built-in widget marks the row under its headline, so a snug tile gives it up (type-scale-rollout)', async () => {
    const tag = async (file, name) => (await import(`../src/elements/${file}.js`))[name]
    const metric = await tag('metric', 'TsMetric')
    for (const size of ['S', 'Wide', 'M']) assert.match(metric.template(size), /class="delta sec"/, `metric ${size}`)
    const clock = await tag('session-clock', 'TsSessionClock')
    assert.match(clock.template('S'), /class="row xs mut ft sec"/)
    const edge = await tag('edge-stats', 'TsEdgeStats')
    assert.match(edge.template('S'), /class="n sm sub sec" data-k="s0"/)
    // The trade count and scope under the Wide's four stats were cut at plain compact density when only S marked its row.
    assert.match(edge.template('Wide'), /class="sm mut ell wn sec" data-k="note"/)
    assert.doesNotMatch(edge.template('M'), /class="[^"]*\bsec\b/)
    const funding = await tag('capital-funding', 'TsCapitalFunding')
    assert.match(funding.template('S'), /class="sm n ell st sec" data-k="status"/)
    const progress = await tag('progress', 'TsProgress')
    assert.match(progress.template('S'), /class="sm nv mut wrapt sec"/)
    assert.match(progress.template('Wide'), /class="rowb sec"/)
    const calendar = await tag('pnl-calendar', 'TsPnlCalendar')
    assert.match(calendar.template('Banner'), /class="col cell sec"/)
    // A Banner stacked under 700px on a 150px row also drops the Best and Worst, so the year gets room.
    assert.match(calendar.styles, /@container ts-tile \(max-width: 699px\) and \(max-height: 8\.5rem\) \{ \.body\.banner \.sum \.sec, \.body\.banner \.sp, \.body\.banner \.wl \{ display: none; \} \}/)
  })

  test('a widget\'s own display does not outrank the shared snug rule: a row marked .sec that sets display restates the tier', async () => {
    const { TsMetric } = await import('../src/elements/metric.js')
    assert.match(TsMetric.styles, /@container ts-tile \(max-height: 6\.5rem\) \{ \.delta\.sec \{ display: none; \} \}/)
  })

  test('today\'s P&L and the equity curve mark their secondary rows', async () => {
    const pnl = await import('../src/elements/today-pnl.js')
    const equity = await import('../src/elements/equity-curve.js')
    assert.match(pnl.TsTodayPnl.template('S'), /class="sm mut ell sec" data-k="footer"/)
    assert.match(pnl.TsTodayPnl.template('Wide'), /class="sm mut sec" data-k="note"/)
    assert.match(pnl.TsTodayPnl.template('M'), /class="axis sm mut n ter"/)
    assert.match(equity.TsEquityCurve.template('Wide'), /class="sm mut sec" data-k="peakNote"/)
    assert.match(equity.TsEquityCurve.template('XL'), /class="row sm mut ax ter"/)
  })
})
