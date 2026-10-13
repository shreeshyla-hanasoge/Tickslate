// axe-core in real engines, in both themes, with edit mode off, on and a tile
// held. The bar is no serious or critical violation under WCAG 2.2 AA.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']
const THEMES = ['light', 'dark']

test.beforeEach(async ({ page }) => {
  // Network off: only the dev server answers.
  await page.context().route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname), (route) => route.abort())
})

const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))

async function expectClean(page, what) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  // Readable on failure: the rule, and the first few nodes it hit.
  const report = bad.map((v) => `${v.id} (${v.impact}): ${v.help}\n${v.nodes.slice(0, 3).map((n) => `  ${n.target.join(' ')}\n  ${n.failureSummary}`).join('\n')}`)
  expect(report, `${what}: axe violations`).toEqual([])
}

async function openGrid(page, theme, query = '') {
  await page.goto(`/test/browser/fixtures/grid.html?mode=explicit&theme=${theme}${query}`)
  await page.waitForFunction(() => window.__ready === true)
  await settle(page)
}

test.describe('axe', () => {
  for (const theme of THEMES) {
    test(`widgets in ${theme}: every widget, size and state`, async ({ page }) => {
      await page.goto(`/test/browser/fixtures/widgets.html?theme=${theme}`)
      await page.waitForFunction(() => window.__ready === true)
      await settle(page)
      await expectClean(page, `widgets, ${theme}, data`)
      // The three views a host sees while data is on its way or broken.
      for (const mode of ['loading', 'empty', 'error']) {
        await page.evaluate((m) => { for (const el of window.__fx.tiles.values()) window.__fx.setMode(el, m) }, mode)
        await settle(page)
        await expectClean(page, `widgets, ${theme}, ${mode}`)
      }
    })

    test(`grid in ${theme}: edit mode off`, async ({ page }) => {
      await openGrid(page, theme)
      await expectClean(page, `grid, ${theme}, idle`)
    })

    test(`grid in ${theme}: locked`, async ({ page }) => {
      await openGrid(page, theme, '&locked')
      await expectClean(page, `grid, ${theme}, locked`)
    })

    test(`grid in ${theme}: editing`, async ({ page }) => {
      await openGrid(page, theme)
      await page.evaluate(() => { document.getElementById('g').editing = true })
      await settle(page)
      await expectClean(page, `grid, ${theme}, editing`)
    })

    test(`grid in ${theme}: a tile held`, async ({ page }) => {
      await openGrid(page, theme)
      await page.evaluate(() => { document.getElementById('g').editing = true })
      await settle(page)
      await page.locator('ts-grid .chrome[data-id="notes"] .handle').focus()
      await page.keyboard.press('Space')
      await expect(page.locator('ts-grid .sr')).toContainText('picked up')
      await expectClean(page, `grid, ${theme}, held`)
      await page.keyboard.press('Escape')
    })

    test(`grid in ${theme}: the undo toast and the Add back list`, async ({ page }) => {
      await openGrid(page, theme)
      await page.evaluate(() => { document.getElementById('g').editing = true })
      await settle(page)
      await page.locator('ts-grid .chrome[data-id="tasks"] .remove').click()
      await expect(page.locator('ts-grid .toast')).toHaveClass(/on/)
      await expectClean(page, `grid, ${theme}, toast`)
      await page.locator('ts-grid .pill .add').click()
      await expect(page.locator('ts-grid .pill .menu')).toBeVisible()
      await expectClean(page, `grid, ${theme}, Add back list`)
    })

    test(`grid in ${theme}: after Done`, async ({ page }) => {
      await openGrid(page, theme)
      await page.evaluate(() => { document.getElementById('g').editing = true })
      await settle(page)
      await page.evaluate(() => { document.getElementById('g').editing = false })
      await settle(page)
      await expectClean(page, `grid, ${theme}, after Done`)
    })
  }

  test('theme islands', async ({ page }) => {
    await page.goto('/test/browser/fixtures/islands.html')
    await page.waitForFunction(() => window.__ready === true)
    await settle(page)
    await expectClean(page, 'islands')
  })
})
