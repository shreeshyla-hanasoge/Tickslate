// tokens.css is canonical: this test fails unless the injected defaults repeat
// its blocks with the same properties and values (RFC 0002 §6.1).
import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { TOKENS_CSS, ensureTokens } from '../src/elements/default-tokens.js'
import { resetWarnings } from '../src/elements/dev.js'

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/**
 * Every rule with declarations, in order, as { at, selector, decls }. `at` is
 * the enclosing at-rule's prelude ('' at the top level), so a @media block's
 * rule is told apart from a top-level one with the same selector.
 */
function parseBlocks(css, at = '') {
  const out = []
  let i = 0
  const text = stripComments(css)
  while (i < text.length) {
    const open = text.indexOf('{', i)
    if (open === -1) break
    const prelude = text.slice(i, open).trim()
    let depth = 1
    let j = open + 1
    while (j < text.length && depth > 0) {
      if (text[j] === '{') depth++
      else if (text[j] === '}') depth--
      j++
    }
    const inner = text.slice(open + 1, j - 1)
    if (prelude.startsWith('@media') || prelude.startsWith('@layer')) out.push(...parseBlocks(inner, prelude.startsWith('@media') ? prelude : at))
    else {
      const decls = new Map()
      for (const part of inner.split(';')) {
        const colon = part.indexOf(':')
        if (colon > 0) decls.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim().replace(/\s+/g, ' '))
      }
      out.push({ at, selector: prelude.replace(/\s+/g, ' '), decls })
    }
    i = j
  }
  return out
}

// A block that only restates a theme's padding, guarded against compact density.
const isPad = (b) => b.decls.size === 1 && b.decls.has('--ts-pad') && b.selector.includes('data-theme')

const canonical = parseBlocks(readFileSync(new URL('../src/themes/tokens.css', import.meta.url), 'utf8'))
const layerBody = TOKENS_CSS.match(/^@layer tickslate\.defaults \{([\s\S]*)\}\s*$/)
const defaults = layerBody ? parseBlocks(layerBody[1]) : []

describe('--ts-loss-mark (RFC 0005 Decision 95)', () => {
  const root = (blocks) => blocks.find((b) => b.at === '' && b.selector === ':where(:root)')
  test('is transparent by default in tokens.css and in the injected defaults, so a loss cell draws no corner', () => {
    assert.equal(root(canonical).decls.get('--ts-loss-mark'), 'transparent')
    assert.equal(root(defaults).decls.get('--ts-loss-mark'), 'transparent')
  })
  test('is set by the cvd palette to the ink colour in both files, and by no theme or preset block', () => {
    for (const blocks of [canonical, defaults]) {
      const setters = blocks.filter((b) => b.decls.has('--ts-loss-mark'))
      assert.equal(setters.length, 4, 'the root default and the three cvd blocks')
      const palette = setters.filter((b) => b.selector !== ':where(:root)')
      assert.equal(palette.length, 3)
      for (const b of palette) {
        assert.equal(b.decls.get('--ts-loss-mark'), 'var(--ts-ink)')
        assert.ok(b.decls.has('--ts-series-2') && b.decls.get('--ts-focus') === 'var(--ts-accent)' && /data-ts-palette="cvd"/.test(b.selector), b.selector)
      }
    }
  })
})

describe('default tokens', () => {
  test('are tokens.css wrapped in @layer tickslate.defaults', () => {
    assert.ok(layerBody, 'TOKENS_CSS is one @layer tickslate.defaults { … } block')
    assert.equal(TOKENS_CSS.match(/@layer/g).length, 1)
  })

  test('have the same blocks as tokens.css, in the same order', () => {
    assert.ok(canonical.length >= 4)
    assert.deepEqual(
      defaults.map((b) => [b.at, b.selector]),
      canonical.map((b) => [b.at, b.selector]),
    )
  })

  test('declare the same properties with equal values in each block', () => {
    canonical.forEach((block, n) => {
      const mine = defaults[n]
      assert.deepEqual([...mine.decls.keys()].sort(), [...block.decls.keys()].sort(), `properties of ${block.selector}`)
      for (const [name, value] of block.decls) assert.equal(mine.decls.get(name), value, `${block.selector} ${name}`)
    })
  })

  test('cover the three theme switches and the pre-upgrade rules', () => {
    const selectors = canonical.map((b) => b.selector)
    assert.ok(selectors.includes(':where([data-theme="auto"])'))
    assert.ok(selectors.includes(':where([data-theme="dark"], .dark)'))
    assert.ok(selectors.includes(':where([data-theme="light"])'))
    assert.ok(selectors.some((s) => s.includes('ts-grid:not(:defined)')))
  })

  test('carry the density block and the type scale, equal to tokens.css (RFC 0004 §2)', () => {
    const density = ':where([data-ts-density="compact"])'
    for (const blocks of [canonical, defaults]) {
      const compact = blocks.find((b) => b.selector === density)
      assert.ok(compact, `a ${density} block`)
      assert.deepEqual([...compact.decls], [['--ts-row', '120px'], ['--ts-pad', '12px'], ['--ts-gap', '10px']])
      const root = blocks.find((b) => b.selector === ':where(:root)').decls
      assert.equal(root.get('--ts-label-size'), 'max(11px, .6875rem)')
      for (const name of ['2xs', 'xs', 'sm', 'md', 'base', 'lg', 'xl', '2xl', '3xl', 'big', 'xbig']) assert.match(root.get(`--ts-text-${name}`), /^max\(\d+px, [\d.]+rem\)$/, name)
    }
  })

  test('the OS dark rule applies only under data-theme="auto" and the light island comes last of the themes', () => {
    // The padding blocks restate the theme's --ts-pad where compact density is absent (RFC 0004 §2.1); they are tested below.
    const media = canonical.filter((b) => b.at.includes('prefers-color-scheme: dark') && !b.selector.includes('data-ts-palette') && !b.at.includes('prefers-contrast') && !isPad(b))
    assert.deepEqual(media.map((b) => b.selector), [':where([data-theme="auto"])'])
    const order = canonical.map((b) => b.selector)
    assert.ok(order.indexOf(':where([data-theme="light"])') > order.indexOf(':where([data-theme="dark"], .dark)'))
  })

  test('every themed property in the dark blocks is restored by the light island', () => {
    const light = new Map(canonical.filter((b) => b.selector.startsWith(':where([data-theme="light"]') && !b.at.includes('prefers-contrast')).flatMap((b) => [...b.decls]))
    const paper = canonical.find((b) => b.selector === ':where(:root)').decls
    for (const block of canonical.filter((b) => b.selector.includes('dark') || b.selector.includes('auto'))) {
      // The cvd palette turns the loss corner on and no theme does, so there is nothing for the light island to restore.
      for (const name of block.decls.keys()) if (name !== '--ts-loss-mark') assert.equal(light.get(name), paper.get(name), `light island ${name}`)
    }
  })

  test('the themes\' padding sits in blocks that yield to compact density, equal in both files (RFC 0004 §2.1)', () => {
    const guard = ':not([data-ts-density="compact"], [density="compact"], [data-ts-density="compact"] *, [density="compact"] *)'
    for (const blocks of [canonical, defaults]) {
      const pads = blocks.filter(isPad)
      assert.deepEqual(pads.map((b) => [b.at.includes('prefers-color-scheme: dark'), b.selector, [...b.decls]]), [
        [true, `:where([data-theme="auto"]${guard})`, [['--ts-pad', '16px']]],
        [false, `:where([data-theme="dark"]${guard}, .dark${guard})`, [['--ts-pad', '16px']]],
        [false, `:where([data-theme="light"]${guard})`, [['--ts-pad', '18px']]],
      ])
      // No theme block outside those sets a padding of its own, and they come before the density block that is meant to win.
      for (const b of blocks.filter((x) => x.decls.has('--ts-pad') && !isPad(x))) assert.ok([':where(:root)', ':where([data-ts-density="compact"])'].includes(b.selector), b.selector)
      const order = blocks.map((b) => b.selector)
      assert.ok(order.indexOf(':where([data-ts-density="compact"])') > order.indexOf(pads[2].selector))
    }
  })
})

// A document just real enough for ensureTokens.
function fakeDoc({ surface = '', adopt = true } = {}) {
  const appended = []
  const sheets = []
  class Sheet {
    replaceSync(css) {
      this.css = css
    }
  }
  const doc = {
    documentElement: {},
    head: { appendChild: (el) => appended.push(el) },
    createElement: () => ({ attrs: {}, setAttribute(k, v) { this.attrs[k] = v } }),
    defaultView: { getComputedStyle: () => ({ getPropertyValue: (name) => (name === '--ts-surface' ? surface : '') }), CSSStyleSheet: Sheet },
  }
  if (adopt) doc.adoptedStyleSheets = sheets
  return { doc, appended, sheets }
}

describe('ensureTokens', () => {
  let warnings
  const realWarn = console.warn
  beforeEach(() => {
    resetWarnings()
    warnings = []
    console.warn = (m) => warnings.push(m)
  })
  afterEach(() => {
    console.warn = realWarn
  })

  test('does nothing without a document', () => {
    assert.doesNotThrow(() => ensureTokens(undefined))
    assert.doesNotThrow(() => ensureTokens({}))
    assert.equal(warnings.length, 0)
  })

  test('adopts the defaults as a constructed stylesheet when --ts-surface is empty, and warns once', () => {
    const { doc, appended } = fakeDoc()
    ensureTokens(doc)
    ensureTokens(doc)
    assert.equal(doc.adoptedStyleSheets.length, 1)
    assert.equal(doc.adoptedStyleSheets[0].css, TOKENS_CSS)
    assert.equal(appended.length, 0)
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /tokens\.css is not loaded/)
  })

  test('falls back to a <style> element where adoption is unavailable', () => {
    const { doc, appended } = fakeDoc({ adopt: false })
    ensureTokens(doc)
    assert.equal(appended.length, 1)
    assert.equal(appended[0].textContent, TOKENS_CSS)
  })

  test('leaves a page alone when --ts-surface is already defined', () => {
    const { doc, appended } = fakeDoc({ surface: ' #FFFFFF' })
    ensureTokens(doc)
    assert.equal(doc.adoptedStyleSheets.length + appended.length, 0)
    assert.equal(warnings.length, 0)
  })
})
