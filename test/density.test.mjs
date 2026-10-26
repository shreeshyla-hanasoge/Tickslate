// Compact density and the rem type scale (RFC 0004 §2): the tokens in both files, the px floors at every root font size,
// and a scan of the files this story converts. The browser half is test/browser/density.spec.mjs.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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

  test('are not a preset\'s to set: the presets leave rows, padding\'s density and the scale alone', () => {
    for (const preset of ['calm', 'graphite', 'neutral', 'paper', 'signal', 'terminal']) {
      const css = read(`src/themes/presets/${preset}.css`)
      assert.ok(!css.includes('data-ts-density'), preset)
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

// ── The scan: the converted files only (RFC 0004 §2.3) ──────────────────────────────────────────────────────────────

// What this story converts. The follow-up that converts the rest widens this list, and nothing else.
const CONVERTED = [
  'src/elements/widget.js',
  'src/elements/grid.js',
  'src/elements/today-pnl.js',
  'src/elements/equity-curve.js',
  'src/themes/presets/terminal.css',
  'src/themes/presets/graphite.css',
  'src/themes/presets/paper.css',
]
// A px size that is allowed to stay, each with its reason. A glyph or icon box is a size, not a text size.
const ALLOWED = [['calc(8.6cqi - 2px)', 'a 2px offset inside a container-relative size, not a text size']]

/** Source with every var(...) group removed (a fallback is not a declaration), balanced to any depth. */
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
      out += 'var()'
      i = j
    } else out += text[i++]
  }
  return out
}

describe('the scan of the converted files', () => {
  for (const path of CONVERTED) {
    test(`${path} declares no font size in px`, () => {
      const source = withoutVars(stripComments(read(path)))
      const found = []
      // font-size: … and the font shorthand, up to the end of the declaration.
      for (const m of source.matchAll(/(?:^|[\s;{])(font-size|font)\s*:\s*([^;}`]*)/g)) if (/\b\d+(\.\d+)?px\b/.test(m[2])) found.push(`${m[1]}: ${m[2].trim()}`)
      const unexplained = found.filter((f) => !ALLOWED.some(([text]) => f.includes(text)))
      assert.deepEqual(unexplained, [], `${path} has a px font size: use a --ts-text-* token (or --ts-label-size)`)
    })

    test(`${path} has no 10px label fallback`, () => {
      assert.ok(!/var\(--ts-label-size,\s*10px\)/.test(read(path)), path)
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

  test('the inventory: every size the converted files use maps to a token, and the files read the tokens they should', () => {
    const used = (path) => new Set([...read(path).matchAll(/var\((--ts-(?:text-\w+|label-size))\b/g)].map((m) => m[1]))
    assert.deepEqual([...used('src/elements/grid.js')].sort(), ['--ts-text-base', '--ts-text-lg', '--ts-text-xl', '--ts-text-xs'])
    assert.deepEqual([...used('src/elements/today-pnl.js')].sort(), ['--ts-text-big', '--ts-text-xbig'])
    assert.deepEqual([...used('src/elements/equity-curve.js')].sort(), ['--ts-text-3xl', '--ts-text-big', '--ts-text-md'])
    assert.deepEqual([...used('src/elements/widget.js')].sort(), ['--ts-label-size', '--ts-text-2xl', '--ts-text-base', '--ts-text-big', '--ts-text-md', '--ts-text-sm', '--ts-text-xbig', '--ts-text-xs'])
    // The token names read are all defined.
    for (const path of CONVERTED) for (const name of used(path)) assert.ok(name in tokens, `${path} reads ${name}, which tokens.css does not define`)
  })

  test('the files left for type-scale-rollout are untouched: they still draw px', () => {
    for (const path of ['capital-funding', 'watchlist', 'open-positions', 'pnl-calendar', 'edge-stats', 'progress', 'card', 'metric', 'series-chart', 'table', 'picker', 'grid-controls']) {
      assert.ok(!/--ts-text-/.test(read(`src/elements/${path}.js`)), `${path}.js belongs to the follow-up`)
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
