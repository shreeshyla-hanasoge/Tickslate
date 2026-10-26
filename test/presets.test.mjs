// Theme presets (RFC 0003 §13.1): each file in src/themes/presets/ is scoped by
// data-ts-theme, sets only --ts-* tokens, keeps the tokens a palette owns in a
// guarded block, and meets the contrast floors of RFC 0002 §6.6 in every mode it
// has. The files are read as text, so this runs under `node --test` with no DOM.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const read = (path) => stripComments(readFileSync(new URL(path, import.meta.url), 'utf8'))

const NAMES = ['calm', 'graphite', 'neutral', 'paper', 'signal', 'terminal']
// paper and graphite are one-mode: choosing the preset chooses the mode (RFC 0003 §29, point 20).
const ONE_MODE = ['paper', 'graphite']
// Declared in the guarded block, so a palette on the same element wins (Decision 35).
const OWNED = ['--ts-profit', '--ts-loss', '--ts-accent', '--ts-focus', ...[1, 2, 3, 4, 5, 6].map((n) => `--ts-series-${n}`)]
// The host's, not a theme's: grid metrics and motion.
const NOT_THEMED = ['--ts-row', '--ts-gap', '--ts-grid-max-width', '--ts-row-compact', '--ts-gap-compact', '--ts-strip-top', '--ts-motion', '--ts-ease']
const GUARD = ':not([data-ts-palette])'

/**
 * Every rule in a stylesheet as { media, selector, vars }, looking one level
 * into @media. Whitespace in the selector is collapsed, so a selector list
 * wrapped over several lines compares equal to one written on a line.
 */
function parse(css, media = null) {
  const out = []
  let i = 0
  while (i < css.length) {
    const open = css.indexOf('{', i)
    if (open < 0) break
    const prelude = css.slice(i, open).trim().replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')')
    let depth = 1
    let j = open + 1
    while (depth && j < css.length) {
      if (css[j] === '{') depth++
      else if (css[j] === '}') depth--
      j++
    }
    const body = css.slice(open + 1, j - 1)
    if (prelude.startsWith('@media')) out.push(...parse(body, prelude))
    else {
      const vars = {}
      const props = []
      // The last declaration of a block may leave out its semicolon.
      for (const m of body.matchAll(/([\w-]+)\s*:\s*([^;}]+?)\s*(?:;|$)/g)) {
        props.push(m[1])
        vars[m[1]] = m[2]
      }
      out.push({ media, selector: prelude, vars, props })
    }
    i = j
  }
  return out
}

const tokens = parse(read('../src/themes/tokens.css'))
const ruleOf = (selector) => {
  const rule = tokens.find((r) => r.selector === selector)
  assert.ok(rule, `tokens.css has no block ${selector}`)
  return rule.vars
}
const defaultLight = ruleOf(':where(:root)')
const defaultDark = ruleOf(':where([data-theme="dark"], .dark)')

const files = readdirSync(new URL('../src/themes/presets/', import.meta.url)).filter((n) => n.endsWith('.css')).sort()

const LIGHT = "[data-theme='light']"
const DARK_ANCESTOR = `:is([data-theme='dark'], .dark):not(${LIGHT})`
const AUTO_ANCESTOR = `[data-theme='auto']:not(${LIGHT})`

/**
 * The blocks a preset file must declare, in order, and nothing else. The mode
 * follows the island rule of tokens.css (the nearest dark or light element
 * decides): the element's own data-theme, a dark ancestor with no light island
 * above the element, and a dark ancestor inside one light island. A stray or a
 * missing block fails the comparison in load().
 */
function expectedRules(name, oneMode) {
  const el = `[data-ts-theme='${name}']`
  const where = (alternatives, suffix) => `:where(${alternatives.map((a) => a + suffix).join(', ')})`
  const modeAlternatives = (ancestor, own) => [
    `${ancestor} ${el}:not(${LIGHT}):not(${LIGHT} *)`,
    `${LIGHT} ${ancestor} ${el}:not(${LIGHT})`,
    `${el}${own}:not(${LIGHT})`,
  ]
  const rules = [
    { kind: 'base', guarded: false, media: null, selector: `:where(${el})` },
    { kind: 'base', guarded: true, media: null, selector: `:where(${el}${GUARD})` },
  ]
  if (oneMode) return rules
  const dark = modeAlternatives(DARK_ANCESTOR, ":is([data-theme='dark'], .dark)")
  const auto = modeAlternatives(AUTO_ANCESTOR, "[data-theme='auto']")
  for (const guarded of [false, true]) rules.push({ kind: 'dark', guarded, media: null, selector: where(dark, guarded ? GUARD : '') })
  for (const guarded of [false, true]) {
    rules.push({ kind: 'auto', guarded, media: '@media (prefers-color-scheme: dark)', selector: where(auto, guarded ? GUARD : '') })
  }
  return rules
}

/** The rules of one preset, matched one for one against what it must declare. */
function load(name) {
  const rules = parse(read(`../src/themes/presets/${name}.css`))
  const expected = expectedRules(name, ONE_MODE.includes(name))
  assert.deepEqual(
    rules.map((r) => ({ media: r.media, selector: r.selector })),
    expected.map((e) => ({ media: e.media, selector: e.selector })),
    `${name}.css declares other blocks than the expected ones`,
  )
  const tagged = rules.map((r, i) => ({ ...r, kind: expected[i].kind, guarded: expected[i].guarded }))
  const of = (kind, guarded) => tagged.filter((r) => r.kind === kind && r.guarded === guarded)
  const merge = (list) => Object.assign({}, ...list.map((r) => r.vars))
  const plain = of('base', false)
  const guarded = of('base', true)
  const darkOnly = tagged.filter((r) => r.kind === 'dark')
  const darkAuto = tagged.filter((r) => r.kind === 'auto')
  const light = { ...merge(plain), ...merge(guarded) }
  return { rules: tagged, plain, guarded, darkRules: [...darkOnly, ...darkAuto], darkOnly, darkAuto, light, dark: { ...light, ...merge(darkOnly) }, darkVars: merge(darkOnly), autoVars: merge(darkAuto) }
}

// ------------------------------------------------------------- the contrast helper, copied from tokens.test.mjs

function hexToRgb(hex) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex)
  assert.ok(m, `not a hex colour: ${hex}`)
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}

function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** A token's colour, following var(--ts-x) once (--ts-focus is the accent). */
function colour(theme, name) {
  let v = theme[name]
  const ref = v && v.match(/^var\((--ts-[\w-]+)\)$/)
  if (ref) v = theme[ref[1]]
  return v
}

test('the contrast helper matches the WCAG reference values', () => {
  assert.equal(contrast('#000000', '#FFFFFF').toFixed(2), '21.00')
  assert.equal(contrast('#777', '#FFF').toFixed(2), '4.48')
})

// --------------------------------------------------------------------- the files

test('there is one file per preset, and no other', () => {
  assert.deepEqual(files, NAMES.map((n) => `${n}.css`))
})

for (const name of NAMES) {
  const p = load(name)
  const oneMode = ONE_MODE.includes(name)

  describe(`${name}: scope`, () => {
    // load() already compares the selectors with expectedRules() and throws on any
    // difference, so a stray block, a missing one or a changed alternative fails the file.
    test('declares exactly the expected blocks: the preset, its palette-guarded twin, and the dark ones', () => {
      assert.deepEqual(
        p.rules.map((r) => [r.media, r.selector]),
        expectedRules(name, oneMode).map((r) => [r.media, r.selector]),
      )
      assert.equal(p.plain.length, 1)
      assert.equal(p.guarded.length, 1)
      assert.ok(p.rules.indexOf(p.plain[0]) < p.rules.indexOf(p.guarded[0]), 'the guarded block comes after the plain one')
    })

    test('every selector is one :where(), so it has zero specificity', () => {
      for (const r of p.rules) {
        assert.ok(r.selector.startsWith(':where(') && r.selector.endsWith(')'), `${r.selector} is not wrapped in :where()`)
        // One :where() only: the closing bracket of the first is the last character.
        let depth = 0
        for (let i = 0; i < r.selector.length; i++) {
          if (r.selector[i] === '(') depth++
          if (r.selector[i] === ')' && --depth === 0) assert.equal(i, r.selector.length - 1, `${r.selector} has more than one top-level group`)
        }
      }
    })

    test('uses only --ts-* custom properties', () => {
      for (const r of p.rules) {
        assert.ok(r.props.length, `${r.selector} declares nothing`)
        for (const prop of r.props) assert.match(prop, /^--ts-[\w-]+$/, `${r.selector} sets ${prop}`)
      }
    })

    test('hard-codes colour only as a hex value or a var() of another token', () => {
      for (const r of p.rules) {
        for (const [prop, value] of Object.entries(r.vars)) {
          if (!/^--ts-(bg|surface|surface-2|line|ink|muted|profit|loss|warn|accent|axis|series-\d|focus)$/.test(prop)) continue
          assert.match(value, /^(#[0-9a-f]{6}|var\(--ts-[\w-]+\))$/i, `${prop}: ${value}`)
        }
      }
    })

    test('leaves the host\'s grid metrics and motion alone', () => {
      for (const r of p.rules) for (const prop of NOT_THEMED) assert.ok(!(prop in r.vars), `${r.selector} sets ${prop}`)
    })

    test('keeps the tokens a palette owns out of every unguarded block, and only those in the guarded ones', () => {
      for (const r of p.rules.filter((x) => !x.guarded)) {
        for (const prop of OWNED) assert.ok(!(prop in r.vars), `${r.selector} sets ${prop}, which a palette owns`)
      }
      for (const r of p.rules.filter((x) => x.guarded)) {
        assert.ok(r.props.length)
        for (const prop of r.props) assert.ok(OWNED.includes(prop), `${prop} is guarded in ${name} but a palette does not own it`)
      }
    })

    test('guards every alternative of a guarded block, not just the last', () => {
      for (const r of p.rules.filter((x) => x.guarded)) {
        const expectedSelector = expectedRules(name, oneMode).find((e) => e.selector === r.selector)
        assert.ok(expectedSelector.guarded)
        // Every top-level alternative of the :where() list ends with the guard.
        const inner = r.selector.slice(':where('.length, -1)
        let depth = 0
        let start = 0
        const alternatives = []
        for (let i = 0; i <= inner.length; i++) {
          if (inner[i] === '(' || inner[i] === '[') depth++
          if (inner[i] === ')' || inner[i] === ']') depth--
          if (i === inner.length || (inner[i] === ',' && depth === 0)) {
            alternatives.push(inner.slice(start, i).trim())
            start = i + 1
          }
        }
        for (const alt of alternatives) assert.ok(alt.endsWith(GUARD), `${alt} is missing ${GUARD}`)
      }
    })

    test('restates --ts-focus beside the accent, since var() resolves where it is declared', () => {
      for (const r of p.rules.filter((x) => '--ts-accent' in x.vars)) assert.equal(r.vars['--ts-focus'], 'var(--ts-accent)')
    })
  })

  describe(`${name}: modes`, () => {
    if (oneMode) {
      test('is one-mode: it has no dark rules and never reads data-theme', () => {
        assert.equal(p.darkRules.length, 0)
        assert.ok(!p.rules.some((r) => r.media || r.selector.includes('data-theme') || r.selector.includes('.dark')))
      })
    } else {
      test('has a dark mode: the expected dark and data-theme="auto" blocks, the latter only in prefers-color-scheme: dark', () => {
        assert.equal(p.darkOnly.length, 2, 'a dark block and its guarded twin')
        assert.equal(p.darkAuto.length, 2, 'an auto block and its guarded twin')
        for (const r of p.darkAuto) assert.equal(r.media, '@media (prefers-color-scheme: dark)')
        for (const r of p.darkOnly) assert.equal(r.media, null)
      })

      test('the data-theme="auto" blocks declare the same values as the dark blocks', () => {
        assert.deepEqual(p.autoVars, p.darkVars)
      })

      test('dark colours differ from the light ones', () => {
        for (const prop of ['--ts-bg', '--ts-surface', '--ts-ink']) assert.notEqual(p.dark[prop], p.light[prop], prop)
        assert.ok(luminance(p.dark['--ts-bg']) < luminance(p.light['--ts-bg']), 'the dark page is darker than the light one')
      })
    }

    test('defines every themed token in its base mode, so it does not inherit a host\'s mode', () => {
      for (const prop of Object.keys(defaultLight)) {
        if (NOT_THEMED.includes(prop)) continue
        assert.ok(prop in p.light, `${name} does not set ${prop}`)
      }
    })

    test('defines every colour in dark mode too', () => {
      for (const prop of ['--ts-bg', '--ts-surface', '--ts-surface-2', '--ts-line', '--ts-ink', '--ts-muted', '--ts-profit', '--ts-loss', '--ts-warn', '--ts-accent', '--ts-axis', ...[1, 2, 3, 4, 5, 6].map((n) => `--ts-series-${n}`)]) {
        assert.match(colour(p.dark, prop), /^#[0-9a-f]{6}$/i, prop)
      }
    })

    test('has six different series colours in each mode', () => {
      for (const theme of oneMode ? [p.light] : [p.light, p.dark]) {
        const series = [1, 2, 3, 4, 5, 6].map((n) => theme[`--ts-series-${n}`].toLowerCase())
        assert.equal(new Set(series).size, 6)
      }
    })

    test('headline figures follow the figure weight unless it is set on purpose', () => {
      for (const theme of oneMode ? [p.light] : [p.light, p.dark]) assert.equal(theme['--ts-headline-weight'], 'var(--ts-num-weight)')
    })
  })

  // RFC 0002 §6.6, the same floors as test/tokens.test.mjs.
  const modes = oneMode ? [[`${name}`, p.light]] : [[`${name} light`, p.light], [`${name} dark`, p.dark]]
  for (const [label, theme] of modes) {
    describe(`${label}: contrast floors`, () => {
      const on = (fg, bg, floor) => {
        const ratio = contrast(colour(theme, fg), colour(theme, bg))
        assert.ok(ratio >= floor, `${fg} on ${bg} is ${ratio.toFixed(2)}:1, needs ${floor}:1`)
      }
      // Warn text only renders on the surface, so it is not asserted on --ts-bg.
      for (const token of ['--ts-ink', '--ts-muted', '--ts-profit', '--ts-loss', '--ts-warn', '--ts-accent']) {
        test(`${token} reaches 4.5:1 on --ts-surface`, () => on(token, '--ts-surface', 4.5))
      }
      for (const token of ['--ts-ink', '--ts-muted']) {
        test(`${token} reaches 4.5:1 on --ts-bg`, () => on(token, '--ts-bg', 4.5))
      }
      test('--ts-ink reaches 4.5:1 on --ts-surface-2', () => on('--ts-ink', '--ts-surface-2', 4.5))
      for (const token of ['--ts-axis', '--ts-focus']) {
        test(`${token} reaches 3:1 on --ts-surface`, () => on(token, '--ts-surface', 3))
      }
      for (let n = 1; n <= 6; n++) {
        test(`--ts-series-${n} reaches 3:1 on --ts-surface`, () => on(`--ts-series-${n}`, '--ts-surface', 3))
      }
    })
  }
}

// ------------------------------------------- paper and graphite restate the defaults

describe('paper and graphite restate the default tokens', () => {
  test('paper equals the light defaults of tokens.css, token for token', () => {
    const { light } = load('paper')
    for (const [prop, value] of Object.entries(light)) assert.equal(value, defaultLight[prop], `paper ${prop}`)
    // And it restates every one that matters, so a dark host page cannot leak through.
    for (const prop of Object.keys(defaultLight)) if (!NOT_THEMED.includes(prop)) assert.ok(prop in light, `paper omits ${prop}`)
  })

  test('graphite equals the light defaults with the dark block of tokens.css over them', () => {
    const { light } = load('graphite')
    const expected = { ...defaultLight, ...defaultDark }
    for (const [prop, value] of Object.entries(light)) assert.equal(value, expected[prop], `graphite ${prop}`)
    for (const prop of Object.keys(expected)) if (!NOT_THEMED.includes(prop)) assert.ok(prop in light, `graphite omits ${prop}`)
  })
})

// ------------------------------------------------------- neutral is a system-font design

describe('neutral', () => {
  const { light, dark } = load('neutral')
  test('uses system-ui for both faces, in both modes, and names no web font', () => {
    for (const theme of [light, dark]) {
      for (const prop of ['--ts-font-ui', '--ts-font-num']) {
        assert.match(theme[prop], /^system-ui,/, prop)
        assert.ok(!/Geist|Newsreader|Inter|Georgia/.test(theme[prop]), `${prop} names a font Tickslate does not ship`)
      }
    }
  })
  test('has white surfaces in light mode and a zinc scale', () => {
    assert.equal(light['--ts-surface'].toLowerCase(), '#ffffff')
    assert.equal(light['--ts-ink'].toLowerCase(), '#18181b')
    assert.equal(dark['--ts-surface'].toLowerCase(), '#18181b')
  })
})

// A preset may name a face Tickslate does not ship, but never as the only choice.
describe('fonts degrade to system fonts', () => {
  for (const name of NAMES) {
    test(`${name}: every font stack ends in a generic family`, () => {
      const { light } = load(name)
      for (const prop of ['--ts-font-ui', '--ts-font-num']) {
        assert.match(light[prop], /(sans-serif|monospace)$/, `${name} ${prop}`)
        assert.ok(/system-ui|ui-monospace|ui-sans-serif/.test(light[prop]), `${name} ${prop} has no system face`)
      }
    })
  }
})
