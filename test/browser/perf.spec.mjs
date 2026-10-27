// Performance hygiene in a real engine (RFC 0003 §23): thirty live tiles updating every second stay under the
// long-task line at 4x CPU throttling, 200 mount/unmount cycles leave no interval behind, and a widget nobody can
// see does no work. The throttled run is Chromium only (the throttle is a DevTools call, and long-task timing is
// Chromium's); the leak and gating specs run on every engine. This page keeps the real IntersectionObserver, which
// widgets.html deliberately removes, so it is where the gating is exercised in WebKit, Firefox and both phones.
//
// The update window is short by default so CI stays quick. The full check from the RFC is 60 s:
//
//   TICKSLATE_PERF_SECONDS=60 npx playwright test test/browser/perf.spec.mjs --project=chromium
//
// The fixture is the freshness page, emptied: it imports every widget and defines nothing else we need.
import { test, expect } from '@playwright/test'

const PAGE = '/test/browser/fixtures/freshness.html'
const SECONDS = Math.max(2, Number(process.env.TICKSLATE_PERF_SECONDS) || 8)
const LONG_TASK_MS = 50
// 4x is the RFC's mid-range phone; TICKSLATE_PERF_THROTTLE=1 shows what the machine itself adds.
const THROTTLE = Number(process.env.TICKSLATE_PERF_THROTTLE) || 4

test.beforeEach(async ({ page }) => {
  await page.context().route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname), (route) => route.abort())
  // Before any page script: every interval the page starts and stops, so a leak is a number.
  await page.addInitScript(() => {
    const live = new Set()
    const set = window.setInterval.bind(window)
    const clear = window.clearInterval.bind(window)
    window.setInterval = (fn, ms, ...rest) => {
      const id = set(fn, ms, ...rest)
      live.add(id)
      return id
    }
    window.clearInterval = (id) => {
      live.delete(id)
      clear(id)
    }
    window.__liveIntervals = () => live.size
  })
  await page.goto(PAGE)
  await page.waitForFunction(() => window.__ready === true)
  // The page's own four tiles are out of the way: the specs build what they measure.
  await page.evaluate(() => {
    document.getElementById('stage').replaceChildren()
  })
})

test('thirty live tiles updating every second record no long task under 4x CPU throttling', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CPU throttling and long-task timing are Chromium DevTools features')
  test.setTimeout((SECONDS + 60) * 1000)
  await page.setViewportSize({ width: 1280, height: 900 })
  const cdp = await page.context().newCDPSession(page)

  // Built and primed unthrottled: this test is about steady-state updates, not the first paint.
  await page.evaluate(async () => {
    const { dataFor } = await import('/test/browser/fixtures/data.js')
    const { WIDGETS } = await import('/src/core/index.js')
    const stage = document.getElementById('stage')
    stage.style.cssText = 'display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start;padding:16px'
    const tags = ['ts-today-pnl', 'ts-metric', 'ts-session-clock', 'ts-progress', 'ts-table', 'ts-watchlist', 'ts-chart', 'ts-open-positions', 'ts-edge-stats', 'ts-card']
    const specOf = (tag) => Object.values(WIDGETS).find((w) => w.tag === tag)
    // Eight variants of each tag's data, made now so a tick is only an assignment.
    const variants = Object.fromEntries(tags.map((tag) => [tag, Array.from({ length: 8 }, (_, i) => dataFor(tag, 1 + i * 0.07))]))
    const tiles = []
    for (let i = 0; i < 30; i++) {
      const tag = tags[i % tags.length]
      const el = document.createElement(tag)
      const sizes = specOf(tag).sizes
      el.setAttribute('size', sizes.includes('M') ? 'M' : sizes[0])
      el.style.width = '304px'
      if (tag === 'ts-card') el.insertAdjacentHTML('beforeend', '<span slot="value">42</span>')
      stage.append(el)
      tiles.push({ el, tag })
    }
    let step = 0
    const push = () => {
      step++
      for (const { el, tag } of tiles) {
        const v = variants[tag][step % 8]
        // Live with a fresh asOf, so the freshness ticker is in play too.
        el.data = v && typeof v === 'object' && !Array.isArray(v) ? { ...v, live: true, asOf: Date.now() } : v
      }
    }
    push()
    window.__perf = { tiles, push, longTasks: [] }
    // The host's feed: one second apart, started with the observer below.
    window.__start = () => {
      window.__perf.longTasks.length = 0
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.__perf.longTasks.push(Math.round(e.duration))
      }).observe({ type: 'longtask', buffered: false })
      window.__perf.timer = setInterval(push, 1000)
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
  // The page is about 3300 px tall and a tile is drawn while it is within one viewport height of the screen, so a
  // viewport of half the page puts all thirty in the render zone: what is measured is thirty live tiles, not the
  // eighteen of a short window. Stated and asserted rather than hoped for.
  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight)
  await page.setViewportSize({ width: 1280, height: Math.ceil(pageHeight / 2) })
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const live = await page.evaluate(() => window.__perf.tiles.filter(({ el }) => el._inView).length)
  console.log(`perf: ${live} of 30 tiles in the render zone, page ${pageHeight}px, viewport ${Math.ceil(pageHeight / 2)}px`)
  expect(live).toBe(30)
  // Every tile drew its content, not a skeleton.
  expect(await page.evaluate(() => window.__perf.tiles.every(({ el }) => !el.shadowRoot.querySelector('[part="tile"] [aria-busy="true"]')))).toBe(true)

  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE })
  try {
    await page.evaluate(() => window.__start())
    await page.waitForTimeout(SECONDS * 1000)
  } finally {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  }
  const longTasks = await page.evaluate(() => {
    clearInterval(window.__perf.timer)
    return window.__perf.longTasks
  })
  // The observer only reports tasks over 50 ms, so any entry at all is a long task.
  expect(longTasks.filter((ms) => ms > LONG_TASK_MS), `long tasks (ms): ${longTasks.join(', ')}`).toEqual([])
})

test('200 mount and unmount cycles leave no live interval', async ({ page }) => {
  test.setTimeout(120000)
  const before = await page.evaluate(() => window.__liveIntervals())
  const during = await page.evaluate(async () => {
    const { dataFor } = await import('/test/browser/fixtures/data.js')
    const stage = document.getElementById('stage')
    let peak = 0
    for (let i = 0; i < 200; i++) {
      // The three kinds of timer user: a clock (every 1 s), live data with an asOf (the 15 s freshness beat) and a calendar (every 60 s).
      const els = ['ts-session-clock', 'ts-today-pnl', 'ts-pnl-calendar'].map((tag) => {
        const el = document.createElement(tag)
        const data = dataFor(tag)
        el.data = tag === 'ts-session-clock' ? data : { ...data, live: true, asOf: Date.now() }
        stage.append(el)
        return el
      })
      await Promise.resolve()
      // Some cycles reach a render and a beat; some are gone before the first boundary.
      if (i % 20 === 0) await new Promise((resolve) => requestAnimationFrame(resolve))
      peak = Math.max(peak, window.__liveIntervals())
      for (const el of els) el.remove()
    }
    return { peak, after: window.__liveIntervals() }
  })
  // While tiles were mounted the ticker was one timer, not one per tile.
  expect(during.peak - before).toBeLessThanOrEqual(1)
  expect(during.after - before).toBe(0)
  // A leaked wait for the next second boundary would turn into an interval just after one.
  await page.waitForTimeout(2500)
  expect(await page.evaluate(() => window.__liveIntervals())).toBe(before)
})

test('a hidden or distant widget does no work, and draws once when it can be seen', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.evaluate(async () => {
    const { dataFor } = await import('/test/browser/fixtures/data.js')
    const stage = document.getElementById('stage')
    // The fixture's stage is a wrapping flex row; this one stacks.
    stage.style.cssText = 'display:block;padding:16px'
    const make = (parent) => {
      const el = document.createElement('ts-metric')
      el.style.width = '304px'
      el.renders = 0
      const update = el.update.bind(el)
      el.update = (...args) => {
        el.renders++
        return update(...args)
      }
      parent.append(el)
      return el
    }
    // Visible, hidden (display: none) and three screens down.
    const visible = make(stage)
    const hiddenBox = document.createElement('div')
    hiddenBox.style.display = 'none'
    stage.append(hiddenBox)
    const hidden = make(hiddenBox)
    const spacer = document.createElement('div')
    spacer.style.height = '2400px'
    stage.append(spacer)
    const far = make(stage)
    for (const el of [visible, hidden, far]) el.data = dataFor('ts-metric')
    window.__v = { visible, hidden, far, hiddenBox, dataFor, frames: () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))) }
    await window.__v.frames()
    // The observer has spoken by now; counting starts here.
    for (const el of [visible, hidden, far]) el.renders = 0
  })

  const state = () => page.evaluate(() => ({ visible: window.__v.visible.renders, hidden: window.__v.hidden.renders, far: window.__v.far.renders }))

  // A visible widget draws its content on connect, not a skeleton, and keeps drawing.
  expect(await page.evaluate(() => !!window.__v.visible.shadowRoot.querySelector('[part="value"]'))).toBe(true)
  await page.evaluate(async () => {
    const { visible, hidden, far, dataFor, frames } = window.__v
    for (const el of [visible, hidden, far]) el.data = { ...dataFor('ts-metric', 2), live: true }
    await frames()
  })
  let seen = await state()
  expect(seen.visible).toBe(1)
  expect(seen.hidden).toBe(0)
  expect(seen.far).toBe(0)

  // Several changes while out of sight cost nothing, and bringing them into view draws once with the latest.
  await page.evaluate(async () => {
    const { hidden, far, dataFor, frames } = window.__v
    for (const scale of [3, 4, 5]) {
      hidden.data = dataFor('ts-metric', scale)
      far.data = dataFor('ts-metric', scale)
      await frames()
    }
  })
  seen = await state()
  expect(seen.hidden).toBe(0)
  expect(seen.far).toBe(0)

  await page.evaluate(async () => {
    window.__v.hiddenBox.style.display = ''
    await window.__v.frames()
  })
  seen = await state()
  expect(seen.hidden).toBe(1)

  await page.evaluate(async () => {
    window.__v.far.scrollIntoView()
    await window.__v.frames()
  })
  seen = await state()
  expect(seen.far).toBe(1)
})

test('a tile two screens down draws its first content when data arrives after the observer has spoken', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  const seen = await page.evaluate(async () => {
    const { dataFor } = await import('/test/browser/fixtures/data.js')
    const stage = document.getElementById('stage')
    stage.style.cssText = 'display:block;padding:16px'
    const spacer = document.createElement('div')
    spacer.style.height = '4000px'
    stage.append(spacer)
    const frames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const el = document.createElement('ts-metric')
    el.setAttribute('label', 'Far metric')
    el.style.width = '304px'
    stage.append(el)
    // The host connects first and fetches after: the observer has said "out" before the data comes.
    await frames()
    await frames()
    el.data = dataFor('ts-metric')
    await frames()
    const tile = el.shadowRoot.querySelector('[part="tile"]')
    window.__far = el
    return { value: !!el.shadowRoot.querySelector('[part="value"]'), busy: !!el.shadowRoot.querySelector('[aria-busy="true"]'), label: tile ? tile.getAttribute('aria-label') : null, inView: el._inView }
  })
  // Out of the zone, yet drawn: the accessibility tree never holds a skeleton for data that has arrived.
  expect(seen.inView).toBe(false)
  expect(seen.value).toBe(true)
  expect(seen.busy).toBe(false)
  expect(seen.label).toMatch(/Far metric/)
  expect(seen.label).toMatch(/\d/)
  // Later changes while it is out of sight still wait, and are drawn when it is seen.
  const renders = await page.evaluate(async () => {
    const { dataFor } = await import('/test/browser/fixtures/data.js')
    const el = window.__far
    let n = 0
    const update = el.update.bind(el)
    el.update = (...args) => {
      n++
      return update(...args)
    }
    el.data = dataFor('ts-metric', 3)
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const waiting = n
    el.scrollIntoView()
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    return { waiting, after: n }
  })
  expect(renders).toEqual({ waiting: 0, after: 1 })
})

test('a printout draws every waiting tile before the beforeprint handlers return', async ({ page, browserName }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  const cdp = browserName === 'chromium' ? await page.context().newCDPSession(page) : null
  await page.evaluate(async () => {
    const { dataFor } = await import('/test/browser/fixtures/data.js')
    const stage = document.getElementById('stage')
    stage.style.cssText = 'display:block;padding:16px'
    const spacer = document.createElement('div')
    spacer.style.height = '3000px'
    stage.append(spacer)
    const tags = ['ts-today-pnl', 'ts-metric', 'ts-session-clock', 'ts-progress', 'ts-table', 'ts-watchlist', 'ts-chart', 'ts-open-positions', 'ts-edge-stats', 'ts-card']
    const tiles = []
    for (let i = 0; i < 30; i++) {
      const tag = tags[i % tags.length]
      const el = document.createElement(tag)
      el.style.cssText = 'width:304px;display:block;margin-bottom:12px'
      el.setAttribute('size', 'M')
      if (tag === 'ts-card') el.insertAdjacentHTML('beforeend', '<span slot="value">42</span>')
      el.data = dataFor(tag)
      el.renders = 0
      const update = el.update.bind(el)
      el.update = (...args) => {
        el.renders++
        return update(...args)
      }
      stage.append(el)
      tiles.push({ el, tag })
    }
    window.__tiles = tiles
    window.__dataFor = dataFor
    // Thirty first renders are time-sliced over several tasks (RFC 0003 §23), and how many tasks depends on the machine, so
    // a fixed wait leaves the last few undrawn on a slow one, and their first draw then lands after the counters are
    // reset below. Wait for each tile to be named and no longer busy: the condition the comment under this call states.
    for (let drawn = false; !drawn; ) {
      await new Promise((resolve) => requestAnimationFrame(resolve))
      drawn = tiles.every(({ el }) => {
        const tile = el.shadowRoot && el.shadowRoot.querySelector('.tile')
        return !!tile && !!tile.getAttribute('aria-label') && !tile.hasAttribute('aria-busy')
      })
    }
  })
  // All thirty are far below the screen and have drawn their first content. New data now has to wait.
  expect(await page.evaluate(() => window.__tiles.filter(({ el }) => !el._inView).length)).toBe(30)
  await page.evaluate(() => {
    for (const { el, tag } of window.__tiles) {
      el.renders = 0
      el.data = window.__dataFor(tag, 1.5)
    }
  })
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  expect(await page.evaluate(() => window.__tiles.filter(({ el }) => el.renders === 0).length)).toBe(30)

  if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE })
  try {
    // No await between the event and the count: a browser takes its snapshot as the handlers return.
    const drawn = await page.evaluate(() => {
      window.dispatchEvent(new Event('beforeprint'))
      return window.__tiles.filter(({ el }) => el.renders === 1).length
    })
    expect(drawn).toBe(30)
  } finally {
    if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  }
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
})

test('a host with display: contents is drawn, not left as a skeleton', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  const seen = await page.evaluate(async () => {
    const { dataFor } = await import('/test/browser/fixtures/data.js')
    const stage = document.getElementById('stage')
    stage.style.cssText = 'display:block;padding:16px'
    const frames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const el = document.createElement('ts-metric')
    el.style.display = 'contents'
    stage.append(el)
    await frames()
    el.data = dataFor('ts-metric')
    await frames()
    el.data = dataFor('ts-metric', 2)
    await frames()
    return { value: el.shadowRoot.querySelector('[part="value"]')?.textContent, busy: !!el.shadowRoot.querySelector('[aria-busy="true"]') }
  })
  expect(seen.busy).toBe(false)
  expect(seen.value).toBeTruthy()
})

test('a drag asks for the slot again only when the pointer crosses into another cell', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/test/browser/fixtures/grid.html?mode=explicit')
  await page.waitForFunction(() => window.__ready === true)
  await page.evaluate(() => { document.getElementById('g').editing = true })
  const centre = async (selector) => {
    const box = await page.locator(selector).boundingBox()
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  }
  const from = await centre('ts-grid .chrome[data-id="tasks"] .handle')
  const to = await centre('#g > [item="notes"]')
  await page.evaluate(() => {
    const g = document.getElementById('g')
    const track = g._track.bind(g)
    window.__memos = []
    g._track = (gesture) => {
      const out = track(gesture)
      const memo = gesture.memo
      window.__memos.push({ memo, col: memo && memo.col, row: memo && memo.row, target: out.target, same: memo && memo.target === out.target })
      return out
    }
  })
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  // A hundred one-pixel steps along the path, a frame after each: the drag asks once per frame, so the frames are what
  // outnumber the cells crossed. Left to itself WebKit sends all hundred moves inside a handful of frames, and the
  // count then says how fast the engine is, not whether the answer is reused.
  const steps = 100
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + ((to.x - 20 - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps)
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())))
  }
  await page.mouse.up()
  const calls = await page.evaluate(() => window.__memos.map(({ memo, col, row, same }) => ({ id: memo ? [col, row].join() : null, memo: memo ? 1 : 0, same })))
  const distinctMemos = await page.evaluate(() => new Set(window.__memos.map((m) => m.memo).filter(Boolean)).size)
  const cells = new Set(calls.map((c) => c.id).filter(Boolean))
  expect(calls.length).toBeGreaterThan(cells.size)
  // A handful of computed answers (a cell crossed, or a reorder that changed the tiles' order), not one per frame, and
  // every answer returned is the one the memo holds.
  expect(distinctMemos * 5).toBeLessThan(calls.length)
  expect(calls.every((c) => c.same)).toBe(true)
})
