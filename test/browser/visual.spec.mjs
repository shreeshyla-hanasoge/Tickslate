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
import { drawn } from './drawn.mjs'

// 'default' sets no data-theme, so the bare :root palette of tokens.css (and default-tokens.js) is pinned too.
const THEMES = ['light', 'dark', 'default']
const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  phone: { width: 390, height: 844 },
}
const PAGE = '/test/browser/fixtures/widgets.html'

// RFC 0004 section 9.1 names maxDiffPixelRatio 0.001, which lets a 304 x 150 tile differ by 45 pixels and an XL
// table by hundreds: a one-digit text change, a 1 px radius step and a small accent shift all slipped under it, and
// at the default per-pixel threshold (0.1, and Playwright's 0.2) the colour shifts are not seen at all. So the ratio
// is kept and paired with no allowed differing pixels and a per-pixel threshold of 0.005, which sees a 2-level shift
// in every colour channel. Rendering in one pinned image is deterministic: 24 clean runs on the baselines made
// beside them.
const COMPARE = { maxDiffPixelRatio: 0.001, maxDiffPixels: 0, threshold: 0.005, animations: 'disabled' }

// The widget list comes from the page, which knows what is registered. Playwright
// loads every spec file in one process, so a Node-side import of the elements
// would be evaluated by whichever spec ran first, and a stub there would leave
// this file with an empty list. The tests below are one per theme and viewport,
// each looping over what the page lists, with the same snapshot names as before.
test.describe('visual baselines', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'baselines are made for one engine on one platform')
  })

  for (const [viewport, size] of Object.entries(VIEWPORTS)) {
    for (const theme of THEMES) {
      // The default palette is one look; the desktop shot is enough.
      if (theme === 'default' && viewport === 'phone') continue
      test(`every widget in ${theme} on ${viewport}`, async ({ page }) => {
        test.setTimeout(120000)
        await page.emulateMedia({ colorScheme: 'light' })
        await page.setViewportSize(size)
        // A table keeps one dropped column per measured draw (RFC 0003 §23), so every load shows the same columns:
        // ten loads on each of webkit, firefox and chromium agree, and one load is enough for a baseline.
        await page.goto(`${PAGE}?theme=${theme}&exact=1`)
        await page.waitForFunction(() => window.__ready === true)
        await drawn(page)
        await page.evaluate(async () => {
          await document.fonts.ready
          for (let i = 0; i < 6; i++) await window.__fx.nextFrame()
        })
        // On the phone, a tile that fits at its nominal width looks the same as on the desktop, so only the tiles the viewport narrows get a phone shot.
        const entries = await page.evaluate((phone) => window.__fx.entries.map((e) => ({
          ...e,
          sizes: e.sizes.filter((s) => {
            if (!phone) return true
            const el = document.querySelector(`[data-key="${e.key}"][data-size="${s}"]`)
            const nominal = parseFloat(el.closest('figure').style.width.match(/min\((\d+)px/)[1])
            return el.getBoundingClientRect().width < nominal - 0.5
          }),
        })), viewport === 'phone')
        // An empty list would pass vacuously, so say so loudly.
        expect(entries.map((e) => e.key)).toEqual(expect.arrayContaining(['card', 'metric', 'chart']))
        for (const entry of entries) {
          for (const tileSize of entry.sizes) {
            const tile = page.locator(`[data-key="${entry.key}"][data-size="${tileSize}"]`)
            // A soft expect so one drifted tile does not hide the others.
            await expect.soft(tile).toHaveScreenshot(`${entry.key}-${tileSize}-${theme}-${viewport}.png`, COMPARE)
          }
        }
      })
    }
  }
})
