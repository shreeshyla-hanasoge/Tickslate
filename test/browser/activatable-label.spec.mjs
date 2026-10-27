// An activatable tile's label is a <button>, whose user-agent sheet sets its own case and tracking and, in Chromium and
// WebKit, makes it an atomic inline that the label's ellipsis cannot cut (issue #68). Every tile the widget fixture
// builds is rendered twice, plain and activatable, and the two labels are compared in the engine: computed style, box
// width, whether the text is cut, and the words a screen reader gets. The presets are terminal and paper because
// they set a case and a tracking the button's own sheet does not, so a missing rule fails on every engine.
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { gridDrawn } from './drawn.mjs'

const SHOTS = process.env.TS_SHOTS
const PRESETS = ['terminal', 'paper']
const THEMES = ['light', 'dark']
const WIDTHS = [170, 351]
const PICTURED = ['pnlCalendar', 'sessionClock', 'metric', 'breakdown']

async function pairUp(page, width) {
  await page.evaluate(async (w) => {
    for (const [key, el] of window.__fx.tiles) {
      const twin = document.createElement(el.localName)
      for (const a of ['size', 'label']) if (el.hasAttribute(a)) twin.setAttribute(a, el.getAttribute(a))
      twin.innerHTML = el.innerHTML
      twin.clock = el.clock
      twin.data = el.data
      twin.setAttribute('activatable', '')
      twin.dataset.key = el.dataset.key
      twin.dataset.size = el.dataset.size
      for (const t of [el, twin]) { t.style.width = `${w}px`; t.style.flex = 'none' }
      const pair = document.createElement('div')
      pair.className = 'pair'
      pair.dataset.pair = key
      pair.style.cssText = 'display:flex;gap:12px;align-items:flex-start'
      el.parentNode.insertBefore(pair, el)
      pair.append(el, twin)
    }
    await window.__fx.nextFrame()
  }, width)
  // Every tile, the twins included, has drawn: named and no longer busy (the condition the other specs wait on), then the twin's button.
  await gridDrawn(page, '.pair > *')
  await page.waitForFunction(() => [...document.querySelectorAll('.pair')].every((pair) => pair.children[1].shadowRoot.querySelector('button[part~="link"]')))
}

// What a reader can read: text nodes not under display:none, as the accessibility tree builds a name.
const READ = `(root) => {
  let out = ''
  const walk = (n) => {
    if (n.nodeType === 3) { out += n.nodeValue; return }
    if (n.nodeType !== 1) return
    if (getComputedStyle(n).display === 'none') return
    for (const k of n.childNodes) walk(k)
  }
  for (const k of root.childNodes) walk(k)
  return out.replace(/\\s+/g, ' ').trim()
}`

const measure = (page) => page.evaluate(`(() => {
  const read = ${READ}
  const out = {}
  for (const pair of document.querySelectorAll('.pair')) {
    const [plain, act] = pair.children
    const info = (el) => {
      const root = el.shadowRoot
      const label = root.querySelector('[part~="label"]')
      const link = root.querySelector('button[part~="link"]')
      const carrier = link || label
      const cs = getComputedStyle(carrier)
      return {
        isButton: !!link, textTransform: cs.textTransform, letterSpacing: cs.letterSpacing, fontSize: cs.fontSize,
        fontWeight: cs.fontWeight, color: cs.color, fontFamily: cs.fontFamily, lineHeight: cs.lineHeight,
        width: Math.round(label.getBoundingClientRect().width * 2) / 2,
        headerHeight: Math.round(root.querySelector('[part~="header"]').getBoundingClientRect().height * 2) / 2,
        pad: parseFloat(getComputedStyle(root.querySelector('.tile')).paddingTop),
        coarse: matchMedia('(pointer: coarse)').matches,
        // Cut text, plain: the span clips it; activatable: the button does. Either way the words reach the box edge.
        cut: carrier.scrollWidth > carrier.clientWidth + 0.5 || label.scrollWidth > label.clientWidth + 0.5,
        // The button must never be wider than the label it sits in.
        spill: link ? Math.round((link.getBoundingClientRect().width - label.getBoundingClientRect().width) * 2) / 2 : 0,
        ariaLabel: label.getAttribute('aria-label'),
        name: read(carrier),
      }
    }
    out[pair.dataset.pair] = { plain: info(plain), act: info(act) }
  }
  return out
})()`)

for (const preset of PRESETS) {
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      test(`every label, ${preset} ${theme} at ${width}px: an activatable one matches a plain one`, async ({ page }, info) => {
        await page.goto(`/test/browser/fixtures/widgets.html?preset=${preset}&theme=${theme}`)
        await page.waitForFunction(() => window.__ready === true)
        await pairUp(page, width)
        const all = await measure(page)
        const keys = Object.keys(all)
        expect(keys.length).toBeGreaterThanOrEqual(50)
        const bad = []
        for (const key of keys) {
          const { plain, act } = all[key]
          if (!act.isButton || plain.isButton) bad.push(`${key}: button ${plain.isButton}/${act.isButton}`)
          for (const p of ['textTransform', 'letterSpacing', 'fontSize', 'fontWeight', 'color', 'fontFamily', 'lineHeight', 'ariaLabel', 'name', 'cut']) {
            if (act[p] !== plain[p]) bad.push(`${key}: ${p} ${JSON.stringify(plain[p])} vs ${JSON.stringify(act[p])}`)
          }
          // On a touch screen an activatable header grows to keep a 44px open target over 12px of padding (RFC 0005 §1.4); otherwise it matches.
          const header = act.coarse ? Math.max(plain.headerHeight, 34 - act.pad) : plain.headerHeight
          if (act.headerHeight !== header) bad.push(`${key}: headerHeight ${header} vs ${act.headerHeight}`)
          if (Math.abs(act.width - plain.width) > 0.5) bad.push(`${key}: width ${plain.width} vs ${act.width}`)
          if (act.spill > 0.5) bad.push(`${key}: the button is ${act.spill}px wider than its label`)
        }
        expect(bad).toEqual([])
        if (SHOTS) {
          mkdirSync(SHOTS, { recursive: true })
          for (const key of PICTURED) {
            await page.locator(`.pair[data-pair^="${key}:"]`).first().screenshot({ path: `${SHOTS}/${preset}-${theme}-${width}-${key}-${info.project.name}.png` })
          }
        }
      })
    }
  }
}

test('an activatable session clock is named by one title, as a plain one is', async ({ page }) => {
  await page.goto('/test/browser/fixtures/widgets.html?preset=terminal')
  await page.waitForFunction(() => window.__ready === true)
  await pairUp(page, 170)
  const names = await page.evaluate(`(() => {
    const read = ${READ}
    const pair = document.querySelector('.pair[data-pair^="sessionClock:"]')
    const [plain, act] = pair.children
    return { plain: read(plain.shadowRoot.querySelector('[part~="label"]')), act: read(act.shadowRoot.querySelector('button[part~="link"]')) }
  })()`)
  expect(names.plain).not.toBe('')
  // The role query reads the browser's own accessibility tree: one button, named by the one form the plain heading shows.
  const button = page.locator('.pair[data-pair^="sessionClock:"]').first().getByRole('button', { name: names.plain, exact: true })
  await expect(button).toHaveCount(1)
  expect(names.act).toBe(names.plain)
})

test('forced colours keep the label tokens, the width and the focus ring', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'forced-colors emulation is not available in WebKit')
  await page.emulateMedia({ forcedColors: 'active' })
  await page.goto('/test/browser/fixtures/widgets.html?preset=terminal&theme=dark')
  await page.waitForFunction(() => window.__ready === true)
  await pairUp(page, 170)
  const all = await measure(page)
  for (const [key, { plain, act }] of Object.entries(all)) {
    expect([key, act.textTransform, act.letterSpacing, act.cut]).toEqual([key, plain.textTransform, plain.letterSpacing, plain.cut])
    expect(Math.abs(act.width - plain.width)).toBeLessThanOrEqual(0.5)
  }
  await page.locator('.pair[data-pair^="metric:"]').first().locator('ts-metric[activatable]').evaluate((el) => el.shadowRoot.querySelector('button[part~="link"]').focus())
  const ring = await page.evaluate(() => {
    const el = document.querySelector('.pair[data-pair^="metric:"] ts-metric[activatable]')
    return getComputedStyle(el.shadowRoot.querySelector('button[part~="link"]'), '::after').outlineStyle
  })
  expect(ring).toBe('solid')
})
