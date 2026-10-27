// The phone top strip in real engines (RFC 0003 §19): up to three tiles pinned
// in a sticky row at 2 columns, pinned and unpinned in edit mode, reordered by
// key, gone at 3 or 4 columns, mirrored in RTL, first in Tab order, and axe-clean.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const PAGE = '/test/browser/fixtures/strip.html'
const PHONE = { width: 390, height: 844 }
const DESKTOP = { width: 1100, height: 800 }

let errors
test.beforeEach(async ({ page }) => {
  errors = []
  await page.context().route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname), (route) => route.abort())
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()))
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize(PHONE)
})
test.afterEach(() => {
  expect(errors).toEqual([])
})

const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))

async function load(page, query = '') {
  await page.goto(`${PAGE}${query}`)
  await page.waitForFunction(() => window.__ready === true)
  await settle(page)
}
// Slots take a new order at Done, not mid-edit, so the flat tree is read after it.
async function done(page) {
  await page.evaluate(() => { document.getElementById('g').editing = false })
  await settle(page)
}
async function edit(page) {
  await page.evaluate(() => { document.getElementById('g').editing = true })
  await settle(page)
}

const stripIds = (page) => page.evaluate(() => {
  const g = document.getElementById('g')
  return [...g.shadowRoot.querySelectorAll('.strip > slot')].flatMap((slot) => slot.assignedElements().map((el) => el.getAttribute('item')))
})
const saved = (page) => page.evaluate(() => document.getElementById('g').layout.topStrip)
const events = (page) => page.evaluate(() => window.__events)
const tile = (page, id) => page.locator(`#g > [item="${id}"]`)
const rect = (page, id) => tile(page, id).evaluate((el) => {
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, w: r.width, h: r.height }
})
const chrome = (page, id, part) => page.locator(`ts-grid .chrome[data-id="${id}"] .${part}`)
const status = (page) => page.locator('ts-grid .sr')

test.describe('the strip at 2 columns', () => {
  test('shows the pinned tiles in one row at their S variant, apart from the board', async ({ page }) => {
    await load(page)
    expect(await page.evaluate(() => document.getElementById('g').columns)).toBe(2)
    expect(await stripIds(page)).toEqual(['alpha', 'beta', 'gamma'])
    const boxes = await Promise.all(['alpha', 'beta', 'gamma'].map((id) => rect(page, id)))
    expect(boxes[0].w).toBeCloseTo(boxes[1].w, 1)
    expect(boxes[1].w).toBeCloseTo(boxes[2].w, 1)
    expect(boxes[0].h).toBe(150)
    // One row, left to right in strip order.
    expect(boxes[0].y).toBeCloseTo(boxes[1].y, 1)
    expect(boxes[0].x).toBeLessThan(boxes[1].x)
    expect(boxes[1].x).toBeLessThan(boxes[2].x)
    for (const id of ['alpha', 'beta', 'gamma']) expect(await tile(page, id).getAttribute('size')).toBe('S')
    // The board starts below the strip, and holds the others at their phone variants.
    const delta = await rect(page, 'delta')
    expect(delta.y).toBeGreaterThanOrEqual(boxes[0].y + 150)
    expect(await tile(page, 'delta').getAttribute('size')).toBe('M')
    expect(await tile(page, 'epsilon').getAttribute('size')).toBe('Wide')
  })

  test('is sticky: it stays at --ts-strip-top while the page scrolls', async ({ page }) => {
    await load(page)
    await page.evaluate(() => window.scrollTo(0, 400))
    await settle(page)
    expect((await rect(page, 'alpha')).y).toBeCloseTo(0, 0)
    expect((await rect(page, 'gamma')).y).toBeCloseTo(0, 0)
    await load(page, '?top=48px')
    await page.evaluate(() => window.scrollTo(0, 400))
    await settle(page)
    expect((await rect(page, 'beta')).y).toBeCloseTo(48, 0)
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('g').shadowRoot.querySelector('.strip')).position)).toBe('sticky')
  })

  test('is a labelled region with no pinned tiles when none are pinned', async ({ page }) => {
    await load(page)
    await expect(page.locator('ts-grid .strip')).toHaveAttribute('aria-label', 'Pinned to the top')
    await load(page, '?strip=none')
    await expect(page.locator('ts-grid .strip')).toBeHidden()
    expect(await stripIds(page)).toEqual([])
  })

  test('comes first in reading order and in Tab order', async ({ page }) => {
    await load(page, '?strip=gamma,alpha')
    expect(await page.evaluate(() => [...document.getElementById('g').readingOrder].slice(0, 2))).toEqual(['gamma', 'alpha'])
    await page.evaluate(() => {
      document.body.insertAdjacentHTML('afterbegin', '<button id="before" type="button">Before</button>')
      document.querySelectorAll('#g > [item]').forEach((el) => el.setAttribute('tabindex', '0'))
      window.scrollTo(0, 0)
      document.getElementById('before').focus()
    })
    const seen = []
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab')
      const id = await page.evaluate(() => document.activeElement.getAttribute('item'))
      // The grid's own Edit layout button is the first stop, and is no tile.
      if (id) seen.push(id)
    }
    seen.length = 4
    // The strip tiles in strip order, then the board's first.
    expect(seen).toEqual(['gamma', 'alpha', 'beta', 'delta'])
  })

  test('leaves the strip at 3 or 4 columns, keeps topStrip, and brings it back', async ({ page }) => {
    await load(page)
    await page.setViewportSize(DESKTOP)
    await settle(page)
    expect(await page.evaluate(() => document.getElementById('g').columns)).toBe(3)
    await expect(page.locator('ts-grid .strip')).toBeHidden()
    expect(await stripIds(page)).toEqual([])
    expect(await saved(page)).toEqual(['alpha', 'beta', 'gamma'])
    // Back on the board at their layout sizes.
    expect(await tile(page, 'alpha').getAttribute('size')).toBe('M')
    expect(await tile(page, 'beta').getAttribute('size')).toBe('Wide')
    await expect(chrome(page, 'alpha', 'pin')).toBeHidden()
    await page.setViewportSize(PHONE)
    await settle(page)
    await expect(page.locator('ts-grid .strip')).toBeVisible()
    expect(await stripIds(page)).toEqual(['alpha', 'beta', 'gamma'])
    expect(await tile(page, 'alpha').getAttribute('size')).toBe('S')
  })

  test('mirrors under dir=rtl: the first pinned tile is at the right', async ({ page }) => {
    await load(page, '?dir=rtl')
    const [a, b, c] = await Promise.all(['alpha', 'beta', 'gamma'].map((id) => rect(page, id)))
    expect(a.x).toBeGreaterThan(b.x)
    expect(b.x).toBeGreaterThan(c.x)
    expect(a.x + a.w).toBeCloseTo(390 - 16, 0)
    expect(await page.evaluate(() => [...document.getElementById('g').readingOrder].slice(0, 3))).toEqual(['alpha', 'beta', 'gamma'])
  })
})

test.describe('editing the strip', () => {
  test('Pin and Unpin are 44px sibling buttons that are not tab stops, and exist at 2 columns only', async ({ page }) => {
    await load(page)
    await edit(page)
    for (const [id, name] of [['alpha', 'Unpin Alpha'], ['delta', 'Pin Delta to the top']]) {
      const pin = chrome(page, id, 'pin')
      await expect(pin).toHaveAttribute('aria-label', name)
      await expect(pin).toHaveAttribute('tabindex', '-1')
      const box = await pin.boundingBox()
      expect(box.width).toBeCloseTo(44, 0)
      expect(box.height).toBeCloseTo(44, 0)
      expect(await pin.evaluate((b) => b.parentElement === b.closest('.chrome') && b.previousElementSibling.classList.contains('resize'))).toBe(true)
    }
    await page.setViewportSize(DESKTOP)
    await settle(page)
    await expect(chrome(page, 'delta', 'pin')).toBeHidden()
  })

  test('pins and unpins by button, refuses a fourth, and each change is a strip event and an undo step', async ({ page }) => {
    await load(page)
    await edit(page)
    await chrome(page, 'delta', 'pin').click()
    await settle(page)
    expect(await saved(page)).toEqual(['alpha', 'beta', 'gamma'])
    await expect(status(page)).toHaveText('The top strip is full. Unpin a tile first.')
    expect(await events(page)).toEqual([])

    await chrome(page, 'beta', 'pin').click()
    await settle(page)
    expect(await saved(page)).toEqual(['alpha', 'gamma'])
    expect(await stripIds(page)).toEqual(['alpha', 'gamma'])
    expect(await tile(page, 'beta').getAttribute('size')).toBe('Wide')

    await chrome(page, 'delta', 'pin').click()
    await settle(page)
    expect(await saved(page)).toEqual(['alpha', 'gamma', 'delta'])
    expect((await events(page)).map((e) => [e.reason, e.id])).toEqual([['strip', 'beta'], ['strip', 'delta']])

    // Undo takes the pins back, newest first.
    await page.evaluate(() => document.getElementById('g').undo())
    await settle(page)
    expect(await saved(page)).toEqual(['alpha', 'gamma'])
    await page.evaluate(() => document.getElementById('g').undo())
    await settle(page)
    expect(await saved(page)).toEqual(['alpha', 'beta', 'gamma'])
    await done(page)
    expect(await stripIds(page)).toEqual(['alpha', 'beta', 'gamma'])
  })

  test('keeps focus on the button after pinning, and the chrome follows its tile', async ({ page }) => {
    await load(page, '?strip=alpha')
    await edit(page)
    await chrome(page, 'delta', 'pin').focus()
    await page.keyboard.press('Enter')
    await settle(page)
    await expect(chrome(page, 'delta', 'pin')).toBeFocused()
    await expect(chrome(page, 'delta', 'pin')).toHaveAttribute('aria-label', 'Unpin Delta')
    expect(await page.evaluate(() => !!document.getElementById('g').shadowRoot.querySelector('.strip .chrome[data-id="delta"]'))).toBe(true)
  })

  test('reorders inside the strip with the keyboard, and the arrows stop at its ends', async ({ page }) => {
    await load(page)
    await edit(page)
    await chrome(page, 'alpha', 'handle').focus()
    await page.keyboard.press('Space')
    await page.keyboard.press('ArrowRight')
    await expect(status(page)).toContainText('moved to position 2 of 3')
    await page.keyboard.press('ArrowDown')
    await expect(status(page)).toHaveText("Can't move further.")
    await page.keyboard.press('Space')
    await settle(page)
    expect(await saved(page)).toEqual(['beta', 'alpha', 'gamma'])
    const ev = await events(page)
    expect(ev.map((e) => [e.reason, e.id])).toEqual([['strip', 'alpha']])
    const [b, a] = await Promise.all([rect(page, 'beta'), rect(page, 'alpha')])
    expect(b.x).toBeLessThan(a.x)
    // The board's own order is untouched.
    expect(ev[0].order).toEqual(['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta'])
    await page.keyboard.press('Control+z')
    await settle(page)
    expect(await saved(page)).toEqual(['alpha', 'beta', 'gamma'])
    await done(page)
    expect(await stripIds(page)).toEqual(['alpha', 'beta', 'gamma'])
  })

  test('reorders by tap-to-place, and a tap on the board is refused', async ({ page }) => {
    await load(page)
    await edit(page)
    await chrome(page, 'gamma', 'handle').click()
    await chrome(page, 'delta', 'handle').click()
    await expect(status(page)).toHaveText("Can't move further.")
    await chrome(page, 'alpha', 'handle').click()
    await settle(page)
    expect(await saved(page)).toEqual(['gamma', 'alpha', 'beta'])
  })

  test('reorders by dragging, mirrored under rtl too', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit' && !test.info().project.use.hasTouch, 'pointer drag is checked on the other engines')
    for (const dir of ['', '?dir=rtl']) {
      await load(page, dir)
      await edit(page)
      const from = await chrome(page, 'alpha', 'handle').boundingBox()
      const to = await chrome(page, 'gamma', 'handle').boundingBox()
      const mx = from.x + from.width / 2
      const my = from.y + from.height / 2
      await page.mouse.move(mx, my)
      await page.mouse.down()
      await page.mouse.move(mx + (to.x - from.x) / 2, my + 3, { steps: 5 })
      await page.mouse.move(to.x + to.width / 2, my + 3, { steps: 8 })
      await settle(page)
      await page.mouse.up()
      await settle(page)
      expect(await saved(page)).toEqual(['beta', 'gamma', 'alpha'])
    }
  })

  test('removing a pinned tile takes it out of the strip and Undo puts it back', async ({ page }) => {
    await load(page)
    await edit(page)
    await chrome(page, 'beta', 'remove').click()
    await settle(page)
    expect(await saved(page)).toEqual(['alpha', 'gamma'])
    await page.evaluate(() => document.getElementById('g').undo())
    await settle(page)
    expect(await saved(page)).toEqual(['alpha', 'beta', 'gamma'])
    await done(page)
    expect(await stripIds(page)).toEqual(['alpha', 'beta', 'gamma'])
  })
})

test.describe('setTopStrip', () => {
  test('pins at most three, returns false when nothing changed, and fires the strip reason', async ({ page }) => {
    await load(page, '?strip=none')
    expect(await page.evaluate(() => document.getElementById('g').setTopStrip([]))).toBe(false)
    expect(await page.evaluate(() => document.getElementById('g').setTopStrip(['eta', 'zeta', 'nope', 'eta', 'delta', 'alpha']))).toBe(true)
    await settle(page)
    expect(await saved(page)).toEqual(['eta', 'zeta', 'delta'])
    expect(await stripIds(page)).toEqual(['eta', 'zeta', 'delta'])
    expect(await page.evaluate(() => document.getElementById('g').setTopStrip(['eta', 'zeta', 'delta']))).toBe(false)
    expect(await page.evaluate(() => document.getElementById('g').setTopStrip(['zeta']))).toBe(true)
    await settle(page)
    expect(await stripIds(page)).toEqual(['zeta'])
    expect((await events(page)).map((e) => e.reason)).toEqual(['strip', 'strip'])
    // A lone pinned tile fills the row.
    expect((await rect(page, 'zeta')).w).toBeCloseTo(358, 0)
  })
})

test.describe('keys', () => {
  test('P pins and unpins the focused tile, and says so; a fourth pin says the strip is full', async ({ page }) => {
    await load(page, '?strip=alpha,beta')
    await edit(page)
    await chrome(page, 'delta', 'handle').focus()
    await page.keyboard.press('p')
    await settle(page)
    expect(await saved(page)).toEqual(['alpha', 'beta', 'delta'])
    await expect(status(page)).toHaveText('Delta pinned to the top.')
    await expect(chrome(page, 'delta', 'handle')).toBeFocused()
    await page.keyboard.press('Shift+P')
    await settle(page)
    expect(await saved(page)).toEqual(['alpha', 'beta'])
    await expect(status(page)).toHaveText('Delta unpinned.')
    await page.keyboard.press('p')
    await chrome(page, 'zeta', 'handle').focus()
    await page.keyboard.press('p')
    await settle(page)
    await expect(status(page)).toContainText('The top strip is full. Unpin a tile first.')
    expect((await events(page)).map((e) => [e.reason, e.id])).toEqual([['strip', 'delta'], ['strip', 'delta'], ['strip', 'delta']])
    // Each step is one undo.
    await page.evaluate(() => document.getElementById('g').undo())
    await settle(page)
    expect(await saved(page)).toEqual(['alpha', 'beta'])
  })

  test('P also acts on a held tile, and ignores Ctrl and Meta', async ({ page }) => {
    await load(page)
    await edit(page)
    await chrome(page, 'beta', 'handle').focus()
    await page.keyboard.press('Control+p')
    await settle(page)
    expect(await saved(page)).toEqual(['alpha', 'beta', 'gamma'])
    await page.keyboard.press('Space')
    await page.keyboard.press('p')
    await settle(page)
    expect(await saved(page)).toEqual(['alpha', 'gamma'])
    // The pick-up and the cancelled move were spoken in the same frame.
    await expect(status(page)).toContainText('Beta unpinned.')
  })

  test('the arrows are mirrored under dir=rtl while reordering the strip', async ({ page }) => {
    await load(page, '?dir=rtl')
    await edit(page)
    await chrome(page, 'alpha', 'handle').focus()
    await page.keyboard.press('Space')
    // Visually left is later in the strip when the first tile is at the right.
    await page.keyboard.press('ArrowRight')
    await expect(status(page)).toContainText("Can't move further.")
    await page.keyboard.press('ArrowLeft')
    await expect(status(page)).toContainText('moved to position 2 of 3')
    await page.keyboard.press('Space')
    await settle(page)
    expect(await saved(page)).toEqual(['beta', 'alpha', 'gamma'])
  })
})

test.describe('undo and pin slots', () => {
  test('a pin step is undone in its own profile, and a move step does not touch it', async ({ page }) => {
    await load(page, '?closed=1&strip=none')
    const result = await page.evaluate(async () => {
      const g = document.getElementById('g')
      const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      g.move('eta', 0)
      g.profile = 'closed'
      await frame()
      g.setTopStrip(['alpha', 'beta'])
      g.profile = 'market'
      await frame()
      const undone = g.undo()
      await frame()
      const market = g.layout.profiles.market.map((item) => item.id)
      g.profile = 'closed'
      await frame()
      const closedUndo = g.undo()
      await frame()
      return { undone, market, strip: g.layout.topStrip, closedUndo }
    })
    expect(result.undone).toBe(true)
    expect(result.market[0]).toBe('alpha')
    // The undo that is the strip's own restores the strip; the move's undo did not touch it.
    expect(result.closedUndo).toBe(true)
    expect(result.strip).toEqual([])
  })

  test('the move undone in market keeps closed\'s pins', async ({ page }) => {
    await load(page, '?closed=1&strip=none')
    await page.evaluate(async () => {
      const g = document.getElementById('g')
      const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      g.move('eta', 0)
      g.profile = 'closed'
      await frame()
      g.setTopStrip(['alpha', 'beta'])
      g.profile = 'market'
      await frame()
      g.undo()
      await frame()
    })
    expect(await saved(page)).toEqual(['alpha', 'beta'])
    expect(await page.evaluate(() => document.getElementById('g').layout.profiles.market.map((item) => item.id).indexOf('eta'))).toBe(6)
  })

  test('ids this profile does not show take no pin slot', async ({ page }) => {
    await load(page, '?closed=1&strip=omega,alpha,beta')
    // Omega is only in closed: two pinned tiles show, and a third pin is not refused.
    expect(await stripIds(page)).toEqual(['alpha', 'beta'])
    await edit(page)
    await chrome(page, 'delta', 'pin').click()
    await settle(page)
    expect(await stripIds(page)).toEqual(['alpha', 'beta', 'delta'])
    expect(await saved(page)).toEqual(['alpha', 'beta', 'delta', 'omega'])
    await chrome(page, 'zeta', 'pin').click()
    await settle(page)
    await expect(status(page)).toHaveText('The top strip is full. Unpin a tile first.')
  })

  test('setTopStrip counts what the grid shows and keeps the rest', async ({ page }) => {
    await load(page, '?closed=1&strip=omega,alpha')
    expect(await page.evaluate(() => document.getElementById('g').setTopStrip(['alpha', 'beta', 'gamma', 'delta']))).toBe(true)
    await settle(page)
    expect(await stripIds(page)).toEqual(['alpha', 'beta', 'gamma'])
    expect(await saved(page)).toEqual(['alpha', 'beta', 'gamma', 'omega'])
    expect(await page.evaluate(() => document.getElementById('g').setTopStrip(['alpha', 'beta', 'gamma']))).toBe(false)
    expect(await page.evaluate(() => document.getElementById('g').setTopStrip([]))).toBe(true)
    await settle(page)
    expect(await saved(page)).toEqual(['omega'])
  })
})

test.describe('widgets with no small size', () => {
  test('have no pin button, say so on P, and are ignored by setTopStrip', async ({ page }) => {
    await load(page, '?nosize=1')
    await edit(page)
    await expect(chrome(page, 'table', 'pin')).toBeHidden()
    await expect(chrome(page, 'delta', 'pin')).toBeVisible()
    await chrome(page, 'table', 'handle').focus()
    await page.keyboard.press('p')
    await expect(status(page)).toHaveText('This widget has no small size.')
    expect(await saved(page)).toEqual(['alpha', 'beta', 'gamma'])
    expect(await events(page)).toEqual([])
    expect(await page.evaluate(() => document.getElementById('g').setTopStrip(['table', 'alpha']))).toBe(true)
    expect(await saved(page)).toEqual(['alpha'])
  })

  test('stay on the board when a saved layout names one', async ({ page }) => {
    await load(page, '?nosize=1&strip=table,alpha')
    expect(await stripIds(page)).toEqual(['alpha'])
    expect(await saved(page)).toEqual(['table', 'alpha'])
    expect(await tile(page, 'table').getAttribute('size')).toBe('M')
    const box = await rect(page, 'table')
    expect(box.w).toBeGreaterThan(300)
    // Pinning another leaves the saved id where it is.
    await edit(page)
    await chrome(page, 'delta', 'pin').click()
    await settle(page)
    expect(await saved(page)).toEqual(['alpha', 'delta', 'table'])
  })
})

test.describe('axe and pictures', () => {
  for (const theme of ['light', 'dark']) {
    test(`axe is clean in ${theme}, editing or not`, async ({ page }) => {
      await load(page, `?theme=${theme}`)
      const check = async (what) => {
        const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
        const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
        expect(bad.map((v) => `${v.id}: ${v.help}`), what).toEqual([])
      }
      await check(`${theme}, not editing`)
      await edit(page)
      await check(`${theme}, editing`)
    })
  }

  // Run with STRIP_SHOTS=<directory> to write the pictures the story is judged by.
  for (const [name, query] of [['light', ''], ['dark', '?theme=dark'], ['rtl', '?dir=rtl'], ['dark-rtl', '?theme=dark&dir=rtl'], ['header', '?top=48px'], ['nosize', '?nosize=1&strip=table,alpha,beta']]) {
    test(`picture: ${name}`, async ({ page }) => {
      test.skip(!process.env.STRIP_SHOTS, 'only when STRIP_SHOTS is set')
      await load(page, query)
      await page.evaluate(() => window.scrollTo(0, 260))
      await settle(page)
      await page.screenshot({ path: `${process.env.STRIP_SHOTS}/${test.info().project.name}-${name}.png` })
      await edit(page)
      await page.screenshot({ path: `${process.env.STRIP_SHOTS}/${test.info().project.name}-${name}-editing.png` })
    })
  }
})
