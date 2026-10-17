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

const canonical = parseBlocks(readFileSync(new URL('../src/themes/tokens.css', import.meta.url), 'utf8'))
const layerBody = TOKENS_CSS.match(/^@layer tickslate\.defaults \{([\s\S]*)\}\s*$/)
const defaults = layerBody ? parseBlocks(layerBody[1]) : []

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

  test('the OS dark rule applies only under data-theme="auto" and the light island comes last of the themes', () => {
    const media = canonical.filter((b) => b.at.includes('prefers-color-scheme: dark') && !b.selector.includes('data-ts-palette') && !b.at.includes('prefers-contrast'))
    assert.deepEqual(media.map((b) => b.selector), [':where([data-theme="auto"])'])
    const order = canonical.map((b) => b.selector)
    assert.ok(order.indexOf(':where([data-theme="light"])') > order.indexOf(':where([data-theme="dark"], .dark)'))
  })

  test('every themed property in the dark blocks is restored by the light island', () => {
    const light = canonical.find((b) => b.selector === ':where([data-theme="light"])').decls
    const paper = canonical.find((b) => b.selector === ':where(:root)').decls
    for (const block of canonical.filter((b) => b.selector.includes('dark') || b.selector.includes('auto'))) {
      for (const name of block.decls.keys()) assert.equal(light.get(name), paper.get(name), `light island ${name}`)
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
