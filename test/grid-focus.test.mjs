import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isOutside, pickFocusTarget } from '../src/elements/grid-focus.js'

// What a composedPath() holds for a press on a button inside the grid's shadow root.
const grid = { name: 'grid' }
const pill = { name: 'pill' }
const button = { name: 'done' }
const page = { name: 'body' }

describe('isOutside', () => {
  test('a press on the page is outside', () => {
    assert.equal(isOutside([page, { name: 'html' }, { name: 'document' }], grid), true)
  })

  test('a press on a light-DOM tile or in the shadow root is inside, because the path names the grid', () => {
    assert.equal(isOutside([{ name: 'tile' }, grid, page], grid), false)
    assert.equal(isOutside([button, pill, { name: 'root' }, grid, page], grid), false)
  })

  test('extras count as inside', () => {
    const menu = { name: 'host menu' }
    assert.equal(isOutside([menu, page], grid), true)
    assert.equal(isOutside([menu, page], grid, [menu]), false)
    assert.equal(isOutside([menu, page], grid, [{ name: 'other' }]), true)
  })

  test('an empty or missing path is outside', () => {
    assert.equal(isOutside([], grid), true)
    assert.equal(isOutside(undefined, grid), true)
  })

  test('the grid itself can be the extras owner, e.g. a list rendered next to the pill', () => {
    // Used for the menu's own outside test, where the wrapper stands in for the grid.
    assert.equal(isOutside([button, pill, grid], pill), false)
    assert.equal(isOutside([page], pill), true)
  })
})

describe('pickFocusTarget', () => {
  const ok = (target) => ({ target, connected: true, hidden: false })

  test('takes the first candidate that can hold focus', () => {
    assert.equal(pickFocusTarget([ok('a'), ok('b')]), 'a')
  })

  test('skips one that is disconnected, hidden or disabled', () => {
    assert.equal(pickFocusTarget([{ ...ok('a'), connected: false }, ok('b')]), 'b')
    assert.equal(pickFocusTarget([{ ...ok('a'), hidden: true }, ok('b')]), 'b')
    assert.equal(pickFocusTarget([{ ...ok('a'), disabled: true }, ok('b')]), 'b')
  })

  test('skips null and undefined, for an origin that was never recorded', () => {
    assert.equal(pickFocusTarget([null, undefined, ok('c')]), 'c')
  })

  test('returns null when nothing qualifies, so the caller falls back to the grid', () => {
    assert.equal(pickFocusTarget([]), null)
    assert.equal(pickFocusTarget([null, { ...ok('a'), hidden: true }]), null)
  })

  test('disabled is optional', () => {
    assert.equal(pickFocusTarget([{ target: 'x', connected: true, hidden: false, disabled: false }]), 'x')
  })
})

// The reduced-motion outline (RFC 0002 §5.7) over --ts-bg, in both themes.
describe('the reduced-motion edit outline', () => {
  const grid_js = readFileSync(new URL('../src/elements/grid.js', import.meta.url), 'utf8')
  const tokens = readFileSync(new URL('../src/themes/tokens.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const mixed = /:host\(\[editing\]\) \.chrome \{ outline: 2px dashed color-mix\(in srgb, var\(--ts-ink\) (\d+)%, transparent\)/.exec(grid_js)

  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const lum = (c) => {
    const [r, g, b] = c.map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
  }
  const token = (selector, name) => {
    const at = tokens.indexOf(selector + ' {')
    const body = tokens.slice(tokens.indexOf('{', at) + 1, tokens.indexOf('}', at))
    return new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(body)[1]
  }

  test('is a colour-mix of --ts-ink, and uses no hard-coded colour', () => {
    assert.ok(mixed, 'the outline rule is not the colour-mix of --ts-ink')
  })

  for (const [theme, selector] of [['Paper', ':where(:root)'], ['Graphite', ':where([data-theme="dark"], .dark)']]) {
    test(`is at least 3:1 against --ts-bg in ${theme}`, () => {
      const pct = Number(mixed[1]) / 100
      const ink = rgb(token(selector, '--ts-ink'))
      const bg = rgb(token(selector, '--ts-bg'))
      const over = ink.map((v, i) => Math.round(v * pct + bg[i] * (1 - pct)))
      assert.ok(ratio(over, bg) >= 3, `${ratio(over, bg).toFixed(2)}:1`)
    })
  }
})
