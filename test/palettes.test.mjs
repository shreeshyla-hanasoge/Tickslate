// Palettes (RFC 0003 §13.2) and the high contrast preference (§13.3), read from
// tokens.css as text so this runs under `node --test` with no DOM. Colour vision
// is simulated with the Machado 2009 matrices (severity 1.0) and separation is
// measured by CIE76 ΔE, so a pair that merely differs in hue on paper has to
// stay apart for someone who cannot see it.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/themes/tokens.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** Every rule with declarations as { at, selector, vars }, one level of @media deep. */
function parse(text, at = '') {
  const out = []
  let i = 0
  while (i < text.length) {
    const open = text.indexOf('{', i)
    if (open === -1) break
    const prelude = text.slice(i, open).trim().replace(/\s+/g, ' ')
    let depth = 1
    let j = open + 1
    while (j < text.length && depth > 0) {
      if (text[j] === '{') depth++
      else if (text[j] === '}') depth--
      j++
    }
    const inner = text.slice(open + 1, j - 1)
    if (prelude.startsWith('@media')) out.push(...parse(inner, prelude))
    else {
      const vars = {}
      for (const m of inner.matchAll(/(--ts-[\w-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].trim()
      out.push({ at, selector: prelude, vars })
    }
    i = j
  }
  return out
}

const rules = parse(css)
const find = (selector, at = '') => {
  const r = rules.find((x) => x.selector === selector && x.at === at)
  assert.ok(r, `no rule ${at} ${selector}`)
  return r.vars
}

const paper = find(':where(:root)')
const graphite = { ...paper, ...find(':where([data-theme="dark"], .dark)') }

const DARK_SEL = (p) => `:where(:is([data-theme="dark"], .dark) [data-ts-palette="${p}"], :is([data-theme="dark"], .dark)[data-ts-palette="${p}"])`
const AUTO_SEL = (p) => `:where([data-theme="auto"] [data-ts-palette="${p}"], [data-theme="auto"][data-ts-palette="${p}"])`
const LIGHT_SEL = (p) => `:where([data-theme="light"] [data-ts-palette="${p}"], [data-theme="light"][data-ts-palette="${p}"])`
const palette = (p) => ({
  base: find(`:where([data-ts-palette="${p}"])`),
  dark: find(DARK_SEL(p)),
  auto: find(AUTO_SEL(p), '@media (prefers-color-scheme: dark)'),
  island: find(LIGHT_SEL(p)),
})

// WCAG 2.x relative luminance and contrast, as in test/tokens.test.mjs.
const rgb = (hex) => {
  assert.match(hex, /^#[0-9a-f]{6}$/i, `not a hex colour: ${hex}`)
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
}
const lin = (v) => {
  const c = v / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
const luminance = (hex) => {
  const [r, g, b] = rgb(hex).map(lin)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// Machado, Oliveira and Fernandes 2009, severity 1.0, applied to linear sRGB.
const MACHADO = {
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
}
const encode = (v) => {
  const c = Math.min(1, Math.max(0, v))
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
}
const simulate = (hex, matrix) => {
  const l = rgb(hex).map(lin)
  return matrix.map((row) => 255 * encode(row[0] * l[0] + row[1] * l[1] + row[2] * l[2]))
}
// sRGB (0-255) to CIELAB, D65.
function lab(c) {
  const [r, g, b] = c.map(lin)
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}
const deltaE = (a, b) => {
  const [p, q] = [lab(a), lab(b)]
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
}
const separation = (a, b, matrix) => deltaE(simulate(a, matrix), simulate(b, matrix))

describe('the simulation helpers', () => {
  test('CIE76 of black and white is 100, and of a colour with itself is 0', () => {
    assert.ok(Math.abs(deltaE([0, 0, 0], [255, 255, 255]) - 100) < 0.01)
    assert.equal(deltaE([12, 99, 200], [12, 99, 200]), 0)
  })
  test('grey is unchanged by either simulation', () => {
    for (const m of Object.values(MACHADO)) {
      for (const v of simulate('#808080', m)) assert.ok(Math.abs(v - 128) < 1, `grey became ${v}`)
    }
  })
  test('the default green and red come together under deuteranopia (why the palette exists)', () => {
    assert.ok(separation(paper['--ts-profit'], paper['--ts-loss'], MACHADO.deuteranopia) < 40)
  })
})

const hueOf = (hex) => {
  const [r, g, b] = rgb(hex).map((v) => v / 255)
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (h * 60 + 360) % 360
}

const TEXT = ['--ts-ink', '--ts-muted', '--ts-profit', '--ts-loss', '--ts-warn', '--ts-accent']
const GRAPHIC = ['--ts-axis', '--ts-focus', ...[1, 2, 3, 4, 5, 6].map((n) => `--ts-series-${n}`)]

/** A token's value, following var(--ts-x) once. */
const value = (theme, name) => {
  const v = theme[name]
  const ref = v && v.match(/^var\((--ts-[\w-]+)\)$/)
  return ref ? theme[ref[1]] : v
}

describe('every palette block is zero specificity and sets only palette tokens', () => {
  const OWNED = new Set(['--ts-profit', '--ts-loss', '--ts-accent', '--ts-focus', ...[1, 2, 3, 4, 5, 6].map((n) => `--ts-series-${n}`)])
  for (const name of ['cvd', 'red-up']) {
    test(name, () => {
      const p = palette(name)
      for (const block of Object.values(p)) for (const k of Object.keys(block)) assert.ok(OWNED.has(k), `${name} sets ${k}`)
      for (const r of rules.filter((x) => x.selector.includes(`data-ts-palette="${name}"`))) assert.ok(r.selector.startsWith(':where('), r.selector)
      assert.deepEqual(p.auto, p.dark, 'the auto block matches the dark block')
      assert.deepEqual(p.island, p.base, 'the light island restores the light values')
    })
  }
})

describe('data-ts-palette="cvd"', () => {
  const p = palette('cvd')
  const themes = { Paper: { ...paper, ...p.base }, Graphite: { ...graphite, ...p.dark } }
  for (const [name, theme] of Object.entries(themes)) {
    describe(name, () => {
      for (const [sim, matrix] of Object.entries(MACHADO)) {
        test(`profit and loss stay at least 40 ΔE apart under ${sim}`, () => {
          const d = separation(theme['--ts-profit'], theme['--ts-loss'], matrix)
          assert.ok(d >= 40, `ΔE ${d.toFixed(1)}`)
        })
      }
      test('profit is blue and loss is orange', () => {
        const [pr, pg, pb] = rgb(theme['--ts-profit'])
        const [lr, lg, lb] = rgb(theme['--ts-loss'])
        assert.ok(pb > pr && pb > pg, 'profit is blue')
        assert.ok(lr > lg && lg > lb, 'loss is orange')
      })
      test('the accent and focus have left blue, and the first series follows the accent', () => {
        const hue = hueOf(theme['--ts-accent'])
        assert.notEqual(theme['--ts-accent'], (name === 'Paper' ? paper : graphite)['--ts-accent'])
        // Blue spans roughly 190 to 255 degrees of hue; the default accents sit at 223 and 234.
        assert.ok(hue < 190 || hue > 255, `${theme['--ts-accent']} is at hue ${hue.toFixed(0)}, still blue`)
        assert.equal(value(theme, '--ts-focus'), theme['--ts-accent'])
        assert.equal(theme['--ts-series-1'], theme['--ts-accent'])
      })
      for (const token of TEXT) {
        test(`${token} reaches 4.5:1 on --ts-surface`, () => {
          const r = contrast(value(theme, token), theme['--ts-surface'])
          assert.ok(r >= 4.5, `${r.toFixed(2)}:1`)
        })
      }
      for (const token of GRAPHIC) {
        test(`${token} reaches 3:1 on --ts-surface`, () => {
          const r = contrast(value(theme, token), theme['--ts-surface'])
          assert.ok(r >= 3, `${r.toFixed(2)}:1`)
        })
      }
      test('the six series colours stay different', () => {
        assert.equal(new Set([1, 2, 3, 4, 5, 6].map((n) => theme[`--ts-series-${n}`].toLowerCase())).size, 6)
      })
    })
  }
})

describe('data-ts-palette="red-up"', () => {
  const p = palette('red-up')
  const themes = { Paper: [paper, { ...paper, ...p.base }], Graphite: [graphite, { ...graphite, ...p.dark }] }
  for (const [name, [plain, swapped]] of Object.entries(themes)) {
    describe(name, () => {
      test('swaps the values of profit and loss', () => {
        assert.equal(swapped['--ts-profit'], plain['--ts-loss'])
        assert.equal(swapped['--ts-loss'], plain['--ts-profit'])
      })
      test('sets nothing else', () => {
        const owned = Object.keys(p.base).concat(Object.keys(p.dark))
        assert.deepEqual([...new Set(owned)].sort(), ['--ts-loss', '--ts-profit'])
      })
      for (const token of ['--ts-profit', '--ts-loss']) {
        test(`${token} reaches 4.5:1 on --ts-surface`, () => {
          const r = contrast(swapped[token], swapped['--ts-surface'])
          assert.ok(r >= 4.5, `${r.toFixed(2)}:1`)
        })
      }
    })
  }
})

describe('@media (prefers-contrast: more)', () => {
  const more = '@media (prefers-contrast: more)'
  const light = find(':where(:root)', more)
  const dark = find(':where([data-theme="dark"], .dark)', more)
  const auto = find(':where([data-theme="auto"])', '@media (prefers-contrast: more) and (prefers-color-scheme: dark)')
  const island = find(':where([data-theme="light"])', more)
  const themes = { Paper: { ...paper, ...light }, Graphite: { ...graphite, ...dark } }

  for (const [name, theme] of Object.entries(themes)) {
    test(`${name}: --ts-line reaches 3:1 on --ts-surface`, () => {
      const r = contrast(theme['--ts-line'], theme['--ts-surface'])
      assert.ok(r >= 3, `${r.toFixed(2)}:1`)
    })
    test(`${name}: --ts-muted reaches 7:1 on --ts-surface`, () => {
      const r = contrast(theme['--ts-muted'], theme['--ts-surface'])
      assert.ok(r >= 7, `${r.toFixed(2)}:1`)
    })
    test(`${name}: --ts-muted still reaches 4.5:1 on --ts-bg`, () => {
      assert.ok(contrast(theme['--ts-muted'], theme['--ts-bg']) >= 4.5)
    })
  }
  test('sets only line and muted, and the auto and light-island blocks agree with their themes', () => {
    for (const b of [light, dark, auto, island]) assert.deepEqual(Object.keys(b).sort(), ['--ts-line', '--ts-muted'])
    assert.deepEqual(auto, dark)
    assert.deepEqual(island, light)
  })
  test('is declared after the theme blocks so it wins at equal specificity', () => {
    const at = (s, m) => rules.findIndex((x) => x.selector === s && x.at === m)
    assert.ok(at(':where(:root)', more) > at(':where([data-theme="light"])', ''))
  })
})
