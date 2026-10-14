// Contrast floors for the rendered pairs (RFC 0002 §6.6), by the WCAG 2.x
// relative-luminance formula, read straight from tokens.css.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/themes/tokens.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** Custom properties declared by the first rule whose selector is exactly `selector`, searching inside @media too. */
function block(selector) {
  const at = css.indexOf(selector + ' {')
  assert.ok(at >= 0, `no block ${selector}`)
  const body = css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at))
  const vars = {}
  for (const m of body.matchAll(/(--ts-[\w-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].trim()
  return vars
}

const paper = block(':where(:root)')
const graphite = block(':where([data-theme="dark"], .dark)')
const themes = { Paper: paper, Graphite: { ...paper, ...graphite } }

/** A token's colour, following var(--ts-x) once (--ts-focus defaults to the accent). */
function colour(theme, name) {
  let v = theme[name]
  const ref = v && v.match(/^var\((--ts-[\w-]+)\)$/)
  if (ref) v = theme[ref[1]]
  return v
}

export function hexToRgb(hex) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex)
  assert.ok(m, `not a hex colour: ${hex}`)
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}

export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('the contrast helper', () => {
  test('matches the WCAG reference values', () => {
    assert.equal(contrast('#000000', '#FFFFFF').toFixed(2), '21.00')
    assert.equal(contrast('#777', '#FFF').toFixed(2), '4.48')
    assert.equal(contrast('#fff', '#fff'), 1)
  })
})

for (const [name, theme] of Object.entries(themes)) {
  describe(`${name} contrast floors`, () => {
    const on = (fg, bg, floor) => {
      const ratio = contrast(colour(theme, fg), colour(theme, bg))
      assert.ok(ratio >= floor, `${fg} on ${bg} is ${ratio.toFixed(2)}:1, needs ${floor}:1`)
    }

    // Warn text only renders on the surface (§14 C), so it is not asserted on --ts-bg.
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
    // A line or an area is a graphic, so 3:1 is the floor (WCAG 1.4.11), not 4.5:1.
    for (let n = 1; n <= 6; n++) {
      test(`--ts-series-${n} reaches 3:1 on --ts-surface`, () => on(`--ts-series-${n}`, '--ts-surface', 3))
    }
  })
}

test('--ts-axis and --ts-focus exist in both themes, and focus defaults to the accent', () => {
  for (const theme of Object.values(themes)) {
    assert.ok(colour(theme, '--ts-axis'))
    assert.equal(colour(theme, '--ts-focus'), colour(theme, '--ts-accent'))
  }
  assert.ok(graphite['--ts-axis'] && graphite['--ts-focus'])
})

test('the six series colours are defined in both themes and are all different within each', () => {
  for (const theme of [paper, graphite]) {
    const colours = [1, 2, 3, 4, 5, 6].map((n) => {
      const c = theme[`--ts-series-${n}`]
      assert.match(c, /^#[0-9a-f]{6}$/i, `--ts-series-${n}`)
      return c.toLowerCase()
    })
    assert.equal(new Set(colours).size, 6)
  }
  assert.ok(graphite['--ts-series-1'], 'the dark block restates the series')
  assert.notEqual(graphite['--ts-series-1'], paper['--ts-series-1'])
})
