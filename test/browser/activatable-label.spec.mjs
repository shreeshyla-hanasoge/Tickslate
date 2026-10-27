// An activatable tile's label is a <button>, whose user-agent sheet sets its own case and tracking. It must still read
// like a plain tile's label (issue #68). The two kinds of tile are rendered side by side and compared in the engine.
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const SHOTS = process.env.TS_SHOTS
const PRESETS = ['terminal', 'calm']
const THEMES = ['light', 'dark']

const measure = (page) => page.evaluate(() => {
  const read = (el) => {
    const label = el.shadowRoot.querySelector('[part~="label"]')
    const cs = getComputedStyle(el.shadowRoot.querySelector('[part~="link"]') || label)
    return {
      isButton: !!el.shadowRoot.querySelector('button[part~="link"]'),
      textTransform: cs.textTransform, letterSpacing: cs.letterSpacing, fontSize: cs.fontSize, fontWeight: cs.fontWeight,
      color: cs.color, fontFamily: cs.fontFamily, width: label.getBoundingClientRect().width,
    }
  }
  return { plain: read(document.getElementById('plain')), act: read(document.getElementById('act')) }
})

for (const preset of PRESETS) {
  for (const theme of THEMES) {
    test.describe(`${preset} ${theme}`, () => {
      test('an activatable label has the same tokens and width as a plain one', async ({ page }, info) => {
        await page.goto(`/test/browser/fixtures/widgets.html?preset=${preset}&theme=${theme}`)
        await page.waitForFunction(() => window.__ready === true)
        await page.evaluate(async () => {
          const stage = document.getElementById('stage')
          stage.replaceChildren()
          const row = document.createElement('div')
          row.style.cssText = 'display:flex;gap:16px;flex-wrap:wrap'
          for (const [id, act] of [['plain', false], ['act', true]]) {
            const el = document.createElement('ts-metric')
            el.id = id
            el.setAttribute('size', 'Wide')
            el.setAttribute('label', 'Net exposure')
            el.style.width = 'min(351px, 100%)'
            if (act) el.setAttribute('activatable', '')
            el.data = { value: 1204, previous: 1075 }
            row.append(el)
          }
          stage.append(row)
          await window.__fx.nextFrame()
        })
        const { plain, act } = await measure(page)
        expect(act.isButton).toBe(true)
        expect(plain.isButton).toBe(false)
        expect(act.textTransform).toBe(plain.textTransform)
        expect(act.letterSpacing).toBe(plain.letterSpacing)
        expect(act.fontSize).toBe(plain.fontSize)
        expect(act.fontWeight).toBe(plain.fontWeight)
        expect(act.color).toBe(plain.color)
        expect(act.fontFamily).toBe(plain.fontFamily)
        expect(Math.abs(act.width - plain.width)).toBeLessThan(0.5)
        // Terminal sets a tracking, so "normal" would be the bug; calm sets none, and equality above covers it.
        if (preset === 'terminal') expect(act.letterSpacing).not.toBe('normal')
        if (SHOTS) {
          mkdirSync(SHOTS, { recursive: true })
          const vp = page.viewportSize().width
          await page.locator('#stage > div').screenshot({ path: `${SHOTS}/${preset}-${theme}-${vp}-${info.project.name}.png` })
        }
      })

      test('forced colours keep the label tokens and the focus ring', async ({ page, browserName }) => {
        test.skip(browserName === 'webkit', 'forced-colors emulation is not available in WebKit')
        await page.emulateMedia({ forcedColors: 'active' })
        await page.goto(`/test/browser/fixtures/widgets.html?preset=${preset}&theme=${theme}`)
        await page.waitForFunction(() => window.__ready === true)
        await page.evaluate(async () => {
          const stage = document.getElementById('stage')
          stage.replaceChildren()
          for (const [id, act] of [['plain', false], ['act', true]]) {
            const el = document.createElement('ts-metric')
            el.id = id
            el.setAttribute('size', 'Wide')
            el.setAttribute('label', 'Net exposure')
            if (act) el.setAttribute('activatable', '')
            el.data = { value: 1204, previous: 1075 }
            stage.append(el)
          }
          await window.__fx.nextFrame()
        })
        const { plain, act } = await measure(page)
        expect(act.textTransform).toBe(plain.textTransform)
        expect(act.letterSpacing).toBe(plain.letterSpacing)
        expect(Math.abs(act.width - plain.width)).toBeLessThan(0.5)
        await page.keyboard.press('Tab')
        const ring = await page.evaluate(() => {
          const btn = document.getElementById('act').shadowRoot.querySelector('button[part~="link"]')
          return getComputedStyle(btn, '::after').outlineStyle
        })
        expect(ring).toBe('solid')
      })
    })
  }
}
