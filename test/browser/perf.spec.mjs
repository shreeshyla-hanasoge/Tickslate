// Performance hygiene in a real engine (RFC 0003 §23): thirty live tiles updating every second stay under the
// long-task line at 4x CPU throttling, 200 mount/unmount cycles leave no interval behind, and a widget nobody can
// see does no work. Chromium only: the throttle is a DevTools call, and long-task timing is Chromium's.
//
// The update window is short by default so CI stays quick. The full check from the RFC is 60 s:
//
//   TICKSLATE_PERF_SECONDS=60 npx playwright test test/browser/perf.spec.mjs --project=chromium
//
// The fixture is the freshness page, emptied: it imports every widget and defines nothing else we need.
import { test, expect } from '@playwright/test'

test.skip(({ browserName }) => browserName !== 'chromium', 'CPU throttling and long-task timing are Chromium DevTools features')

const PAGE = '/test/browser/fixtures/freshness.html'
const SECONDS = Math.max(2, Number(process.env.TICKSLATE_PERF_SECONDS) || 8)
const LONG_TASK_MS = 50
const THROTTLE = 4

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

test('thirty live tiles updating every second record no long task under 4x CPU throttling', async ({ page }) => {
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
