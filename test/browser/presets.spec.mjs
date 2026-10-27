// How a theme preset meets tokens.css in a real cascade (RFC 0003 §13.1, Decision
// 35): the mode follows data-theme and dark ancestors with the island rule of
// tokens.css, a palette on the same element wins, and paper and graphite ignore
// data-theme. Plain elements are enough, since only computed custom properties
// are read. Colours are the ones in src/themes/presets/*.css and tokens.css.
import { test, expect } from '@playwright/test'

const PAGE = '/test/browser/fixtures/presets.html'

// [--ts-bg, --ts-profit, --ts-accent] per preset and mode, and the defaults a
// palette's tokens fall back to while the preset's guarded block is off.
const LOOK = {
  calm: { light: ['#EEF2F8', '#047857', '#3558D6'], dark: ['#0B111C', '#34D399', '#7AA2FF'] },
  terminal: { light: ['#EEF1F0', '#0F7A4A', '#1F5FD1'], dark: ['#05080C', '#3FD68F', '#5C9BFF'] },
}
const DEFAULT = { light: ['#F3EFE6', '#0E7A4E', '#2C52C4'], dark: ['#111827', '#34D399', '#818CF8'] }
const PAPER_BG = '#F3EFE6'
const GRAPHITE_BG = '#111827'

/** The three tokens on the element marked #target, as upper-case hex. */
async function read(page, html) {
  await page.evaluate((markup) => { document.getElementById('stage').innerHTML = markup }, html)
  return page.evaluate(() => {
    const cs = getComputedStyle(document.getElementById('target'))
    return ['--ts-bg', '--ts-profit', '--ts-accent'].map((p) => cs.getPropertyValue(p).trim().toUpperCase())
  })
}

test.beforeEach(async ({ page }) => {
  await page.goto(PAGE)
})

for (const [name, look] of Object.entries(LOOK)) {
  test.describe(name, () => {
    const el = (attrs = '') => `<div id="target" data-ts-theme="${name}" ${attrs}></div>`
    const wrap = (open, close, inner) => `${open}${inner}${close}`

    test('is light with nothing around it, whatever the OS prefers', async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark' })
      expect(await read(page, el())).toEqual(look.light)
    })

    test('is dark with data-theme="dark" on the element', async ({ page }) => {
      expect(await read(page, el('data-theme="dark"'))).toEqual(look.dark)
    })

    test('is dark under a .dark ancestor and under data-theme="dark" on an ancestor', async ({ page }) => {
      expect(await read(page, wrap('<div class="dark">', '</div>', el()))).toEqual(look.dark)
      expect(await read(page, wrap('<div data-theme="dark"><section>', '</section></div>', el()))).toEqual(look.dark)
    })

    test('follows the OS under data-theme="auto", on the element or an ancestor', async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark' })
      expect(await read(page, el('data-theme="auto"'))).toEqual(look.dark)
      expect(await read(page, wrap('<div data-theme="auto">', '</div>', el()))).toEqual(look.dark)
      await page.emulateMedia({ colorScheme: 'light' })
      expect(await read(page, el('data-theme="auto"'))).toEqual(look.light)
      expect(await read(page, wrap('<div data-theme="auto">', '</div>', el()))).toEqual(look.light)
    })

    test('stays light on a light island: on the element, and between it and a dark ancestor', async ({ page }) => {
      expect(await read(page, wrap('<div class="dark">', '</div>', el('data-theme="light"')))).toEqual(look.light)
      expect(await read(page, wrap('<div class="dark"><div data-theme="light">', '</div></div>', el()))).toEqual(look.light)
      expect(await read(page, wrap('<div data-theme="dark"><div><div data-theme="light">', '</div></div></div>', el()))).toEqual(look.light)
      // The same island under data-theme="auto" in a dark OS.
      await page.emulateMedia({ colorScheme: 'dark' })
      expect(await read(page, wrap('<div data-theme="auto"><div data-theme="light">', '</div></div>', el()))).toEqual(look.light)
      expect(await read(page, wrap('<div data-theme="auto">', '</div>', el('data-theme="light"')))).toEqual(look.light)
    })

    test('is dark on a dark island inside a light page, and on one inside a light island of a dark page', async ({ page }) => {
      expect(await read(page, wrap('<div data-theme="light"><div data-theme="dark">', '</div></div>', el()))).toEqual(look.dark)
      expect(await read(page, wrap('<div data-theme="light"><section class="dark">', '</section></div>', el()))).toEqual(look.dark)
      // A dark island inside a light island inside a dark page: the nearest one decides.
      expect(await read(page, wrap('<div class="dark"><div data-theme="light"><div data-theme="dark">', '</div></div></div>', el()))).toEqual(look.dark)
    })

    test('ignores a .dark class that is itself marked data-theme="light"', async ({ page }) => {
      expect(await read(page, wrap('<div class="dark" data-theme="light">', '</div>', el()))).toEqual(look.light)
    })

    test('keeps its other tokens but takes the palette profit and accent (or the default ones it leaves alone) when a palette is on the same element', async ({ page }) => {
      const [bg] = look.light
      const [lightBg, lightProfit, lightAccent] = await read(page, el('data-ts-palette="cvd"'))
      expect([lightBg, lightProfit, lightAccent]).toEqual([bg, '#1D4ED8', '#7C10A3'])
      // Dark: the preset's dark page, and the palette's dark values.
      const [darkBg, darkProfit, darkAccent] = await read(page, el('data-theme="dark" data-ts-palette="cvd"'))
      expect([darkBg, darkProfit, darkAccent]).toEqual([look.dark[0], '#60A5FA', '#EBB2FF'])
      // red-up swaps profit and loss and leaves the accent to tokens.css.
      expect(await read(page, wrap('<div class="dark">', '</div>', el('data-ts-palette="red-up"')))).toEqual([look.dark[0], '#FB7185', DEFAULT.dark[2]])
    })

    test('does not yield to a palette on an ancestor, which is documented', async ({ page }) => {
      expect(await read(page, wrap('<div data-ts-palette="cvd">', '</div>', el()))).toEqual(look.light)
    })
  })
}

test.describe('paper and graphite', () => {
  test('paper ignores data-theme and .dark: light everywhere', async ({ page }) => {
    const el = (attrs = '') => `<div id="target" data-ts-theme="paper" ${attrs}></div>`
    await page.emulateMedia({ colorScheme: 'dark' })
    expect((await read(page, el()))[0]).toBe(PAPER_BG)
    expect((await read(page, el('data-theme="dark"')))[0]).toBe(PAPER_BG)
    expect((await read(page, el('data-theme="auto"')))[0]).toBe(PAPER_BG)
    expect((await read(page, `<div class="dark"><div data-theme="dark">${el()}</div></div>`))[0]).toBe(PAPER_BG)
    expect(await read(page, `<div class="dark">${el()}</div>`)).toEqual(DEFAULT.light)
  })

  test('graphite ignores data-theme: dark everywhere', async ({ page }) => {
    const el = (attrs = '') => `<div id="target" data-ts-theme="graphite" ${attrs}></div>`
    expect((await read(page, el()))[0]).toBe(GRAPHITE_BG)
    expect((await read(page, el('data-theme="light"')))[0]).toBe(GRAPHITE_BG)
    expect((await read(page, `<div data-theme="light">${el()}</div>`))[0]).toBe(GRAPHITE_BG)
    expect(await read(page, el())).toEqual(['#111827', '#34D399', '#818CF8'])
  })
})
