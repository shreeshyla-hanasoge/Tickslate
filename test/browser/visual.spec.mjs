// Visual regression (RFC 0004 §9.1): every registered widget at every size it
// supports, in both themes, at a desktop and a phone viewport. Each tile is
// compared with its own baseline in test/browser/visual.spec.mjs-snapshots/.
//
// Baselines are canonical only when made on the pinned Linux image
// (`npm run test:visual:update`, or the CI `visual` job): text renders
// differently per engine and OS, so this runs in the chromium project alone.
// An intentional look change updates the baselines in the same PR, and the PR
// says which look changed and why.
import { test, expect } from '@playwright/test'
import { WIDGETS } from '../../src/core/index.js'

// Same trick as render.spec.mjs: the core lists widgets whose elements are not
// built yet, and those have no tile, so follow the registrations.
const defined = new Set()
globalThis.customElements = { get: () => undefined, define: (tag) => defined.add(tag) }
await import('../../src/elements/index.js')
delete globalThis.customElements

const KEYS = Object.entries(WIDGETS).filter(([, spec]) => defined.has(spec.tag)).map(([key]) => key)
const THEMES = ['light', 'dark']
const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  phone: { width: 390, height: 844 },
}
const PAGE = '/test/browser/fixtures/widgets.html'

test.describe('visual baselines', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'baselines are made for one engine on one platform')
  })

  test('the registrations include the generic widgets', () => {
    expect(KEYS).toEqual(expect.arrayContaining(['card', 'metric', 'chart']))
  })

  for (const [viewport, size] of Object.entries(VIEWPORTS)) {
    for (const theme of THEMES) {
      for (const key of KEYS) {
        test(`${key} in ${theme} on ${viewport}`, async ({ page }) => {
          await page.setViewportSize(size)
          await page.goto(`${PAGE}?theme=${theme}`)
          await page.waitForFunction(() => window.__ready === true)
          await page.evaluate(() => window.__fx.nextFrame())
          // Every size of the widget in turn; a soft expect so one drifted tile does not hide the others.
          for (const tileSize of WIDGETS[key].sizes) {
            const tile = page.locator(`[data-key="${key}"][data-size="${tileSize}"]`)
            await expect.soft(tile).toHaveScreenshot(`${key}-${tileSize}-${theme}-${viewport}.png`, {
              maxDiffPixelRatio: 0.001,
              animations: 'disabled',
            })
          }
        })
      }
    }
  }
})
