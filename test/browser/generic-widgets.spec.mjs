// <ts-breakdown>, <ts-status> and <ts-feed> in real engines (RFC 0004 §4): every size in light and dark, text for every
// part and state, keyed updates that keep nodes and focus, a feed that prepends without moving the tile or the reader's
// place and never speaks, no sideways overflow at phone and desktop widths, and axe.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const PAGE = '/test/browser/fixtures/generic.html'
const SIZES = { breakdown: ['S', 'Wide', 'Tall', 'M'], status: ['S', 'Tall', 'M'], feed: ['Tall', 'M', 'L'] }
const THEMES = ['light', 'dark']
// A phone's one-column tile and a desktop tile of each footprint.
const WIDTH = { S: [170, 304], Tall: [170, 304], Wide: [351, 624], M: [358, 624], L: [600, 944] }

test.beforeEach(async ({ page }) => {
  // Network off: only the dev server answers.
  await page.context().route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname), (route) => route.abort())
})

async function open(page, query = '') {
  const errors = []
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()))
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${PAGE}?${query}`)
  await page.waitForFunction(() => window.__ready === true)
  await page.evaluate(() => window.__g.nextFrame())
  return errors
}

const frame = (page) => page.evaluate(() => window.__g.nextFrame())

// What a tile holds that a reader cannot reach: any element whose box leaves the tile, and any scroller that scrolls sideways.
const overflow = (page) =>
  page.evaluate(() => {
    const el = window.__g.el
    const tile = el.shadowRoot.querySelector('.tile')
    const box = tile.getBoundingClientRect()
    const out = []
    for (const node of el.shadowRoot.querySelectorAll('.tile *')) {
      if (node.closest('[hidden]') || node.closest('svg') && node.localName !== 'svg') continue
      const r = node.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) continue
      // Inside a scroller a row may be below the fold; only its sideways reach is a fault.
      if (r.left < box.left - 1 || r.right > box.right + 1) out.push(`${node.localName}.${node.getAttribute('class')} x ${r.left - box.left}..${r.right - box.left} of ${box.width}`)
    }
    for (const s of el.shadowRoot.querySelectorAll('.scroll')) if (s.scrollWidth > s.clientWidth + 1) out.push(`scroller scrolls sideways ${s.scrollWidth} > ${s.clientWidth}`)
    return { out, tile: { w: box.width, h: box.height }, page: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 }
  })

test.describe('every size, light and dark, phone and desktop widths', () => {
  for (const kind of Object.keys(SIZES)) {
    for (const size of SIZES[kind]) {
      for (const theme of THEMES) {
        test(`${kind} ${size} in ${theme}: draws, fits, no errors, passes axe`, async ({ page }) => {
          for (const width of WIDTH[size]) {
            const errors = await open(page, `kind=${kind}&size=${size}&width=${width}&theme=${theme}&negative`)
            const o = await overflow(page)
            expect(o.out, `${width}px`).toEqual([])
            expect(o.tile.h).toBeGreaterThan(100)
            expect(errors).toEqual([])
          }
          const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
          const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
          expect(bad.map((v) => `${v.id}: ${v.nodes[0].target.join(' ')}`)).toEqual([])
        })
      }
    }
  }

  test('a right-to-left page does not overflow either', async ({ page }) => {
    for (const [kind, size] of [['breakdown', 'M'], ['status', 'M'], ['feed', 'M']]) {
      await open(page, `kind=${kind}&size=${size}&width=358&rtl&negative`)
      expect((await overflow(page)).out, kind).toEqual([])
    }
  })

  test('the long-font stand-in does not overflow the narrow sizes', async ({ page }) => {
    for (const [kind, size] of [['breakdown', 'Wide'], ['status', 'Tall'], ['feed', 'Tall']]) {
      await open(page, `kind=${kind}&size=${size}&width=170&wide&negative`)
      expect((await overflow(page)).out, kind).toEqual([])
    }
  })
})

test.describe('<ts-breakdown>', () => {
  test('every part has its label and percentage in text, and the percentages sum to 100.0%', async ({ page }) => {
    await open(page, 'kind=breakdown&size=Tall&width=304&negative')
    const info = await page.evaluate(() => {
      const root = window.__g.el.shadowRoot
      const items = [...root.querySelectorAll('li[part="item"]')]
      return {
        items: items.map((li) => ({ label: li.getAttribute('aria-label'), text: li.textContent })),
        pcts: items.map((li) => li.querySelector('.pc').textContent),
        note: root.querySelector('[data-k="note"]').textContent,
        bar: { role: root.querySelector('[part="bar"]').getAttribute('role'), label: root.querySelector('[part="bar"]').getAttribute('aria-label') },
        tile: root.querySelector('.tile').getAttribute('aria-label'),
        segs: [...root.querySelectorAll('.seg')].map((s) => s.getBoundingClientRect().width),
      }
    })
    expect(info.items).toHaveLength(6)
    for (const i of info.items) expect(i.label).toMatch(/^.+, \d+\.\d%$/)
    for (const [n, i] of info.items.entries()) expect(i.text).toContain(i.label.split(', ')[0].slice(0, 6))
    expect(Math.round(info.pcts.reduce((a, p) => a + Number.parseFloat(p), 0) * 10)).toBe(1000)
    expect(info.items[5].label).toMatch(/^Other, /)
    expect(info.note).toBe('1 negative value left out')
    expect(info.bar.role).toBe('img')
    expect(info.bar.label).toMatch(/^Allocation: 7 parts, largest Equities 3 \d+\.\d%$/)
    expect(info.tile).toBe(`${info.bar.label}, live`)
    for (const w of info.segs) expect(w).toBeGreaterThan(2)
  })

  test('the donut is one image, with a ring segment for each part and the total in the middle', async ({ page }) => {
    await open(page, 'kind=breakdown&size=M&width=624')
    const info = await page.evaluate(() => {
      const root = window.__g.el.shadowRoot
      const svg = root.querySelector('svg[part="chart"]')
      const paths = [...svg.querySelectorAll('path')]
      const box = svg.getBoundingClientRect()
      const mid = root.querySelector('.mid').getBoundingClientRect()
      return { role: svg.getAttribute('role'), label: svg.getAttribute('aria-label'), paths: paths.map((p) => p.getAttribute('d')), mid: root.querySelector('.mid').textContent, centred: Math.abs(mid.left + mid.width / 2 - (box.left + box.width / 2)) < 2, square: Math.abs(box.width - box.height) < 1 }
    })
    expect(info.role).toBe('img')
    expect(info.paths).toHaveLength(6)
    for (const d of info.paths) expect(d).toMatch(/^M[\d. -]+ A.*Z$/)
    expect(info.mid).toMatch(/^Total ₹[\d,]+$/)
    expect(info.centred && info.square).toBe(true)
  })

  test('S draws a share bar filled to the largest part', async ({ page }) => {
    await open(page, 'kind=breakdown&size=S&width=304')
    const info = await page.evaluate(() => {
      const root = window.__g.el.shadowRoot
      const track = root.querySelector('[part="bar"]').getBoundingClientRect()
      const fill = root.querySelector('.fill').getBoundingClientRect()
      return { ratio: fill.width / track.width, share: root.querySelector('[data-k="share"]').textContent }
    })
    const pct = Number.parseFloat(info.share.split(' ').pop())
    expect(info.share).toMatch(/^Equities 3 \d+\.\d%$/)
    expect(Math.abs(info.ratio * 100 - pct)).toBeLessThan(0.6)
  })

  test('a changed value keeps every node: nothing in the legend, the bar or the ring is rebuilt', async ({ page }) => {
    await open(page, 'kind=breakdown&size=M&width=624')
    const kept = await page.evaluate(async () => {
      const g = window.__g
      const root = g.el.shadowRoot
      const mark = () => [...root.querySelectorAll('li[part="item"], svg path')].map((n, i) => { n.__k = i; return n })
      const before = mark()
      const data = JSON.parse(JSON.stringify(g.el.data))
      data.slices[1].value += 20000
      g.set(data)
      await g.nextFrame()
      const now = [...root.querySelectorAll('li[part="item"], svg path')]
      // Bonds now outranks Equities, so the rows reorder: the same nodes, in a new order.
      return { same: now.length === before.length && now.every((n) => before.includes(n)), pct: root.querySelectorAll('li[part="item"] .pc')[1].textContent }
    })
    expect(kept.same).toBe(true)
  })

  test('more than six parts fold into Other; a set that is all zero says there is nothing to break down', async ({ page }) => {
    await open(page, 'kind=breakdown&size=Wide&width=624&n=8')
    expect(await page.evaluate(() => [...window.__g.el.shadowRoot.querySelectorAll('li[part="item"] .nm')].map((n) => n.textContent).at(-1))).toBe('Other')
    await page.evaluate(() => window.__g.set({ slices: [{ label: 'a', value: 0 }, { label: 'b', value: 0 }] }))
    await frame(page)
    const info = await page.evaluate(() => {
      const root = window.__g.el.shadowRoot
      return { tile: root.querySelector('.tile').getAttribute('aria-label'), pcts: [...root.querySelectorAll('.pc')].map((n) => n.textContent), barHidden: root.querySelector('[part="bar"]').hasAttribute('hidden') }
    })
    expect(info).toEqual({ tile: 'Allocation: nothing to break down', pcts: ['0.0%', '0.0%'], barHidden: true })
  })

  test('forced colours: the segments keep an outline in the user\'s own colours', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'forced-colors emulation is Chromium\'s')
    await page.emulateMedia({ forcedColors: 'active' })
    await open(page, 'kind=breakdown&size=Wide&width=624')
    const edge = await page.evaluate(() => {
      const seg = window.__g.el.shadowRoot.querySelector('.seg')
      const s = getComputedStyle(seg)
      return { w: s.borderInlineEndWidth, c: s.borderInlineEndColor }
    })
    expect(edge.w).toBe('2px')
    expect(edge.c).not.toBe('rgba(0, 0, 0, 0)')
  })
})

test.describe('<ts-status>', () => {
  test('is a table with header cells, a state in words beside each dot, and shapes that differ', async ({ page }) => {
    await open(page, 'kind=status&size=M&width=624')
    const info = await page.evaluate(() => {
      const root = window.__g.el.shadowRoot
      const marks = [...root.querySelectorAll('tbody .mk')].map((m) => {
        const s = getComputedStyle(m)
        return { state: m.getAttribute('class'), hidden: m.getAttribute('aria-hidden'), radius: s.borderRadius, clip: s.clipPath, border: s.borderTopWidth, text: m.nextSibling.textContent }
      })
      return {
        cols: [...root.querySelectorAll('thead th[scope="col"]')].map((th) => th.textContent),
        headVisible: root.querySelector('thead th').getBoundingClientRect().height > 8,
        rowHeads: root.querySelectorAll('tbody th[scope="row"]').length,
        marks,
        caption: root.querySelector('caption').textContent,
        tile: root.querySelector('.tile').getAttribute('aria-label'),
      }
    })
    expect(info.cols).toEqual(['Name', 'Status', 'Since'])
    expect(info.headVisible).toBe(true)
    expect(info.rowHeads).toBe(info.marks.length)
    const by = Object.fromEntries(info.marks.map((m) => [m.state.split(' ')[1], m]))
    expect(Object.keys(by).sort()).toEqual(['degraded', 'down', 'ok', 'unknown'])
    expect(by.ok.radius).toBe('50%')
    expect(by.degraded.clip).toContain('polygon')
    expect(by.down.radius).toBe('0px')
    expect(by.down.clip).toBe('none')
    expect(by.unknown.radius).toBe('50%')
    expect(by.unknown.border).toBe('2px')
    expect(info.marks.map((m) => [m.state.split(' ')[1], m.text])).toEqual(expect.arrayContaining([['ok', 'OK'], ['degraded', 'Degraded'], ['down', 'Down'], ['unknown', 'Unknown']]))
    for (const m of info.marks) expect(m.hidden).toBe('true')
    expect(info.tile).toBe(`${info.caption}, live`)
    expect(info.tile).toMatch(/^Services, 3 of 6 OK, Down, live$/)
  })

  test('Tall hides the header row\'s room, S shows only the summary and the worst state', async ({ page }) => {
    await open(page, 'kind=status&size=Tall&width=304')
    expect(await page.evaluate(() => window.__g.el.shadowRoot.querySelector('thead th').getBoundingClientRect().height)).toBeLessThan(1)
    await open(page, 'kind=status&size=S&width=304')
    const s = await page.evaluate(() => {
      const root = window.__g.el.shadowRoot
      return { table: !!root.querySelector('table'), sum: root.querySelector('[data-k="sum"]').textContent, state: root.querySelector('[data-k="otext"]').textContent, mark: root.querySelector('[data-k="odot"]').getAttribute('class') }
    })
    expect(s).toEqual({ table: false, sum: '3 of 6 OK', state: 'Down', mark: 'mk down' })
  })

  test('a change of one state rewrites that row and keeps every node, and the focus', async ({ page }) => {
    await open(page, 'kind=status&size=M&width=624')
    const r = await page.evaluate(async () => {
      const g = window.__g
      const root = g.el.shadowRoot
      const scroll = root.querySelector('.scroll')
      scroll.focus()
      const rows = [...root.querySelectorAll('tbody tr')]
      const cells = rows.flatMap((tr) => [...tr.children])
      const data = JSON.parse(JSON.stringify(g.el.data))
      data.rows[0].state = 'down'
      g.set(data)
      await g.nextFrame()
      const now = [...root.querySelectorAll('tbody tr')]
      return {
        same: now.length === rows.length && now.every((tr, i) => tr === rows[i]) && now.flatMap((tr) => [...tr.children]).every((c, i) => c === cells[i]),
        first: rows[0].children[1].textContent,
        focused: root.activeElement === scroll,
        tile: root.querySelector('.tile').getAttribute('aria-label'),
      }
    })
    expect(r.same).toBe(true)
    expect(r.first).toContain('Down')
    expect(r.focused).toBe(true)
    expect(r.tile).toBe('Services, 2 of 6 OK, Down, live')
  })

  test('nothing in the tile is live: a service going down changes text silently', async ({ page }) => {
    await open(page, 'kind=status&size=M&width=624')
    expect(await page.evaluate(() => window.__g.el.shadowRoot.querySelectorAll('[aria-live], [role="alert"], [role="status"], [role="log"]').length)).toBe(0)
  })
})

test.describe('<ts-feed>', () => {
  test('is a list in order, each event with its time, tag and text, and the tile is named by the latest', async ({ page }) => {
    await open(page, 'kind=feed&size=M&width=624')
    const info = await page.evaluate(() => {
      const root = window.__g.el.shadowRoot
      const items = [...root.querySelectorAll('ul[part="list"] > li[part="item"]')]
      return {
        count: items.length,
        first: [...items[0].children].map((c) => c.textContent),
        labels: items.slice(0, 2).map((li) => li.getAttribute('aria-label')),
        tile: root.querySelector('.tile').getAttribute('aria-label'),
        scroller: { tabindex: root.querySelector('.scroll').getAttribute('tabindex'), label: root.querySelector('.scroll').getAttribute('aria-label') },
        live: root.querySelectorAll('[aria-live], [role="alert"], [role="status"], [role="log"]').length,
      }
    })
    expect(info.count).toBe(14)
    expect(info.first).toEqual(['11:41', 'Exit', 'Stop hit 3', 'Gap fade, 25 at 94.10'])
    expect(info.labels[0]).toBe('11:41, Exit: Stop hit 3')
    expect(info.tile).toBe('Activity, 14 events, latest: Stop hit 3, live')
    expect(info.scroller).toEqual({ tabindex: '0', label: 'Activity' })
    expect(info.live).toBe(0)
  })

  test('shows 50 items by default and says how many older ones it left out', async ({ page }) => {
    await open(page, 'kind=feed&size=Tall&width=304&n=62')
    const info = await page.evaluate(() => {
      const root = window.__g.el.shadowRoot
      return { count: root.querySelectorAll('li[part="item"]').length, more: root.querySelector('[data-k="more"]').textContent, hidden: root.querySelector('[data-k="more"]').hasAttribute('hidden') }
    })
    expect(info).toEqual({ count: 50, more: '12 older events not shown', hidden: false })
  })

  test('an arrival at the top inserts one row at the front, keeps every other node and does not resize the tile', async ({ page }) => {
    await open(page, 'kind=feed&size=M&width=624')
    const r = await page.evaluate(async () => {
      const g = window.__g
      const root = g.el.shadowRoot
      const box = () => { const b = g.el.getBoundingClientRect(); return [b.width, b.height] }
      const rows = [...root.querySelectorAll('li[part="item"]')]
      const before = box()
      g.tick(1)
      await g.nextFrame()
      const now = [...root.querySelectorAll('li[part="item"]')]
      return { sizeSame: JSON.stringify(before) === JSON.stringify(box()), count: now.length, kept: rows.every((n, i) => now[i + 1] === n), top: root.querySelector('.scroll').scrollTop, firstText: now[0].querySelector('.tx').textContent }
    })
    expect(r.sizeSame).toBe(true)
    expect(r.count).toBe(15)
    expect(r.kept).toBe(true)
    expect(r.top).toBe(0)
    expect(r.firstText).toMatch(/^Order filled|Latency|Stop|Session|Margin|Order rejected/)
  })

  test('scrolled down, arrivals leave what the reader is looking at exactly where it was', async ({ page }) => {
    await open(page, 'kind=feed&size=M&width=624&n=30')
    const r = await page.evaluate(async () => {
      const g = window.__g
      const root = g.el.shadowRoot
      const scroll = root.querySelector('.scroll')
      scroll.scrollTop = 160
      await g.nextFrame()
      const pick = () => {
        const top = scroll.getBoundingClientRect().top
        const li = [...root.querySelectorAll('li[part="item"]')].find((n) => n.getBoundingClientRect().bottom > top + 4)
        return { li, y: li.getBoundingClientRect().top - top, id: li.querySelector('.tx').textContent }
      }
      const a = pick()
      const moves = []
      for (const step of [1, 2, 3]) {
        g.tick(step)
        await g.nextFrame()
        const now = [...root.querySelectorAll('li[part="item"]')].find((n) => n === a.li)
        moves.push(Math.abs(now.getBoundingClientRect().top - scroll.getBoundingClientRect().top - a.y))
      }
      return { moves, scrollTop: scroll.scrollTop }
    })
    for (const m of r.moves) expect(m).toBeLessThan(1.5)
    expect(r.scrollTop).toBeGreaterThan(160)
  })

  test('focus in a row survives a tick', async ({ page }) => {
    await open(page, 'kind=feed&size=M&width=624')
    const r = await page.evaluate(async () => {
      const g = window.__g
      const root = g.el.shadowRoot
      const scroll = root.querySelector('.scroll')
      scroll.focus()
      g.tick(1)
      await g.nextFrame()
      g.tick(2)
      await g.nextFrame()
      return root.activeElement === scroll
    })
    expect(r).toBe(true)
  })

  test('Tall puts the small time and the tag on one line, M gives the time a column and shows the detail', async ({ page }) => {
    await open(page, 'kind=feed&size=Tall&width=304')
    const tall = await page.evaluate(() => {
      const li = window.__g.el.shadowRoot.querySelector('li[part="item"]')
      const [tm, tg, tx, dt] = [...li.children].map((c) => c.getBoundingClientRect())
      return { sameLine: Math.abs(tm.top - tg.top) < 14, textBelow: tx.top >= tm.bottom - 1, detailShown: dt.height > 0 }
    })
    expect(tall).toEqual({ sameLine: true, textBelow: true, detailShown: false })
    await open(page, 'kind=feed&size=M&width=624')
    const wide = await page.evaluate(() => {
      const li = window.__g.el.shadowRoot.querySelector('li[part="item"]')
      const [tm, tg, tx, dt] = [...li.children].map((c) => c.getBoundingClientRect())
      return { rowOrder: tm.left < tg.left && tg.left < tx.left, detailBelow: dt.top >= tx.bottom - 1, detailShown: dt.height > 0 }
    })
    expect(wide).toEqual({ rowOrder: true, detailBelow: true, detailShown: true })
  })
})
