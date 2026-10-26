// RFC 0004 §3 in real engines: the resize badge, the first-run hint and the calm profile switch.
// The default project config asks for reduced motion, so the suites that need motion turn it back on.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const PAGE = '/test/browser/fixtures/edit-feedback.html'
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']
// What each size reads as in the badge (RFC 0004 §3.1), from the messages and the nominal footprints.
const BADGE = { S: 'Small · 1×1', Wide: 'Wide · 2×1', Tall: 'Tall · 1×2', M: 'Medium · 2×2', L: 'Large · 3×2', Banner: 'Banner · 4×1', XL: 'Extra large · 4×2' }

let errors
test.beforeEach(async ({ page }) => {
  errors = []
  // Network off: only the dev server answers.
  await page.context().route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname), (route) => route.abort())
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()))
  page.on('pageerror', (error) => errors.push(error.message))
  // The animations the grid runs on its board, so a crossfade can be counted.
  await page.addInitScript(() => {
    window.__anims = []
    const animate = Element.prototype.animate
    Element.prototype.animate = function (keyframes, options) {
      if (this.classList && this.classList.contains('board')) window.__anims.push(JSON.stringify(keyframes))
      return animate.call(this, keyframes, options)
    }
  })
})
test.afterEach(() => {
  expect(errors).toEqual([])
})

const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
async function load(page, query = '') {
  await page.goto(`${PAGE}?${query}`)
  await page.waitForFunction(() => window.__ready === true)
  await settle(page)
}
const events = (page, type) => page.evaluate((t) => window.__events.filter((e) => !t || e.type === t), type)
const said = (page) => page.evaluate(() => window.__said)
const anims = (page) => page.evaluate(() => window.__anims)
const profile = (page) => page.evaluate(() => window.__fx.grid.profile)
const startEditing = async (page) => {
  await page.evaluate(() => { window.__fx.grid.editing = true })
  await settle(page)
}
const chrome = (page, id) => page.locator(`ts-grid .chrome[data-id="${id}"]`)
const badge = (page, id) => chrome(page, id).locator('.badge')
const coach = (page) => page.locator('ts-grid .coach')
const toast = (page) => page.locator('ts-grid .toast')
// Tile ids as they sit on screen: the ones with a box, in the order the grid placed them.
const onScreen = (page) => page.evaluate(() =>
  [...document.querySelectorAll('#g > [item]')]
    .filter((el) => el.getBoundingClientRect().width > 0 && el.style.display !== 'none')
    .map((el) => {
      const [x, y = 0] = el.style.translate.split(' ').map(parseFloat)
      return { id: el.getAttribute('item'), x, y }
    })
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((t) => t.id))
const sizeOf = (page, id) => page.evaluate((i) => document.querySelector(`#g > [item="${i}"]`).getAttribute('size'), id)

async function expectClean(page, what) {
  const { violations } = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()
  const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  const report = bad.map((v) => `${v.id} (${v.impact}): ${v.help}\n${v.nodes.slice(0, 3).map((n) => `  ${n.target.join(' ')}\n  ${n.failureSummary}`).join('\n')}`)
  expect(report, `${what}: axe violations`).toEqual([])
}

// A pointer drag on a tile's resize handle: down, a few moves, and the page held there until the caller releases.
async function dragResize(page, id, dy) {
  const handle = chrome(page, id).locator('.resize')
  await handle.scrollIntoViewIfNeeded()
  const box = await handle.boundingBox()
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y + dy / 2, { steps: 5 })
  await page.mouse.move(x, y + dy, { steps: 5 })
}

test.describe('the size badge', () => {
  test('shows during a pointer resize, follows the snapped size, and goes a second after release', async ({ page }) => {
    await load(page)
    await startEditing(page)
    await expect(badge(page, 'notes')).toBeHidden()
    await dragResize(page, 'notes', 170)
    await expect(badge(page, 'notes')).toBeVisible()
    const size = await sizeOf(page, 'notes')
    expect(size).not.toBe('S')
    await expect(badge(page, 'notes')).toHaveText(BADGE[size])
    // Decorative: hidden from assistive technology, in no live region, and a part a host can restyle.
    await expect(badge(page, 'notes')).toHaveAttribute('aria-hidden', 'true')
    await expect(badge(page, 'notes')).toHaveAttribute('part', 'badge')
    expect(await badge(page, 'notes').evaluate((el) => !!el.closest('[aria-live], [role="status"], [role="alert"]'))).toBe(false)
    // Held while the button is down, however long.
    await page.waitForTimeout(1300)
    await expect(badge(page, 'notes')).toBeVisible()
    const released = await page.evaluate(() => performance.now())
    await page.mouse.up()
    await settle(page)
    await page.waitForTimeout(500)
    await expect(badge(page, 'notes')).toBeVisible()
    await expect(badge(page, 'notes')).toBeHidden({ timeout: 2500 })
    const gone = await page.evaluate(() => performance.now())
    expect(gone - released).toBeGreaterThan(900)
    // Other tiles never got one.
    await expect(badge(page, 'tasks')).toBeHidden()
  })

  test('shows on a keyboard resize and is not read out: the status region says it, the badge does not', async ({ page }) => {
    await load(page)
    await startEditing(page)
    await chrome(page, 'notes').locator('.handle').focus()
    await page.keyboard.press('+')
    await settle(page)
    const size = await sizeOf(page, 'notes')
    expect(size).not.toBe('S')
    await expect(badge(page, 'notes')).toBeVisible()
    await expect(badge(page, 'notes')).toHaveText(BADGE[size])
    await expect(page.locator('ts-grid .sr')).toContainText(`Notes, size ${size}.`)
    expect((await said(page)).filter((s) => s.includes('Small') || s.includes('·'))).toEqual([])
    await expect(badge(page, 'notes')).toBeHidden({ timeout: 3000 })
  })

  test('a second key press keeps it up for another second', async ({ page }) => {
    await load(page)
    await startEditing(page)
    await chrome(page, 'notes').locator('.handle').focus()
    await page.keyboard.press('+')
    await page.waitForTimeout(700)
    await page.keyboard.press('+')
    await page.waitForTimeout(700)
    await expect(badge(page, 'notes')).toBeVisible()
    await expect(badge(page, 'notes')).toBeHidden({ timeout: 3000 })
  })

  test('a cancelled resize takes it away at once', async ({ page }) => {
    await load(page)
    await startEditing(page)
    await dragResize(page, 'notes', 170)
    await expect(badge(page, 'notes')).toBeVisible()
    await page.keyboard.press('Escape')
    await settle(page)
    await expect(badge(page, 'notes')).toBeHidden({ timeout: 500 })
    expect(await sizeOf(page, 'notes')).toBe('S')
    await page.mouse.up()
  })

  test('sits on the side away from the handle, and mirrors in a right-to-left page', async ({ page }) => {
    for (const rtl of [false, true]) {
      await load(page, rtl ? 'rtl' : '')
      await startEditing(page)
      await chrome(page, 'sales').locator('.handle').focus()
      await page.keyboard.press('+')
      await settle(page)
      await expect(badge(page, 'sales')).toBeVisible()
      const b = await badge(page, 'sales').boundingBox()
      const h = await chrome(page, 'sales').locator('.resize').boundingBox()
      const c = await chrome(page, 'sales').boundingBox()
      const centre = (r) => r.x + r.width / 2
      // The handle is at the inline end; the badge is at the inline start.
      if (rtl) {
        expect(centre(b), 'rtl badge').toBeGreaterThan(centre(c))
        expect(centre(h), 'rtl handle').toBeLessThan(centre(c))
      } else {
        expect(centre(b), 'ltr badge').toBeLessThan(centre(c))
        expect(centre(h), 'ltr handle').toBeGreaterThan(centre(c))
      }
      const overlap = Math.min(b.x + b.width, h.x + h.width) - Math.max(b.x, h.x)
      expect(overlap, 'never under the handle').toBeLessThanOrEqual(0)
    }
  })

  test('leaves layout when it goes, and is gone after Done', async ({ page }) => {
    await load(page)
    await startEditing(page)
    await chrome(page, 'notes').locator('.handle').focus()
    await page.keyboard.press('+')
    await expect(badge(page, 'notes')).toBeVisible()
    await page.evaluate(() => { window.__fx.grid.editing = false })
    await settle(page)
    expect(await badge(page, 'notes').evaluate((el) => el.hidden)).toBe(true)
  })
})

test.describe('the size badge with motion', () => {
  test.use({ reducedMotion: 'no-preference' })

  test('fades out after its second, and is then out of layout', async ({ page }) => {
    await load(page)
    await startEditing(page)
    await chrome(page, 'notes').locator('.handle').focus()
    await page.keyboard.press('+')
    await expect(badge(page, 'notes')).toBeVisible()
    // Just past the second the fade is under way: partly transparent, not yet hidden.
    await page.waitForTimeout(1080)
    const opacity = await badge(page, 'notes').evaluate((el) => (el.hidden ? 'gone' : Number(getComputedStyle(el).opacity)))
    expect(opacity === 'gone' || opacity < 1).toBe(true)
    await expect(badge(page, 'notes')).toBeHidden({ timeout: 1500 })
    expect(await badge(page, 'notes').evaluate((el) => getComputedStyle(el).display)).toBe('none')
  })
})

test.describe('the first-run hint', () => {
  test('shows for a populated grid, points at the first tile and is a note, not a live region', async ({ page }) => {
    await load(page, 'hint')
    await expect(coach(page)).toBeVisible()
    await expect(coach(page)).toHaveAttribute('role', 'note')
    await expect(coach(page)).toHaveAttribute('part', 'hint')
    expect(await coach(page).evaluate((el) => !!el.closest('[aria-live], [role="status"], [role="alert"]') || el.hasAttribute('aria-live'))).toBe(false)
    const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches)
    await expect(coach(page).locator('.coach-text')).toHaveText(coarse
      ? 'Touch and hold a tile to rearrange your dashboard'
      : 'Press and hold a tile, or choose Edit layout, to rearrange your dashboard')
    const ok = coach(page).locator('.coach-ok')
    await expect(ok).toHaveText('Got it')
    await expect(ok).toHaveAttribute('part', 'hint-dismiss')
    const target = await ok.boundingBox()
    expect(target.width).toBeGreaterThanOrEqual(44)
    expect(target.height).toBeGreaterThanOrEqual(44)
    // At the first tile in visual order: it spans some of its inline range, and sits under it or over its lower part.
    const first = (await page.evaluate(() => window.__fx.grid.readingOrder))[0]
    const tile = await page.locator(`#g > [item="${first}"]`).boundingBox()
    const card = await coach(page).boundingBox()
    expect(Math.min(card.x + card.width, tile.x + tile.width) - Math.max(card.x, tile.x)).toBeGreaterThan(0)
    const over = await coach(page).evaluate((el) => el.classList.contains('over'))
    if (over) expect(card.y).toBeGreaterThanOrEqual(tile.y - 1)
    else expect(card.y).toBeGreaterThanOrEqual(tile.y + tile.height)
    // It is after the Edit layout button in Tab order, and takes no focus of its own.
    expect(await page.evaluate(() => window.__fx.grid.shadowRoot.activeElement)).toBe(null)
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => window.__fx.grid.shadowRoot.activeElement.className)).toContain('edit-btn')
  })

  test('Got it hides it and fires ts-hint-dismiss with reason "dismiss"; the library stores nothing', async ({ page }) => {
    await load(page, 'hint')
    await coach(page).locator('.coach-ok').click()
    await expect(coach(page)).toBeHidden()
    expect(await events(page, 'ts-hint-dismiss')).toMatchObject([{ reason: 'dismiss' }])
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, ''])
    // Still the host's attribute, and the mark does not come back.
    expect(await page.evaluate(() => window.__fx.grid.hint)).toBe(true)
    await page.evaluate(() => { window.__fx.grid.locked = true; window.__fx.grid.locked = false })
    await settle(page)
    await expect(coach(page)).toBeHidden()
    expect(await events(page, 'ts-hint-dismiss')).toHaveLength(1)
  })

  test('Escape on the button dismisses it and keeps focus on the page', async ({ page }) => {
    await load(page, 'hint')
    await coach(page).locator('.coach-ok').focus()
    await page.keyboard.press('Escape')
    await expect(coach(page)).toBeHidden()
    expect(await events(page, 'ts-hint-dismiss')).toMatchObject([{ reason: 'dismiss' }])
    const active = await page.evaluate(() => {
      const a = window.__fx.grid.shadowRoot.activeElement
      return a ? a.className : document.activeElement === document.body ? 'body' : document.activeElement.localName
    })
    expect(active).not.toBe('body')
    expect(await page.evaluate(() => window.__fx.grid.editing)).toBe(false)
  })

  test('starting to edit ends it with reason "edit", by editing = true and by the Edit layout button', async ({ page }) => {
    await load(page, 'hint')
    await page.evaluate(() => { window.__fx.grid.editing = true })
    await expect(coach(page)).toBeHidden()
    expect(await events(page, 'ts-hint-dismiss')).toMatchObject([{ reason: 'edit' }])
    await page.evaluate(() => { window.__fx.grid.editing = false })
    await settle(page)
    await expect(coach(page)).toBeHidden()

    await load(page, 'hint')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Enter')
    await expect(coach(page)).toBeHidden()
    expect(await events(page, 'ts-hint-dismiss')).toMatchObject([{ reason: 'edit' }])
  })

  test('starting to edit while focus is on Got it hands focus to the first tile\'s handle, not the body', async ({ page }) => {
    await load(page, 'hint')
    await page.evaluate(() => window.__fx.grid.shadowRoot.querySelector('.coach-ok').focus())
    await page.evaluate(() => { window.__fx.grid.editing = true })
    await settle(page)
    await expect(coach(page)).toBeHidden()
    const where = await page.evaluate(() => {
      const a = window.__fx.grid.shadowRoot.activeElement
      return { handle: !!a && a.classList.contains('handle'), id: a && a.closest('.chrome') && a.closest('.chrome').dataset.id, body: document.activeElement === document.body }
    })
    expect(where).toEqual({ handle: true, id: 'sales', body: false })
  })

  test('the card and Got it have an edge of their own, which forced colours draw', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' })
    await load(page, 'hint')
    const edges = await page.evaluate(() => {
      const r = window.__fx.grid.shadowRoot
      return [r.querySelector('.coach'), r.querySelector('.coach-ok')].map((el) => getComputedStyle(el).borderTopWidth)
    })
    expect(edges).toEqual(['1px', '1px'])
  })

  test('removing the attribute hides it and says nothing; setting it again shows it again', async ({ page }) => {
    await load(page, 'hint')
    await page.evaluate(() => { window.__fx.grid.hint = false })
    await expect(coach(page)).toBeHidden()
    expect(await events(page, 'ts-hint-dismiss')).toEqual([])
    await page.evaluate(() => { window.__fx.grid.hint = true })
    await expect(coach(page)).toBeVisible()
    // A dismissal is forgotten the same way: remove and set.
    await coach(page).locator('.coach-ok').click()
    await expect(coach(page)).toBeHidden()
    await page.evaluate(() => { window.__fx.grid.removeAttribute('hint') })
    await page.evaluate(() => { window.__fx.grid.setAttribute('hint', '') })
    await expect(coach(page)).toBeVisible()
  })

  test('is built when the attribute is first set, not before', async ({ page }) => {
    await load(page)
    expect(await page.evaluate(() => window.__fx.grid.shadowRoot.querySelector('.coach'))).toBe(null)
    await page.evaluate(() => { window.__fx.grid.hint = true })
    await expect(coach(page)).toBeVisible()
  })

  test('does not appear on a locked grid or an empty one', async ({ page }) => {
    await load(page, 'hint&locked')
    expect(await coach(page).count() === 0 || (await coach(page).isHidden())).toBe(true)
    await load(page, 'hint&empty')
    expect(await coach(page).count() === 0 || (await coach(page).isHidden())).toBe(true)
  })

  test('follows the first tile when the layout changes', async ({ page }) => {
    await load(page, 'hint&schedule')
    const before = await coach(page).boundingBox()
    await page.evaluate(() => window.__fx.cross('15:46'))
    await expect.poll(() => profile(page)).toBe('closed')
    await settle(page)
    await page.waitForTimeout(300)
    await expect(coach(page)).toBeVisible()
    // Closed starts with Queue (Wide), so the card sits under a different tile.
    const first = (await page.evaluate(() => window.__fx.grid.readingOrder))[0]
    expect(first).toBe('queue')
    const tile = await page.locator('#g > [item="queue"]').boundingBox()
    const card = await coach(page).boundingBox()
    expect(Math.min(card.x + card.width, tile.x + tile.width) - Math.max(card.x, tile.x)).toBeGreaterThan(0)
    expect(before).not.toBeNull()
  })

  test('mirrors in a right-to-left page: it sits at the inline start of the first tile', async ({ page }) => {
    await load(page, 'hint&rtl')
    const first = (await page.evaluate(() => window.__fx.grid.readingOrder))[0]
    const tile = await page.locator(`#g > [item="${first}"]`).boundingBox()
    const card = await coach(page).boundingBox()
    // The first tile is at the right edge; the card's right edge is no further right than the tile's.
    expect(card.x + card.width).toBeLessThanOrEqual(tile.x + tile.width + 1)
  })

  test('with a pinned top strip, the card points at the strip tile and the strip keeps its box', async ({ page }) => {
    await load(page, 'w=390&strip')
    const strip = page.locator('ts-grid .strip')
    await expect(strip).toBeVisible()
    const before = await strip.boundingBox()
    await page.evaluate(() => { window.__fx.grid.hint = true })
    await expect(coach(page)).toBeVisible()
    const after = await strip.boundingBox()
    expect(after).toEqual(before)
    const first = (await page.evaluate(() => window.__fx.grid.readingOrder))[0]
    expect(first).toBe('notes')
    const card = await coach(page).boundingBox()
    expect(card.y).toBeGreaterThan(before.y)
  })
})

test.describe('the calm profile switch, with motion', () => {
  test.use({ reducedMotion: 'no-preference' })

  test('a scheduled change crossfades, announces once, and offers Keep in a labelled group', async ({ page }) => {
    await load(page, 'schedule')
    expect(await anims(page), 'the first render does not animate').toEqual([])
    expect(await onScreen(page)).toEqual(['sales', 'notes', 'tasks', 'queue', 'alerts'])
    await page.evaluate(() => window.__fx.cross('15:46'))
    await expect.poll(async () => (await anims(page)).length).toBe(2)
    expect(await anims(page)).toEqual(['[{"opacity":1},{"opacity":0}]', '[{"opacity":0},{"opacity":1}]'])
    await expect.poll(() => onScreen(page)).toEqual(['queue', 'tasks', 'notes'])
    // The event comes once the layout is on the board (see the reading-order test), and the pointer or key never pays for the fade.
    expect(await events(page, 'ts-profile-change')).toMatchObject([{ profile: 'closed', reason: 'schedule' }])
    await expect(toast(page)).toHaveClass(/on/)
    await expect(toast(page)).toHaveAttribute('role', 'group')
    await expect(toast(page)).toHaveAttribute('aria-label', 'Switched to After close')
    await expect(toast(page).locator('.msg')).toHaveText('Switched to After close')
    await expect(toast(page).locator('.undo')).toHaveText('Keep Market hours')
    const keep = await toast(page).locator('.undo').boundingBox()
    expect(keep.height).toBeGreaterThanOrEqual(44)
    // Spoken once, by the status region; the toast is not a live region.
    await expect.poll(async () => (await said(page)).filter((s) => s.includes('Showing the After close layout.')).length).toBe(1)
    await page.waitForTimeout(400)
    expect(await said(page)).toEqual(['Showing the After close layout.'])
    expect(await toast(page).evaluate((el) => !el.closest('[aria-live]') && el.getAttribute('role') !== 'status')).toBe(true)
    // Nothing is left half-faded.
    expect(await page.evaluate(() => getComputedStyle(window.__fx.grid.shadowRoot.querySelector('.board')).opacity)).toBe('1')
  })

  test('Keep calls override(previous): the previous layout returns at once, until the next change', async ({ page }) => {
    await load(page, 'schedule')
    await page.evaluate(() => window.__fx.cross('15:46'))
    await expect(toast(page).locator('.undo')).toHaveText('Keep Market hours')
    await expect.poll(async () => (await anims(page)).length).toBe(2)
    const before = (await anims(page)).length
    await toast(page).locator('.undo').click()
    await expect.poll(() => profile(page)).toBe('market')
    await expect.poll(() => onScreen(page)).toEqual(['sales', 'notes', 'tasks', 'queue', 'alerts'])
    expect(await events(page, 'ts-profile-change')).toMatchObject([{ reason: 'schedule' }, { profile: 'market', reason: 'override' }])
    expect(await page.evaluate(() => window.__fx.grid.profileOverride)).toBe('market')
    await expect(toast(page)).not.toHaveClass(/on/)
    await expect.poll(async () => (await said(page)).at(-1)).toBe('Keeping Market hours until the next change.')
    expect((await anims(page)).length, 'the user\'s own override applies at once').toBe(before)
    // Held through the evening, then the schedule takes over again: it is not a lock.
    await page.evaluate(() => window.__fx.cross('21:00'))
    await settle(page)
    expect(await profile(page)).toBe('market')
    expect(await page.evaluate(() => window.__fx.grid.profileOverride)).toBe('market')
    await page.evaluate(() => window.__fx.cross('09:30', '2026-08-06'))
    await settle(page)
    expect(await page.evaluate(() => window.__fx.grid.profileOverride)).toBe(null)
    expect(await profile(page)).toBe('market')
  })

  test('an override that lapses into another profile crossfades and offers nothing to keep', async ({ page }) => {
    await load(page, 'schedule')
    await page.evaluate(() => window.__fx.grid.override('focus'))
    await expect.poll(() => onScreen(page)).toEqual(['alerts', 'sales'])
    expect(await anims(page), 'override() applies at once').toEqual([])
    expect(await toast(page).evaluate((el) => el.classList.contains('on'))).toBe(false)
    await page.evaluate(() => window.__fx.cross('15:46'))
    await expect.poll(async () => (await anims(page)).length).toBe(2)
    await expect.poll(() => onScreen(page)).toEqual(['queue', 'tasks', 'notes'])
    expect(await events(page, 'ts-profile-change')).toMatchObject([{ profile: 'focus', reason: 'override' }, { profile: 'closed', reason: 'override-ended' }])
    await page.waitForTimeout(400)
    expect(await toast(page).evaluate((el) => el.classList.contains('on'))).toBe(false)
    expect((await said(page)).filter((s) => s === 'Showing the After close layout.')).toHaveLength(1)
  })

  test('undo-toast="off" shows no toast but still crossfades and announces once', async ({ page }) => {
    await load(page, 'schedule&toast=off')
    await page.evaluate(() => window.__fx.cross('15:46'))
    await expect.poll(async () => (await anims(page)).length).toBe(2)
    await expect.poll(() => onScreen(page)).toEqual(['queue', 'tasks', 'notes'])
    await page.waitForTimeout(400)
    expect(await toast(page).evaluate((el) => el.classList.contains('on'))).toBe(false)
    expect(await said(page)).toEqual(['Showing the After close layout.'])
  })

  test('a change that falls due while editing waits, then fades when Done applies it', async ({ page }) => {
    await load(page, 'schedule')
    await startEditing(page)
    await page.evaluate(() => window.__fx.cross('15:46'))
    await page.waitForTimeout(400)
    expect(await profile(page)).toBe('market')
    expect(await anims(page)).toEqual([])
    await page.evaluate(() => { window.__fx.grid.editing = false })
    await expect.poll(async () => (await anims(page)).length).toBe(2)
    await expect.poll(() => onScreen(page)).toEqual(['queue', 'tasks', 'notes'])
    await expect(toast(page)).toHaveAttribute('role', 'group')
  })

  test('beginning an edit mid-fade lands the new layout and leaves nothing half-faded', async ({ page }) => {
    await load(page, 'schedule')
    await page.evaluate(() => {
      window.__fx.cross('15:46')
      window.__fx.grid.editing = true
    })
    await settle(page)
    expect(await profile(page)).toBe('closed')
    await expect.poll(() => onScreen(page)).toEqual(['queue', 'tasks', 'notes'])
    expect(await page.evaluate(() => getComputedStyle(window.__fx.grid.shadowRoot.querySelector('.board')).opacity)).toBe('1')
    await page.waitForTimeout(400)
    expect(await page.evaluate(() => getComputedStyle(window.__fx.grid.shadowRoot.querySelector('.board')).opacity)).toBe('1')
    // Editing began, so the Keep it offered is gone with it.
    await expect(toast(page)).not.toHaveClass(/on/)
  })

  test('crossing the close on the pretend clock, with the grid\'s own timer', async ({ page }) => {
    await load(page, 'schedule&live')
    await expect.poll(() => profile(page), { timeout: 4000 }).toBe('closed')
    await expect.poll(async () => (await anims(page)).length).toBe(2)
    await expect(toast(page).locator('.undo')).toHaveText('Keep Market hours')
  })

  test('the profile attribute and the first render never animate', async ({ page }) => {
    await load(page, 'schedule')
    await page.evaluate(() => window.__fx.grid.setAttribute('profile', 'closed'))
    await expect.poll(() => onScreen(page)).toEqual(['queue', 'tasks', 'notes'])
    expect(await anims(page)).toEqual([])
    expect(await toast(page).evaluate((el) => el.classList.contains('on'))).toBe(false)
  })

  test('the profile attribute is announced by the profile\'s name, like the schedule and override() routes', async ({ page }) => {
    await load(page, 'schedule')
    await page.evaluate(() => window.__fx.grid.setAttribute('profile', 'closed'))
    await expect.poll(() => said(page)).toEqual(['Showing the After close layout.'])
    await page.evaluate(() => window.__fx.grid.setAttribute('profile', 'market'))
    await expect.poll(() => said(page)).toEqual(['Showing the After close layout.', 'Showing the Market hours layout.'])
  })

  test('ts-profile-change fires with the new layout on the board: a handler reading readingOrder sees it', async ({ page }) => {
    await load(page, 'schedule')
    await page.evaluate(() => {
      const g = window.__fx.grid
      window.__seen = []
      g.addEventListener('ts-profile-change', (e) => window.__seen.push({ reason: e.detail.reason, order: [...g.readingOrder] }))
    })
    await page.evaluate(() => window.__fx.cross('15:46'))
    await expect.poll(() => page.evaluate(() => window.__seen.length)).toBe(1)
    expect((await page.evaluate(() => window.__seen))[0]).toEqual({ reason: 'schedule', order: ['queue', 'tasks', 'notes'] })
    // The same for a kept override that lapses, which also crossfades: a fresh page, so the override is made before the close.
    await load(page, 'schedule')
    await page.evaluate(() => {
      const g = window.__fx.grid
      window.__seen = []
      g.addEventListener('ts-profile-change', (e) => window.__seen.push({ reason: e.detail.reason, order: [...g.readingOrder] }))
      g.override('focus')
    })
    await page.evaluate(() => window.__fx.cross('15:46'))
    await expect.poll(() => page.evaluate(() => window.__seen.length)).toBe(2)
    expect(await page.evaluate(() => window.__seen)).toEqual([
      { reason: 'override', order: ['alerts', 'sales'] },
      { reason: 'override-ended', order: ['queue', 'tasks', 'notes'] },
    ])
  })

  test('clearing your own override with override(null) applies at once, with no fade', async ({ page }) => {
    await load(page, 'schedule')
    await page.evaluate(() => window.__fx.grid.override('focus'))
    await expect.poll(() => onScreen(page)).toEqual(['alerts', 'sales'])
    await page.evaluate(() => window.__fx.grid.override(null))
    await expect.poll(() => onScreen(page)).toEqual(['sales', 'notes', 'tasks', 'queue', 'alerts'])
    expect(await anims(page)).toEqual([])
    expect(await events(page, 'ts-profile-change')).toMatchObject([{ reason: 'override' }, { reason: 'override-ended' }])
  })

  test('a messages change while the Keep toast shows rewords it', async ({ page }) => {
    await load(page, 'schedule')
    await page.evaluate(() => window.__fx.cross('15:46'))
    await expect(toast(page).locator('.undo')).toHaveText('Keep Market hours')
    await page.evaluate(() => { window.__fx.grid.messages = { 'grid.keepProfile': 'Garder {previous}', 'grid.profileSwitched': 'Passé à {profile}' } })
    await expect(toast(page).locator('.undo')).toHaveText('Garder Market hours')
    await expect(toast(page).locator('.msg')).toHaveText('Passé à After close')
    await expect(toast(page)).toHaveAttribute('aria-label', 'Passé à After close')
  })

  test('the removal toast is still a status with Undo, and a switch does not leave it a group', async ({ page }) => {
    await load(page, 'schedule')
    await page.evaluate(() => window.__fx.cross('15:46'))
    await expect(toast(page)).toHaveAttribute('role', 'group')
    await toast(page).locator('.undo').click()
    await expect(toast(page)).not.toHaveClass(/on/)
    await startEditing(page)
    // The tiles wiggle in edit mode under motion, so a click that waits for a stable box never comes.
    await chrome(page, 'tasks').locator('.remove').dispatchEvent('click')
    await expect(toast(page)).toHaveClass(/on/)
    await expect(toast(page)).toHaveAttribute('role', 'status')
    expect(await toast(page).getAttribute('aria-label')).toBe(null)
    await expect(toast(page).locator('.msg')).toHaveText('Tasks removed')
    await expect(toast(page).locator('.undo')).toHaveText('Undo')
    await toast(page).locator('.undo').click()
    await settle(page)
    expect((await events(page, 'ts-layout-change')).map((e) => e.reason)).toEqual(['remove', 'undo'])
  })
})

test.describe('the calm profile switch, under reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('the new layout appears at once, with no animation, and the toast and the announcement are the same', async ({ page }) => {
    await load(page, 'schedule')
    await page.evaluate(() => window.__fx.cross('15:46'))
    await expect.poll(() => onScreen(page)).toEqual(['queue', 'tasks', 'notes'])
    expect(await anims(page)).toEqual([])
    await expect(toast(page)).toHaveAttribute('role', 'group')
    await expect(toast(page).locator('.undo')).toHaveText('Keep Market hours')
    await page.waitForTimeout(400)
    expect(await said(page)).toEqual(['Showing the After close layout.'])
  })

  test('the hint has no fade or nudge, and the badge goes at its second without fading', async ({ page }) => {
    await load(page, 'hint')
    await expect(coach(page)).toBeVisible()
    expect(await coach(page).evaluate((el) => el.getAnimations().length)).toBe(0)
    await startEditing(page)
    await chrome(page, 'notes').locator('.handle').focus()
    await page.keyboard.press('+')
    await expect(badge(page, 'notes')).toBeVisible()
    await page.waitForTimeout(1100)
    expect(await badge(page, 'notes').evaluate((el) => el.hidden)).toBe(true)
  })
})

test.describe('axe', () => {
  for (const theme of ['light', 'dark']) {
    test(`the badge, the hint and the switch toast in ${theme}`, async ({ page }) => {
      await load(page, `hint&schedule&theme=${theme}`)
      await expectClean(page, `hint, ${theme}`)
      await page.evaluate(() => { window.__fx.grid.hint = false })
      await page.evaluate(() => window.__fx.cross('15:46'))
      await expect(toast(page)).toHaveClass(/on/)
      await page.waitForTimeout(400)
      await expectClean(page, `switch toast, ${theme}`)
      await toast(page).locator('.undo').click()
      await startEditing(page)
      await chrome(page, 'notes').locator('.handle').focus()
      await page.keyboard.press('+')
      await expect(badge(page, 'notes')).toBeVisible()
      await expectClean(page, `badge, ${theme}`)
    })
  }
})

test.describe('strict CSP and Trusted Types', () => {
  const POLICY = "default-src 'self'; style-src 'self'; script-src 'self'; require-trusted-types-for 'script'; trusted-types tickslate"
  test('the badge, the hint and the switch run with no violation', async ({ page }) => {
    const violations = []
    await page.addInitScript(() => {
      window.__violations = []
      document.addEventListener('securitypolicyviolation', (e) => window.__violations.push(`${e.violatedDirective} ${e.blockedURI} ${(e.sample || '').slice(0, 60)}`))
    })
    await page.route('**/@vite/client', (route) => route.fulfill({ contentType: 'text/javascript', body: 'export {}' }))
    await page.route('**/test/browser/fixtures/edit-feedback.html*', async (route) => {
      const response = await route.fetch()
      await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': POLICY } })
    })
    await load(page, 'hint&schedule')
    await expect(coach(page)).toBeVisible()
    await coach(page).locator('.coach-ok').click()
    await page.evaluate(() => window.__fx.cross('15:46'))
    await expect(toast(page).locator('.undo')).toHaveText('Keep Market hours')
    await toast(page).locator('.undo').click()
    await startEditing(page)
    await chrome(page, 'notes').locator('.handle').focus()
    await page.keyboard.press('+')
    await expect(badge(page, 'notes')).toBeVisible()
    violations.push(...(await page.evaluate(() => window.__violations)))
    expect(violations).toEqual([])
  })
})
