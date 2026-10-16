// <ts-progress> in real engines (RFC 0003 §17): the meter and its words, the bar's fill and colours per state, the
// stripes at 100% in a limit, a dash and no bar without a target, in place updates, and nothing out of the tile at
// phone widths, in light, dark, a monospace preset and with wide fonts.
import { test, expect } from '@playwright/test'

const PAGE = '/test/browser/fixtures/progress.html'

test.beforeEach(async ({ page }) => {
  // Network off: only the dev server answers.
  await page.context().route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname), (route) => route.abort())
})

async function open(page, query = '') {
  await page.goto(`${PAGE}?${query}`)
  await page.waitForFunction(() => window.__ready === true)
  await page.evaluate(() => window.__p.nextFrame())
}

const read = (page) =>
  page.evaluate(() => {
    const root = window.__p.el.shadowRoot
    const meter = root.querySelector('[data-k="meter"]')
    const bar = root.querySelector('[data-k="bar"]')
    const track = meter.getBoundingClientRect()
    return {
      group: root.querySelector('[role="group"]').getAttribute('aria-label'),
      pct: root.querySelector('[data-k="pct"]').textContent,
      text: root.querySelector('[data-k="text"]').textContent,
      state: root.querySelector('[data-k="state"]').textContent,
      hidden: meter.hasAttribute('hidden'),
      role: meter.getAttribute('role'),
      now: meter.getAttribute('aria-valuenow'),
      valuetext: meter.getAttribute('aria-valuetext'),
      cls: meter.getAttribute('class'),
      fill: bar.getBoundingClientRect().width / track.width,
      bg: getComputedStyle(bar).backgroundImage,
      color: getComputedStyle(bar).backgroundColor,
    }
  })

test.describe('the gauge', () => {
  test('says value, target and percentage, and is a meter with a text alternative', async ({ page }) => {
    await open(page, 'size=Wide')
    const info = await read(page)
    expect(info.text).toBe('6,400 of 10,000 · 64%')
    expect(info.pct).toBe('64%')
    expect(info.role).toBe('meter')
    expect(info.now).toBe('64')
    expect(info.group).toBe('Daily loss limit, 6,400 of 10,000, 64%')
    expect(info.fill).toBeGreaterThan(0.62)
    expect(info.fill).toBeLessThan(0.66)
  })

  test('near the limit: warning colour and the words', async ({ page }) => {
    await open(page, 'size=Wide&value=8000')
    const info = await read(page)
    expect(info.cls).toContain('warn')
    expect(info.state).toBe('near limit')
    expect(info.group).toBe('Daily loss limit, 8,000 of 10,000, 80%, near limit')
    expect(info.valuetext).toBe('8,000 of 10,000, 80%, near limit')
  })

  test('over the limit: stripes in the loss colour, a full bar and the words', async ({ page }) => {
    await open(page, 'size=Wide&value=12000')
    const info = await read(page)
    expect(info.cls).toContain('over')
    expect(info.state).toBe('over limit')
    expect(info.pct).toBe('120%')
    expect(info.fill).toBeGreaterThan(0.99)
    expect(info.bg).toContain('repeating-linear-gradient')
    // The computed value has resolved color-mix(), so the proof is two different stops.
    expect(new Set(info.bg.match(/(rgb|color)\([^)]*\)/g)).size).toBe(2)
  })

  test('a goal met turns to the profit colour with its words, and a goal in progress does not', async ({ page }) => {
    await open(page, 'size=Wide&mode=goal&value=10000')
    const done = await read(page)
    expect(done.cls).toContain('done')
    expect(done.state).toBe('goal reached')
    await open(page, 'size=Wide&mode=goal&value=9000')
    const going = await read(page)
    expect(going.cls).not.toContain('done')
    expect(going.state).toBe('')
    expect(going.color).not.toBe(done.color)
  })

  test('the colours differ by state', async ({ page }) => {
    const colour = async (query) => {
      await open(page, query)
      return (await read(page)).color
    }
    const ok = await colour('size=S&value=1000')
    const near = await colour('size=S&value=8000')
    expect(near).not.toBe(ok)
  })

  test('no target: a dash, no bar and a label that says so', async ({ page }) => {
    await open(page, 'size=Wide&target=0')
    const info = await read(page)
    expect(info.pct).toBe('—')
    expect(info.text).toBe('—')
    expect(info.hidden).toBe(true)
    expect(info.group).toBe('Daily loss limit, no target set')
  })

  test('updates in place: the same nodes, a new fill and state', async ({ page }) => {
    await open(page, 'size=Wide')
    const same = await page.evaluate(async () => {
      const root = window.__p.el.shadowRoot
      const before = [root.querySelector('[data-k="bar"]'), root.querySelector('[data-k="pct"]')]
      window.__p.set({ value: 9500, target: 10000, mode: 'limit' })
      await window.__p.nextFrame()
      return [root.querySelector('[data-k="bar"]') === before[0], root.querySelector('[data-k="pct"]') === before[1]]
    })
    expect(same).toEqual([true, true])
    const info = await read(page)
    expect(info.pct).toBe('95%')
    expect(info.state).toBe('near limit')
  })
})

test.describe('fit', () => {
  const cases = [['S', 170], ['S', 140], ['Wide', 351], ['Wide', 300]]
  for (const [size, width] of cases) {
    for (const variant of ['theme=light', 'theme=dark', 'preset=terminal', 'theme=light&wide', 'theme=light&long&wide']) {
      test(`${size} at ${width}px, ${variant}: nothing sticks out of the tile or is cut`, async ({ page }) => {
        await open(page, `size=${size}&width=${width}&${variant}&value=12000&caption=Resets%20at%2009:15`)
        const info = await page.evaluate(() => {
          const root = window.__p.el.shadowRoot
          const tile = root.querySelector('.tile').getBoundingClientRect()
          const out = [...root.querySelectorAll('.tile *')].filter((n) => !n.closest('[hidden]') && !n.closest('.visually-hidden') && n.getBoundingClientRect().width > 0 && n.getBoundingClientRect().right > tile.right + 0.5)
          const cut = [...root.querySelectorAll('[data-k="pct"], [data-k="text"]')].filter((n) => n.scrollWidth > n.clientWidth + 1)
          return { out: out.map((n) => n.className || n.localName), cut: cut.map((n) => n.getAttribute('data-k')), overflowY: [...root.querySelectorAll('.tile *')].some((n) => !n.closest('[hidden]') && n.getBoundingClientRect().height > 0 && n.getBoundingClientRect().bottom > tile.bottom + 0.5) }
        })
        expect(info.out).toEqual([])
        expect(info.cut).toEqual([])
        expect(info.overflowY).toBe(false)
      })
    }
  }
})
