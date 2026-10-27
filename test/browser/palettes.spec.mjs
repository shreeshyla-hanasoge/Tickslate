// Palettes and the high contrast preference in a real cascade (RFC 0003 §13.2,
// §13.3, Decision 35): data-ts-palette on the element, on an ancestor, and beside a
// preset; light, dark and data-theme="auto"; and prefers-contrast: more, with and
// without a preset. Plain elements are enough, since only computed custom
// properties are read. The fixture links tokens.css and every preset file.
import { test, expect } from '@playwright/test'

const PAGE = '/test/browser/fixtures/presets.html'

// [--ts-profit, --ts-loss, --ts-accent] per palette and mode; the values of tokens.css.
const PALETTE = {
  cvd: { light: ['#1D4ED8', '#C2410C', '#7C10A3'], dark: ['#60A5FA', '#FB923C', '#EBB2FF'] },
  'red-up': { light: ['#C0362C', '#0E7A4E', '#2C52C4'], dark: ['#FB7185', '#34D399', '#818CF8'] },
}
// The calm preset's own profit, loss and accent, which a palette on the same element replaces.
const CALM = { light: ['#047857', '#BE123C', '#3558D6'], dark: ['#34D399', '#FB7185', '#7AA2FF'] }

const TOKENS = ['--ts-profit', '--ts-loss', '--ts-accent']

/** Writes the markup, then reads the named tokens (upper-case hex) on #target. */
async function read(page, html, tokens = TOKENS) {
  await page.evaluate((markup) => { document.getElementById('stage').innerHTML = markup }, html)
  return page.evaluate((names) => {
    const cs = getComputedStyle(document.getElementById('target'))
    return names.map((p) => cs.getPropertyValue(p).trim().toUpperCase())
  }, tokens)
}

test.beforeEach(async ({ page }) => {
  await page.goto(PAGE)
})

for (const [name, look] of Object.entries(PALETTE)) {
  test.describe(`data-ts-palette="${name}"`, () => {
    const el = (attrs = '') => `<div id="target" data-ts-palette="${name}" ${attrs}></div>`

    test('sets its colours in light mode, whatever the OS prefers', async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark' })
      expect(await read(page, el())).toEqual(look.light)
    })

    test('has a dark variant: data-theme="dark" on the element, a .dark ancestor, data-theme="dark" on an ancestor', async ({ page }) => {
      expect(await read(page, el('data-theme="dark"'))).toEqual(look.dark)
      expect(await read(page, `<div class="dark">${el()}</div>`)).toEqual(look.dark)
      expect(await read(page, `<div data-theme="dark"><section>${el()}</section></div>`)).toEqual(look.dark)
    })

    test('follows the OS under data-theme="auto"', async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark' })
      expect(await read(page, el('data-theme="auto"'))).toEqual(look.dark)
      expect(await read(page, `<div data-theme="auto">${el()}</div>`)).toEqual(look.dark)
      await page.emulateMedia({ colorScheme: 'light' })
      expect(await read(page, el('data-theme="auto"'))).toEqual(look.light)
    })

    test('a data-theme="light" island inside a dark page gets the light values, on the element or above it', async ({ page }) => {
      expect(await read(page, `<div class="dark">${el('data-theme="light"')}</div>`)).toEqual(look.light)
      expect(await read(page, `<div class="dark"><div data-theme="light">${el()}</div></div>`)).toEqual(look.light)
    })

    test('a dark island inside a light page is dark, even with data-theme="light" on the root (as in the gallery)', async ({ page }) => {
      expect(await read(page, `<div data-theme="light">${el('data-theme="dark"')}</div>`)).toEqual(look.dark)
      expect(await read(page, `<div data-theme="light"><div class="dark">${el()}</div></div>`)).toEqual(look.dark)
    })

    test('survives a themed island below it: data-theme="dark", .dark, data-theme="light", data-theme="auto"', async ({ page }) => {
      const wrap = (inner) => `<div data-ts-palette="${name}">${inner}</div>`
      expect(await read(page, wrap('<div id="target" data-theme="dark"></div>'))).toEqual(look.dark)
      expect(await read(page, wrap('<div id="target" class="dark"></div>'))).toEqual(look.dark)
      expect(await read(page, wrap('<div id="target" data-theme="light"></div>'))).toEqual(look.light)
      expect(await read(page, wrap('<div data-theme="dark"><section id="target"></section></div>'))).toEqual(look.dark)
      // The palette sits on a page that is itself dark, and the island is light.
      expect(await read(page, `<div class="dark" data-ts-palette="${name}"><div id="target" data-theme="light"></div></div>`)).toEqual(look.light)
      // Islands inside islands: the nearest decides.
      expect(await read(page, wrap('<div data-theme="dark"><div id="target" data-theme="light"></div></div>'))).toEqual(look.light)
      expect(await read(page, wrap('<div data-theme="light"><div id="target" class="dark"></div></div>'))).toEqual(look.dark)
      await page.emulateMedia({ colorScheme: 'dark' })
      expect(await read(page, wrap('<div id="target" data-theme="auto"></div>'))).toEqual(look.dark)
      await page.emulateMedia({ colorScheme: 'light' })
      expect(await read(page, wrap('<div id="target" data-theme="auto"></div>'))).toEqual(look.light)
    })

    test('survives a themed custom element below it (a ts-grid)', async ({ page }) => {
      expect(await read(page, `<div data-ts-palette="${name}"><ts-grid id="target" data-theme="dark"></ts-grid></div>`)).toEqual(look.dark)
      expect(await read(page, `<div data-ts-palette="${name}"><ts-grid id="target" data-theme="light"></ts-grid></div>`)).toEqual(look.light)
    })

    test('a preset on the island keeps the island, as for any ancestor palette (documented)', async ({ page }) => {
      expect(await read(page, `<div data-ts-palette="${name}"><div id="target" data-ts-theme="calm" data-theme="dark"></div></div>`)).toEqual(CALM.dark)
    })

    test('is inherited by an element below it', async ({ page }) => {
      expect(await read(page, `<div data-ts-palette="${name}"><div id="target"></div></div>`)).toEqual(look.light)
    })

    test('wins over a preset on the same element, in light and dark', async ({ page }) => {
      expect(await read(page, el('data-ts-theme="calm"'))).toEqual(look.light)
      expect(await read(page, el('data-ts-theme="calm" data-theme="dark"'))).toEqual(look.dark)
      expect(await read(page, `<div class="dark">${el('data-ts-theme="calm"')}</div>`)).toEqual(look.dark)
      await page.emulateMedia({ colorScheme: 'dark' })
      expect(await read(page, el('data-ts-theme="calm" data-theme="auto"'))).toEqual(look.dark)
    })

    test('leaves the rest of the preset alone beside it', async ({ page }) => {
      // calm's page colour is not a palette token, so it stays calm's.
      expect(await read(page, el('data-ts-theme="calm"'), ['--ts-bg'])).toEqual(['#EEF2F8'])
      expect(await read(page, el('data-ts-theme="calm" data-theme="dark"'), ['--ts-bg'])).toEqual(['#0B111C'])
    })

    test('does not win over a preset when it sits on an ancestor (documented)', async ({ page }) => {
      const html = `<div data-ts-palette="${name}"><div id="target" data-ts-theme="calm"></div></div>`
      expect(await read(page, html)).toEqual(CALM.light)
      expect(await read(page, `<div data-ts-palette="${name}"><div id="target" data-ts-theme="calm" data-theme="dark"></div></div>`)).toEqual(CALM.dark)
    })
  })
}

test('the nearer of two nested palettes decides, through an island too', async ({ page }) => {
  const inner = (outer, near) => `<div data-ts-palette="${outer}"><div data-ts-palette="${near}"><div id="target" data-theme="dark"></div></div></div>`
  expect(await read(page, inner('cvd', 'red-up'))).toEqual(PALETTE['red-up'].dark)
  expect(await read(page, inner('red-up', 'cvd'))).toEqual(PALETTE.cvd.dark)
})

test('the palette moves --ts-focus with the accent', async ({ page }) => {
  expect(await read(page, '<div id="target" data-ts-palette="cvd"></div>', ['--ts-focus', '--ts-accent', '--ts-series-1']))
    .toEqual(['#7C10A3', '#7C10A3', '#7C10A3'])
  expect(await read(page, '<div id="target" data-ts-palette="cvd" data-ts-theme="calm"></div>', ['--ts-focus', '--ts-accent']))
    .toEqual(['#7C10A3', '#7C10A3'])
})

// ---------------------------------------------------------------- prefers-contrast: more

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const PAIR = ['--ts-line', '--ts-muted', '--ts-surface', '--ts-bg']

/** Engines that cannot emulate the feature skip, so a pass always means it was exercised. */
async function emulateMore(page) {
  await page.emulateMedia({ contrast: 'more' })
  // Firefox keeps the root's old custom properties after a media change; a reload applies them.
  await page.reload()
  // Ask the stylesheet engine, not matchMedia: Firefox answers matchMedia under emulation
  // but does not apply @media (prefers-contrast: more) rules to CSS.
  const on = await page.evaluate(() => {
    const style = document.createElement('style')
    style.textContent = '#probe-more { color: rgb(1, 2, 3) } @media (prefers-contrast: more) { #probe-more { color: rgb(4, 5, 6) } }'
    const probe = document.createElement('i')
    probe.id = 'probe-more'
    document.head.append(style)
    document.body.append(probe)
    const applied = getComputedStyle(probe).color === 'rgb(4, 5, 6)'
    style.remove()
    probe.remove()
    return applied
  })
  test.skip(!on, 'this engine does not apply @media (prefers-contrast: more) to CSS under emulation')
}

const SETUPS = {
  'the default tokens, light': '<div id="target"></div>',
  'the default tokens, dark': '<div id="target" data-theme="dark"></div>',
  'a .dark ancestor': '<div class="dark"><div id="target"></div></div>',
  'data-theme="auto" under a dark OS': '<div id="target" data-theme="auto"></div>',
  'calm, light': '<div id="target" data-ts-theme="calm"></div>',
  'calm, dark': '<div id="target" data-ts-theme="calm" data-theme="dark"></div>',
  'calm, auto under a dark OS': '<div id="target" data-ts-theme="calm" data-theme="auto"></div>',
  'neutral, dark': '<div id="target" data-ts-theme="neutral" data-theme="dark"></div>',
  'signal, light': '<div id="target" data-ts-theme="signal"></div>',
  'signal, dark': '<div id="target" data-ts-theme="signal" data-theme="dark"></div>',
  'terminal, light': '<div id="target" data-ts-theme="terminal"></div>',
  'terminal, dark': '<div id="target" data-ts-theme="terminal" data-theme="dark"></div>',
  'paper': '<div id="target" data-ts-theme="paper"></div>',
  'graphite': '<div id="target" data-ts-theme="graphite"></div>',
  'a palette beside a preset': '<div id="target" data-ts-theme="calm" data-ts-palette="cvd" data-theme="dark"></div>',
}

test.describe('prefers-contrast: more', () => {
  for (const [label, html] of Object.entries(SETUPS)) {
    test(`raises line to 3:1 and muted to 7:1 on the surface: ${label}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark' })
      const [lineBefore, mutedBefore] = await read(page, html, PAIR)
      await emulateMore(page)
      const [line, muted, surface, bg] = await read(page, html, PAIR)
      // A preset whose muted already reaches 7:1 (signal, light) keeps it; line always moves.
      expect(line).not.toBe(lineBefore)
      expect(ratio(muted, surface)).toBeGreaterThanOrEqual(ratio(mutedBefore, surface))
      expect(ratio(line, surface)).toBeGreaterThanOrEqual(3)
      expect(ratio(muted, surface)).toBeGreaterThanOrEqual(7)
      expect(ratio(muted, bg)).toBeGreaterThanOrEqual(7)
    })
  }

  test('the default tokens use the documented values', async ({ page }) => {
    await emulateMore(page)
    expect(await read(page, '<div id="target"></div>', ['--ts-line', '--ts-muted'])).toEqual(['#8A8374', '#4A463E'])
    expect(await read(page, '<div id="target" data-theme="dark"></div>', ['--ts-line', '--ts-muted'])).toEqual(['#6B7280', '#D1D5DB'])
  })

  test('a light island inside a dark page gets the light pair', async ({ page }) => {
    await emulateMore(page)
    expect(await read(page, '<div class="dark"><div id="target" data-theme="light"></div></div>', ['--ts-line', '--ts-muted'])).toEqual(['#8A8374', '#4A463E'])
  })

  test('without the preference nothing changes', async ({ page }) => {
    await page.emulateMedia({ contrast: 'no-preference' })
    expect(await read(page, '<div id="target"></div>', ['--ts-line', '--ts-muted'])).toEqual(['#E2DACB', '#6A655B'])
  })

  test('a palette keeps its colours under the preference', async ({ page }) => {
    await emulateMore(page)
    expect(await read(page, '<div id="target" data-ts-palette="cvd"></div>')).toEqual(PALETTE.cvd.light)
  })
})
