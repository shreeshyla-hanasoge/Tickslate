// The click target of an href or activatable tile in real engines (RFC 0005 §1, issue #68). Every widget the fixture
// draws, at every size, is made activatable, then an href tile. A real pointer clicks each data surface RFC 0005 §1.2
// lists (the chart a reader points at, the calendar's cells, the scrolling lists and the rows and header cells in them):
// none of those clicks opens the tile. Then the label, the header's empty space, the padding and the headline figure:
// each of those opens it once. The rest of §1.9 follows: a wheel scrolls a list under the pointer, a sort button sorts, a
// selectable row or point fires select, the charts still scrub, the keyboard path is the one a plain tile has with the
// label in front, and the open target stays 44px tall on a touch screen in both densities.
import { test, expect } from '@playwright/test'
import { drawn } from './drawn.mjs'

// ?exact=1 gives each tile its real column width, so a Wide or XL tile lays its chart out beside its figures as a grid would.
const FIXTURE = '/test/browser/fixtures/widgets.html?exact=1'

// RFC 0005 §1.2, by catalog key: what each widget lifts. The selectors find the surface itself, then the things inside it
// a reader clicks. A list's rows, header cells and row buttons are inside its .scroll, so they are clicked too.
const LIST = ['.scroll', '.scroll :is(li, tbody tr, th, button)']
const LIFTED = {
  todayPnl: ['[part~="chart"]'],
  equityCurve: ['[part~="chart"]'],
  chart: ['[part~="chart"]'],
  pnlCalendar: ['[role="grid"]', '[role="gridcell"]'],
  miniChart: ['[part~="chart"]'],
  metric: ['[part~="chart"]'],
  edgeStats: ['[part~="chart"]'],
  breakdown: ['[part~="chart"]', '[part~="bar"]', ...LIST],
  table: LIST,
  watchlist: LIST,
  openPositions: LIST,
  capitalFunding: LIST,
  status: LIST,
  feed: LIST,
  card: ['.body.scroll', '.body.scroll'],
  sessionClock: [],
  progress: [],
}
// The sizes that draw no surface at all, so a size that loses one by mistake fails rather than passing with no clicks.
const BARE = new Set(['todayPnl:S', 'todayPnl:Wide', 'metric:S', 'edgeStats:S', 'edgeStats:Wide', 'capitalFunding:S', 'status:S', 'card:S', 'card:Wide'])
// Under the overlay on purpose (RFC 0005 §1.2): the headline drawn as a shape, which opens the tile.
const UNDER = { progress: '[part~="bar"]', sessionClock: '.trk, .lanes' }

const MODES = ['activatable', 'href']

let errors
test.beforeEach(async ({ page }) => {
  errors = []
  await page.context().route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname), (route) => route.abort())
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()))
  page.on('pageerror', (error) => errors.push(error.message))
})

test.afterEach(() => {
  expect(errors).toEqual([])
})

/** The fixture with every tile of `keys` (or all) in `mode`, and every `open` action counted (an href tile's open is its hash, read by opensOf). */
async function load(page, mode, keys = null) {
  await page.goto(FIXTURE)
  await page.waitForFunction(() => window.__ready === true)
  await drawn(page)
  await page.evaluate(({ mode, keys }) => {
    window.__opens = []
    window.__actions = []
    document.addEventListener('ts-action', (e) => {
      window.__actions.push(e.detail)
      if (e.detail.action === 'open') window.__opens.push(e.detail.id)
    })
    for (const [key, el] of window.__fx.tiles) {
      if (keys && !keys.includes(el.dataset.key)) continue
      el.setAttribute('item', key)
      if (el.localName === 'ts-card' && el.dataset.size !== 'S' && el.dataset.size !== 'Wide') el.setAttribute('scrollable', '')
      if (mode === 'href') el.setAttribute('href', `#open-${encodeURIComponent(key)}`)
      else el.setAttribute('activatable', '')
    }
  }, { mode, keys })
  await page.waitForFunction((keys) => [...window.__fx.tiles.values()].filter((el) => !keys || keys.includes(el.dataset.key))
    .every((el) => el.shadowRoot.querySelector('[part~="link"]')), keys)
}

/** Resets the counts, and the hash an href click left, so the next click is judged alone. */
async function reset(page) {
  await page.evaluate(() => {
    window.__opens = []
    window.__actions = []
    if (location.hash) history.replaceState(null, '', location.pathname + location.search)
  })
}

/**
 * Up to three points to click on what `sel` matches in the tile `key`: the first, middle and last match, each at the
 * centre of the part of it a reader can see (inside the tile, and inside the list it scrolls in). The tile is brought on
 * screen first, as a reader would scroll to it.
 */
const pointsOn = (page, key, sel) =>
  page.evaluate(({ key, sel }) => {
    const el = window.__fx.tiles.get(key)
    el.scrollIntoView({ block: 'center', inline: 'center' })
    const tile = el.shadowRoot.querySelector('.tile').getBoundingClientRect()
    const all = [...el.shadowRoot.querySelectorAll(sel)]
    const picks = [...new Set([all[0], all[Math.floor(all.length / 2)], all[all.length - 1]])].filter(Boolean)
    const out = []
    for (const n of picks) {
      let r = n.getBoundingClientRect()
      const clip = n.closest('.scroll') && n.closest('.scroll') !== n ? n.closest('.scroll').getBoundingClientRect() : tile
      const x0 = Math.max(r.left, clip.left, tile.left, 0)
      const x1 = Math.min(r.right, clip.right, tile.right, innerWidth)
      const y0 = Math.max(r.top, clip.top, tile.top, 0)
      const y1 = Math.min(r.bottom, clip.bottom, tile.bottom, innerHeight)
      if (x1 - x0 < 2 || y1 - y0 < 2) continue
      r = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }
      // What the engine hits there, for the failure message: the overlay is the link itself.
      const hit = el.shadowRoot.elementFromPoint(r.x, r.y)
      out.push({ x: r.x, y: r.y, what: `${n.localName}.${[...n.classList].join('.')}`, hit: hit ? `${hit.localName}${hit.matches('[part~="link"]') ? '[link]' : ''}` : 'none' })
    }
    return out
  }, { key, sel })

/** The points that must open the tile: the label, the header's empty space, the top padding and the headline figure. */
const openPoints = (page, key) =>
  page.evaluate((key) => {
    const el = window.__fx.tiles.get(key)
    el.scrollIntoView({ block: 'center', inline: 'center' })
    const root = el.shadowRoot
    const tile = root.querySelector('.tile').getBoundingClientRect()
    const pad = parseFloat(getComputedStyle(root.querySelector('.tile')).paddingTop)
    const label = root.querySelector('[part~="label"]').getBoundingClientRect()
    const header = root.querySelector('[part~="header"]').getBoundingClientRect()
    const out = [
      { name: 'label', x: label.left + Math.min(label.width / 2, 12), y: label.top + label.height / 2 },
      { name: 'padding', x: tile.left + tile.width / 2, y: tile.top + pad / 2 },
    ]
    // The header's own empty space: the first point along its middle line past the label that the overlay covers.
    const y = header.top + header.height / 2
    for (let x = label.right + 4; x < header.right - 2; x += 4) {
      const hit = root.elementFromPoint(x, y)
      if (hit && hit.matches('[part~="link"]')) {
        out.push({ name: 'header', x, y })
        break
      }
    }
    const value = root.querySelector('[part~="value"]')
    const v = value && value.getBoundingClientRect()
    if (v && v.width > 2 && v.height > 2) out.push({ name: 'value', x: v.left + v.width / 2, y: v.top + v.height / 2 })
    // A tile's own button (.btn) takes its own click by design. Where one covers a point, as the range buttons cover an XL
    // equity curve's figure when the tile is squeezed to a phone's width, that point is not part of the open target.
    return out.filter((p) => !root.elementFromPoint(p.x, p.y)?.closest('.btn'))
  }, key)

// An href tile's open is the hash it went to, read from location: navigating to a fragment updates it during the click,
// while the hashchange event comes a task later and could be counted against the next click.
const opensOf = (page) => page.evaluate(() => [...window.__opens, ...(location.hash.startsWith('#open-') ? [decodeURIComponent(location.hash.slice(6))] : [])])

for (const mode of MODES) {
  for (const [widget, selectors] of Object.entries(LIFTED)) {
    test(`${mode}: ${widget}: a click on data never opens it; the label, header, padding and figure do`, async ({ page }) => {
      await load(page, mode, [widget])
      const keys = await page.evaluate((w) => [...window.__fx.tiles.keys()].filter((k) => k.startsWith(`${w}:`)), widget)
      expect(keys.length).toBeGreaterThan(0)
      const bad = []
      let clicked = 0
      for (const key of keys) {
        let found = 0
        for (const sel of new Set(selectors)) {
          for (const p of await pointsOn(page, key, sel)) {
            found++
            await reset(page)
            await page.mouse.click(p.x, p.y)
            const opens = await opensOf(page)
            if (opens.length) bad.push(`${key} ${sel} (${p.what}, hit ${p.hit}) opened the tile`)
            clicked++
          }
        }
        if (selectors.length && !BARE.has(key) && !found) bad.push(`${key}: none of ${selectors.join(', ')} was found to click`)
        if (BARE.has(key) && found) bad.push(`${key}: draws a surface the contract leaves out`)

        const under = UNDER[widget] ? await pointsOn(page, key, UNDER[widget]) : []
        for (const p of [...(await openPoints(page, key)), ...under.map((p) => ({ ...p, name: p.what }))]) {
          await reset(page)
          await page.mouse.click(p.x, p.y)
          const opens = await opensOf(page)
          if (opens.length !== 1 || opens[0] !== key) bad.push(`${key}: a click on the ${p.name} opened ${JSON.stringify(opens)}`)
        }
        // An href tile must have gone nowhere but its own hash; nothing else on the page navigated.
        await reset(page)
      }
      if (selectors.length) expect(clicked).toBeGreaterThan(0)
      expect(bad).toEqual([])
    })
  }
}

test.describe('what a lifted surface does instead', () => {
  for (const mode of MODES) {
    test(`${mode}: a sort button sorts, a selectable row and a chart point fire select, and none of them opens`, async ({ page }) => {
      await load(page, mode, ['table', 'chart'])
      await page.evaluate(() => {
        window.__fx.tiles.get('table:M').actions = ['select']
        window.__fx.tiles.get('chart:M').actions = ['select']
      })
      const table = page.locator('[data-key="table"][data-size="M"]')
      const chart = page.locator('[data-key="chart"][data-size="M"]')
      await expect(table.locator('.rowbtn').first()).toBeAttached()
      await expect(chart.locator('.pts .pt').first()).toBeAttached()

      const clickAt = async (key, sel) => {
        const [p] = await pointsOn(page, key, sel)
        expect(p, `${key} ${sel} is on screen`).toBeTruthy()
        await reset(page)
        await page.mouse.click(p.x, p.y)
        return { actions: await page.evaluate(() => window.__actions.map((a) => a.action)), opens: await opensOf(page) }
      }

      const head = table.locator('th[aria-sort]').first()
      const before = await head.getAttribute('aria-sort')
      expect(await clickAt('table:M', 'th .sort')).toEqual({ actions: ['sort'], opens: [] })
      await expect(head).not.toHaveAttribute('aria-sort', before ?? 'none')

      expect(await clickAt('table:M', '.rowbtn')).toEqual({ actions: ['select'], opens: [] })
      expect(await clickAt('chart:M', '.pts .pt')).toEqual({ actions: ['select'], opens: [] })
    })
  }

  test('a wheel over a list in an activatable tile scrolls the list under the pointer', async ({ page, browserName, isMobile }) => {
    await load(page, 'activatable')
    const lists = await page.evaluate(() => [...window.__fx.tiles].filter(([, el]) => {
      const s = el.shadowRoot.querySelector('.scroll')
      return s && s.scrollHeight > s.clientHeight + 20
    }).map(([key]) => key))
    // Every size of the table overflows in the fixture, and so do lists of four other widgets.
    for (const key of ['table:Tall', 'table:M', 'table:L', 'table:XL', 'watchlist:M', 'openPositions:M', 'capitalFunding:L', 'feed:M']) expect(lists).toContain(key)
    for (const key of lists) {
      const [p] = await pointsOn(page, key, '.scroll')
      // Where a wheel or a finger starts a scroll: the engine's hit test at that point is inside the list, not the overlay.
      const inside = await page.evaluate(({ key, p }) => {
        const el = window.__fx.tiles.get(key)
        const hit = el.shadowRoot.elementFromPoint(p.x, p.y)
        return !!hit && el.shadowRoot.querySelector('.scroll').contains(hit)
      }, { key, p })
      expect(inside, `${key}: the list is under the pointer`).toBe(true)
      // WebKit has no wheel on a phone; there the hit test above is where a finger's scroll starts.
      if (isMobile && browserName === 'webkit') continue
      await page.evaluate((key) => { window.__fx.tiles.get(key).shadowRoot.querySelector('.scroll').scrollTop = 0 }, key)
      await page.mouse.move(p.x, p.y)
      await page.mouse.wheel(0, 120)
      await page.waitForFunction((key) => window.__fx.tiles.get(key).shadowRoot.querySelector('.scroll').scrollTop > 0, key)
    }
  })

  for (const mode of MODES) {
    test(`${mode}: the charts still scrub under the pointer`, async ({ page }) => {
      await load(page, mode, ['todayPnl', 'equityCurve', 'chart'])
      for (const key of ['todayPnl:M', 'equityCurve:M', 'chart:M']) {
        const [p] = await pointsOn(page, key, '[part~="chart"]')
        await page.mouse.move(p.x - 20, p.y)
        await page.mouse.move(p.x, p.y, { steps: 4 })
        await page.waitForFunction((key) => !window.__fx.tiles.get(key).shadowRoot.querySelector('[data-k="scrub"]').hidden, key)
        await reset(page)
        await page.mouse.click(p.x, p.y)
        expect(await opensOf(page), key).toEqual([])
      }
    })
  }
})

test.describe('the keyboard path is unchanged', () => {
  // What has focus, by what a reader would call it: the label link, the slider, a cell, the list, a row or a point.
  const focused = (page, key) => page.evaluate((key) => {
    const el = window.__fx.tiles.get(key)
    const a = el.shadowRoot.activeElement
    if (document.activeElement !== el || !a) return document.activeElement ? document.activeElement.id || document.activeElement.localName : null
    return a.matches('[part~="link"]') ? 'link' : a.getAttribute('data-k') || a.getAttribute('role') || a.className || a.localName
  }, key)

  // Tab from a button before the tile to the one after it, and name each stop on the way.
  async function stops(page, key, tab) {
    await page.evaluate((key) => {
      const el = window.__fx.tiles.get(key)
      for (const id of ['before', 'after']) document.getElementById(id)?.remove()
      const mk = (id) => Object.assign(document.createElement('button'), { id, textContent: id })
      el.before(mk('before'))
      el.after(mk('after'))
      document.getElementById('before').focus()
    }, key)
    const out = []
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press(tab)
      const at = await focused(page, key)
      if (at === 'after') return out
      out.push(at)
    }
    return out
  }

  for (const mode of MODES) {
    test(`${mode}: Tab reaches the label once, before the stops a plain tile has, and Enter opens it`, async ({ page, browserName }) => {
      // WebKit's Tab skips links and buttons unless the reader opts in; Option+Tab is that opt-in.
      const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab'
      const keys = ['metric:M', 'chart:M', 'table:M', 'pnlCalendar:M', 'breakdown:M', 'feed:M']
      await page.goto(FIXTURE)
      await page.waitForFunction(() => window.__ready === true)
      await drawn(page)
      const plain = {}
      for (const key of keys) plain[key] = await stops(page, key, tab)
      await load(page, mode, keys.map((k) => k.split(':')[0]))
      for (const key of keys) {
        const act = await stops(page, key, tab)
        expect(act, key).toEqual(['link', ...plain[key]])
        await reset(page)
        await page.evaluate((key) => window.__fx.tiles.get(key).shadowRoot.querySelector('[part~="link"]').focus(), key)
        await page.keyboard.press('Enter')
        await page.waitForFunction(() => window.__opens.length > 0 || location.hash.startsWith('#open-'))
        expect(await opensOf(page), key).toEqual([key])
      }
    })
  }
})

test.describe('the open target on a touch screen', () => {
  for (const density of ['comfortable', 'compact']) {
    test(`${density}: at 390px the strip above the first lifted surface is at least 44px tall`, async ({ page }) => {
      test.skip(!(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)), 'the 44px floor is for a coarse pointer (ACCESSIBILITY item 8)')
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(FIXTURE)
      await page.waitForFunction(() => window.__ready === true)
      if (density === 'compact') await page.evaluate(() => document.documentElement.setAttribute('data-ts-density', 'compact'))
      await drawn(page)
      for (const mode of MODES) {
        const short = await page.evaluate((mode) => {
          const out = []
          for (const [key, el] of window.__fx.tiles) {
            el.removeAttribute('activatable')
            el.removeAttribute('href')
            el.setAttribute(mode, mode === 'href' ? '#t' : '')
          }
          for (const [key, el] of window.__fx.tiles) {
            const root = el.shadowRoot
            const top = root.querySelector('.tile').getBoundingClientRect().top
            // The lifted surfaces below the header: one beside a header in its own column (a Wide chart) leaves that column whole.
            const hd = root.querySelector('[part~="header"]').getBoundingClientRect()
            const tops = [...root.querySelectorAll('.lift')].map((n) => n.getBoundingClientRect())
              .filter((r) => r.height > 0 && r.left < hd.right && r.right > hd.left).map((r) => r.top - top)
            if (tops.length && Math.min(...tops) < 44) out.push(`${key} ${Math.min(...tops).toFixed(1)}px`)
          }
          return out
        }, mode)
        expect(short, mode).toEqual([])
      }
    })
  }
})
