// <ts-pnl-calendar> in real engines (RFC 0003 §21.1): the grid as a real ARIA grid (rows and gridcells), every cell named with its date and signed
// value, the loss cue, the roving tabindex and its keys, the phone's two half-year bands, and no overflow at phone widths, in
// light, dark, a monospace preset and wide fonts.
import { test, expect } from '@playwright/test'

const PAGE = '/test/browser/fixtures/calendar.html'

test.beforeEach(async ({ page }) => {
  // Network off: only the dev server answers.
  await page.context().route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname), (route) => route.abort())
})

async function open(page, query = '') {
  await page.goto(`${PAGE}?${query}`)
  await page.waitForFunction(() => window.__ready === true)
  await page.evaluate(() => window.__c.nextFrame())
}

const cellInfo = (page) =>
  page.evaluate(() =>
    [...window.__c.el.shadowRoot.querySelectorAll('.c')].map((c) => ({ date: c.getAttribute('data-d'), cls: c.getAttribute('class'), name: c.getAttribute('aria-label'), tab: c.getAttribute('tabindex') })),
  )

const activeDate = (page) => page.evaluate(() => window.__c.el.shadowRoot.activeElement?.getAttribute('data-d') ?? null)

test.describe('the grid', () => {
  test('is a grid of rows and cells with a summary, and the weeks per size are 6, 13 and a year', async ({ page }) => {
    for (const [size, weeks] of [['Tall', 6], ['M', 13], ['Banner', 53]]) {
      await open(page, `size=${size}&locale=en-GB`)
      const info = await page.evaluate(() => {
        const root = window.__c.el.shadowRoot
        const grid = root.querySelector('[data-k="grid"]')
        const summary = root.getElementById ? root.getElementById('summary') : root.querySelector('#summary')
        return {
          role: grid.getAttribute('role'),
          name: grid.getAttribute('aria-label'),
          describedby: grid.getAttribute('aria-describedby'),
          label: summary.textContent,
          rows: grid.querySelectorAll('[role="row"]').length,
          cellRoles: [...new Set([...grid.querySelectorAll('.c')].map((c) => c.getAttribute('role')))],
          weeks: grid.querySelector('[role="row"]').querySelectorAll('.c').length,
          perWeek: grid.querySelectorAll('.band')[0].querySelectorAll('[role="row"]').length,
          bands: grid.querySelectorAll('.band').length,
          months: [...grid.querySelectorAll('.mrow')].every((m) => m.getAttribute('aria-hidden') === 'true'),
          titles: grid.querySelectorAll('[title]').length,
        }
      })
      expect(info.role).toBe('grid')
      expect(info.name).toBe('Daily P&L calendar')
      expect(info.describedby).toBe('summary')
      expect(info.cellRoles).toEqual(['gridcell'])
      expect(info.rows).toBe(5)
      expect(info.months).toBe(true)
      expect(info.titles).toBe(0)
      expect(info.weeks, size).toBe(weeks)
      // en-GB: Monday to Friday, with no cell for the weekend.
      expect(info.perWeek).toBe(5)
      expect(info.bands).toBe(1)
      expect(info.label).toMatch(/^Daily P&L calendar, .* to 5 Aug 2026: best day \w{3} \d+ \w+, \+₹?[\d,.]+, worst day \w{3} \d+ \w+, −₹?[\d,.]+, net [+−]₹?[\d,.]+(\. \d+ weekend entr(y|ies) not shown)?$/)
    }
  })

  test('names every cell with its date and signed value, and says so when a day has none', async ({ page }) => {
    await open(page, 'size=M&locale=en-GB')
    const cells = await cellInfo(page)
    expect(cells.length).toBe(13 * 5)
    const gain = cells.find((c) => c.cls === 'c pos')
    const loss = cells.find((c) => c.cls === 'c neg')
    expect(gain.name).toMatch(/^\w{3} \d+ \w{3}, \+₹?[\d,.]+$/)
    expect(loss.name).toMatch(/^\w{3} \d+ \w{3}, −₹?[\d,.]+$/)
    expect(cells.find((c) => c.date === '2026-08-05').name).toBe('Wed 5 Aug, +₹1,240.00')
    expect(cells.find((c) => c.date === '2026-08-06').name).toBe('Thu 6 Aug, upcoming')
    expect(cells.some((c) => /, no entry$/.test(c.name))).toBe(true)
    // A weekend entry is in the totals and is not a cell.
    expect(cells.some((c) => ['Sat', 'Sun'].includes(new Date(`${c.date}T00:00:00Z`).toUTCString().slice(0, 3)))).toBe(false)
  })

  test('draws a loss with a corner mark that has a box and pixels, and a gain with none', async ({ page }) => {
    await open(page, 'size=M')
    const marks = await page.evaluate(() => {
      const root = window.__c.el.shadowRoot
      const style = (sel) => {
        const after = getComputedStyle(root.querySelector(sel), '::after')
        return { content: after.content, display: after.display, bg: after.backgroundColor, ink: getComputedStyle(root.querySelector('.tile')).color, w: parseFloat(after.width), h: parseFloat(after.height) }
      }
      return { loss: style('.c.neg'), gain: style('.c.pos') }
    })
    expect(marks.loss.content).not.toBe('none')
    expect(marks.loss.display).not.toBe('none')
    expect(marks.loss.bg).toBe(marks.loss.ink)
    // A mark that is not rendered has no width at all (NaN), and one that is has an area.
    expect(marks.loss.w).toBeGreaterThan(2)
    expect(marks.loss.h).toBeGreaterThan(2)
    expect(marks.gain.content === 'none' || marks.gain.content === 'normal').toBe(true)
    // The pixels: hiding the mark changes a loss cell's picture and leaves a gain's alone.
    const shot = (sel) => page.locator(`ts-pnl-calendar ${sel}`).first().screenshot()
    const lossBefore = await shot('.c.neg')
    const gainBefore = await shot('.c.pos')
    await page.evaluate(() => {
      const st = document.createElement('style')
      st.textContent = '.c.neg::after { display: none !important; }'
      window.__c.el.shadowRoot.append(st)
    })
    expect((await shot('.c.neg')).equals(lossBefore)).toBe(false)
    expect((await shot('.c.pos')).equals(gainBefore)).toBe(true)
  })

  test('mixes a stronger day from more of its colour, and draws an upcoming day as an outline', async ({ page }) => {
    await open(page, 'size=M')
    const paint = await page.evaluate(() => {
      const root = window.__c.el.shadowRoot
      const cells = [...root.querySelectorAll('.c.pos')]
      const strength = (c) => parseFloat(c.style.getPropertyValue('--s'))
      cells.sort((a, b) => strength(a) - strength(b))
      const alpha = (c) => {
        const m = getComputedStyle(c).backgroundColor.match(/[\d.]+/g)
        return m.length > 3 ? Number(m[3]) : 1
      }
      const up = getComputedStyle(root.querySelector('.c.up'))
      const none = getComputedStyle(root.querySelector('.c.none'))
      return { weak: strength(cells[0]), strong: strength(cells.at(-1)), weakAlpha: alpha(cells[0]), strongAlpha: alpha(cells.at(-1)), upBg: up.backgroundColor, upShadow: up.boxShadow, noneBg: none.backgroundColor }
    })
    expect(paint.weak).toBeGreaterThanOrEqual(22)
    expect(paint.strong).toBe(100)
    expect(paint.strongAlpha).toBeGreaterThan(paint.weakAlpha)
    expect(paint.upBg).toBe('rgba(0, 0, 0, 0)')
    expect(paint.upShadow).not.toBe('none')
    expect(paint.noneBg).not.toBe('rgba(0, 0, 0, 0)')
  })

  test('reads the day in the formatter\'s zone: west of the date line it is still the 4th, so the 5th is upcoming', async ({ page }) => {
    await open(page, 'size=M&tz=Pacific/Pago_Pago')
    const cells = await cellInfo(page)
    expect(cells.find((c) => c.date === '2026-08-05').cls).toBe('c up')
    expect(cells.find((c) => c.date === '2026-08-04').cls).toMatch(/c (pos|neg|none|flat)/)
  })

  test('with no entry in view it says so and still draws the weeks', async ({ page }) => {
    await open(page, 'size=Tall&today=2031-01-07')
    const info = await page.evaluate(() => {
      const root = window.__c.el.shadowRoot
      return { none: root.querySelector('[data-k="none"]').hidden, text: root.querySelector('[data-k="none"]').textContent, cells: root.querySelectorAll('.c').length, label: root.querySelector('#summary').textContent }
    })
    expect(info.none).toBe(false)
    expect(info.text).toBe('No trading days in this period')
    expect(info.cells).toBeGreaterThan(20)
    expect(info.label).toMatch(/: no trading days$/)
  })
})

test.describe('the window', () => {
  const dates = (page) => page.evaluate(() => [...window.__c.el.shadowRoot.querySelectorAll('.c')].map((c) => c.getAttribute('data-d')))

  test('rolls forward when today moves to a new week: the old cells are replaced by the new window', async ({ page }) => {
    await open(page, 'size=M&locale=en-GB')
    let all = await dates(page)
    expect(all[0]).toBe('2026-05-11')
    expect(all.at(-1)).toBe('2026-08-07')
    expect(all).not.toContain('2026-08-12')
    await page.evaluate(() => window.__c.setToday('2026-08-12'))
    await page.evaluate(() => window.__c.nextFrame())
    all = await dates(page)
    expect(all).toContain('2026-08-12')
    expect(all[0]).toBe('2026-05-18')
    expect(all.at(-1)).toBe('2026-08-14')
    const names = await cellInfo(page)
    expect(names.find((c) => c.date === '2026-08-12').name).toBe('Wed 12 Aug, no entry')
    expect(names.find((c) => c.date === '2026-08-14').name).toBe('Fri 14 Aug, upcoming')
    expect(names.filter((c) => c.tab === '0')).toHaveLength(1)
  })

  test('rolls across a Monday midnight in the formatter\'s zone with no new data', async ({ page }) => {
    await open(page, 'size=Tall&locale=en-GB')
    // 23:59 on Sunday 9 Aug in Kolkata is 18:29 UTC; two minutes later it is Monday.
    await page.evaluate(() => { window.__c.setNow(Date.UTC(2026, 7, 9, 18, 29)) })
    await page.evaluate(() => window.__c.nextFrame())
    let all = await dates(page)
    expect(all.at(-1)).toBe('2026-08-07')
    expect(all).not.toContain('2026-08-10')
    await page.evaluate(() => { window.__c.setNow(Date.UTC(2026, 7, 9, 18, 31)) })
    await page.evaluate(() => window.__c.nextFrame())
    all = await dates(page)
    expect(all).toContain('2026-08-10')
    expect(all.at(-1)).toBe('2026-08-14')
    expect(all[0]).toBe('2026-07-06')
    expect((await cellInfo(page)).find((c) => c.date === '2026-08-10').name).toBe('Mon 10 Aug, no entry')
  })

  test('redraws the dates when the locale changes the first day of the week', async ({ page }) => {
    await open(page, 'size=Tall&locale=en-GB')
    const gb = await dates(page)
    await page.evaluate(() => window.__c.el.setAttribute('locale', 'ar-SA'))
    await page.evaluate(() => window.__c.nextFrame())
    const sa = await dates(page)
    // ar-SA starts its week on Sunday, with Friday and Saturday off, where en-GB is Monday and Saturday-Sunday: the cells differ.
    const first = await page.evaluate(() => new Intl.Locale('ar-SA').firstDay ?? null)
    if (first !== null || (await page.evaluate(() => typeof Intl.Locale.prototype.getWeekInfo === 'function' || 'weekInfo' in Intl.Locale.prototype))) {
      expect(sa).not.toEqual(gb)
      expect(new Set(sa).size).toBe(sa.length)
      // Every cell carries the date it is named for.
      const named = await cellInfo(page)
      for (const c of named) expect(c.name.length).toBeGreaterThan(5)
      const grid = await page.evaluate(() => window.__c.el.shadowRoot.querySelectorAll('[role="row"]').length)
      expect(grid).toBe(5)
    }
    await page.evaluate(() => window.__c.el.setAttribute('locale', 'en-GB'))
    await page.evaluate(() => window.__c.nextFrame())
    expect(await dates(page)).toEqual(gb)
  })

  test('says what a weekend entry left out, and has an empty state when only weekends were sent', async ({ page }) => {
    await open(page, 'size=Banner&locale=en-GB')
    const info = await page.evaluate(() => {
      const root = window.__c.el.shadowRoot
      return { note: root.querySelector('[data-k="none"]').textContent, hidden: root.querySelector('[data-k="none"]').hidden, summary: root.getElementById('summary').textContent }
    })
    expect(info.hidden).toBe(false)
    expect(info.note).toMatch(/^\d+ weekend entr(y|ies) not shown$/)
    expect(info.summary).toMatch(/\. \d+ weekend entr(y|ies) not shown$/)
    await page.evaluate(() => window.__c.setDays([{ date: '2026-08-01', pnl: 900 }]))
    await page.evaluate(() => window.__c.nextFrame())
    const only = await page.evaluate(() => window.__c.el.shadowRoot.querySelector('[data-k="none"]').textContent)
    expect(only).toBe('No trading days in this period')
  })
})

test.describe('forced colours', () => {
  test('keep the heat: strength steps, and no entry, flat and upcoming look different', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' })
    await open(page, 'size=M')
    const look = await page.evaluate(() => {
      const root = window.__c.el.shadowRoot
      const of = (el) => {
        const s = getComputedStyle(el)
        return { bg: s.backgroundColor, style: s.borderTopStyle, width: s.borderTopWidth }
      }
      const by = (cls) => [...root.querySelectorAll(`.c.${cls}`)]
      const strength = (c) => parseFloat(c.style.getPropertyValue('--s'))
      const pos = by('pos').sort((a, b) => strength(a) - strength(b))
      const neg = by('neg').sort((a, b) => strength(a) - strength(b))
      // A flat day exists only in some data: make one.
      return { weakPos: of(pos[0]), strongPos: of(pos.at(-1)), weakNeg: of(neg[0]), strongNeg: of(neg.at(-1)), none: of(by('none')[0]), up: of(by('up')[0]), flatPossible: by('flat').length }
    })
    expect(look.weakPos.bg).not.toBe(look.strongPos.bg)
    expect(look.weakNeg.bg).not.toBe(look.strongNeg.bg)
    expect(look.none.style).toBe('dotted')
    expect(look.up.style).toBe('dashed')
    expect(look.weakNeg.style).toBe('double')
    expect(look.none.style).not.toBe(look.up.style)
    // A flat day is solid with a ButtonFace fill, not the dotted outline of a day with no entry.
    await page.evaluate(() => window.__c.setDays([{ date: '2026-08-03', pnl: 0 }, { date: '2026-08-04', pnl: 5 }]))
    await page.evaluate(() => window.__c.nextFrame())
    const flat = await page.evaluate(() => {
      const root = window.__c.el.shadowRoot
      const s = getComputedStyle(root.querySelector('.c.flat'))
      const n = getComputedStyle(root.querySelector('.c.none'))
      return { flat: [s.backgroundColor, s.borderTopStyle], none: [n.backgroundColor, n.borderTopStyle] }
    })
    expect(flat.flat[1]).toBe('solid')
    expect(flat.none[1]).toBe('dotted')
    expect(flat.flat).not.toEqual(flat.none)
  })
})

test.describe('the accessibility tree', () => {
  test('is a grid of rows and named gridcells, with the summary as its description', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the full tree is read over CDP, which only Chromium has')
    await open(page, 'size=Tall&locale=en-GB')
    const cdp = await page.context().newCDPSession(page)
    const { nodes } = await cdp.send('Accessibility.getFullAXTree')
    const byId = new Map(nodes.map((n) => [n.nodeId, n]))
    const role = (n) => (n.role ? n.role.value : '')
    const grid = nodes.find((n) => role(n) === 'grid')
    expect(grid, 'a grid is in the tree').toBeTruthy()
    expect(grid.name.value).toBe('Daily P&L calendar')
    expect(grid.description.value).toMatch(/^Daily P&L calendar, .* to 5 Aug 2026: best day/)
    const rows = nodes.filter((n) => role(n) === 'row')
    const cells = nodes.filter((n) => role(n) === 'gridcell')
    expect(rows).toHaveLength(5)
    expect(cells).toHaveLength(30)
    // Every gridcell is a child of a row, and every row of the grid (or a group inside it), and each has a name with its date.
    for (const c of cells) {
      expect(role(byId.get(c.parentId))).toBe('row')
      expect(c.name.value).toMatch(/^\w{3} \d+ \w{3}, /)
    }
    for (const r of rows) {
      let p = byId.get(r.parentId)
      while (p && !['grid', 'rowgroup'].includes(role(p))) p = byId.get(p.parentId)
      expect(p).toBeTruthy()
    }
    // The month names are out of the tree.
    expect(nodes.some((n) => !n.ignored && /^(Jul|Aug)$/.test(n.name?.value ?? ''))).toBe(false)
    console.log(`ax tree: grid "${grid.name.value}", ${rows.length} rows, ${cells.length} gridcells, first: "${cells[0].name.value}", last: "${cells.at(-1).name.value}"`)
  })

  test('has no serious axe violation', async ({ page }) => {
    const { default: AxeBuilder } = await import('@axe-core/playwright')
    for (const q of ['size=Banner', 'size=Banner&width=351', 'size=Tall&width=170', 'size=M&theme=dark']) {
      await open(page, q)
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
      expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id), q).toEqual([])
    }
  })
})

test.describe('the keyboard', () => {
  test('one cell is the tab stop, today to begin with, and the arrows move the focus and the stop with it', async ({ page }) => {
    await open(page, 'size=M&locale=en-GB')
    let cells = await cellInfo(page)
    expect(cells.filter((c) => c.tab === '0').map((c) => c.date)).toEqual(['2026-08-05'])
    await page.evaluate(() => window.__c.el.shadowRoot.querySelector('.c[tabindex="0"]').focus())
    expect(await activeDate(page)).toBe('2026-08-05')
    await page.keyboard.press('ArrowUp')
    expect(await activeDate(page)).toBe('2026-08-04')
    await page.keyboard.press('ArrowLeft')
    expect(await activeDate(page)).toBe('2026-07-28')
    await page.keyboard.press('ArrowDown')
    expect(await activeDate(page)).toBe('2026-07-29')
    await page.keyboard.press('Home')
    expect(await activeDate(page)).toBe('2026-05-13')
    await page.keyboard.press('End')
    expect(await activeDate(page)).toBe('2026-08-05')
    await page.keyboard.press('Control+Home')
    expect(await activeDate(page)).toBe('2026-05-11')
    await page.keyboard.press('Control+End')
    expect(await activeDate(page)).toBe('2026-08-07')
    cells = await cellInfo(page)
    expect(cells.filter((c) => c.tab === '0').map((c) => c.date)).toEqual(['2026-08-07'])
  })

  test('stops at an edge and takes no other key', async ({ page }) => {
    await open(page, 'size=Tall&locale=en-GB')
    await page.evaluate(() => window.__c.el.shadowRoot.querySelector('.c[data-d="2026-06-29"]').focus())
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowLeft')
    expect(await activeDate(page)).toBe('2026-06-29')
    await page.keyboard.press('Enter')
    expect(await activeDate(page)).toBe('2026-06-29')
  })

  test('Page Down and Page Up move a month, and Home and End stay in the row', async ({ page }) => {
    await open(page, 'size=Banner&locale=en-GB')
    await page.evaluate(() => window.__c.el.shadowRoot.querySelector('.c[data-d="2026-03-04"]').focus())
    await page.keyboard.press('PageDown')
    expect(await activeDate(page)).toBe('2026-04-01')
    await page.keyboard.press('PageUp')
    expect(await activeDate(page)).toBe('2026-03-04')
    await page.keyboard.press('Home')
    expect(await activeDate(page)).toBe('2025-08-06')
  })

  test('Tab enters the grid on one stop and does not walk the other cells', async ({ page }) => {
    await open(page, 'size=M&locale=en-GB')
    await page.keyboard.press('Tab')
    expect(await activeDate(page)).toBe('2026-08-05')
    await page.keyboard.press('Tab')
    // Another Tab leaves the grid (some engines keep the page's last focus when nothing follows); it never lands on a second cell.
    expect([null, '2026-08-05']).toContain(await activeDate(page))
  })

  test('a click on a cell makes it the stop, and a new reading keeps the focus on its date', async ({ page }) => {
    await open(page, 'size=M&width=351&locale=en-GB')
    await page.locator('ts-pnl-calendar .c[data-d="2026-07-15"]').click()
    expect(await activeDate(page)).toBe('2026-07-15')
    await page.evaluate(() => window.__c.tick(3))
    await page.evaluate(() => window.__c.nextFrame())
    expect(await activeDate(page)).toBe('2026-07-15')
    expect((await cellInfo(page)).filter((c) => c.tab === '0').map((c) => c.date)).toEqual(['2026-07-15'])
    // The live reading changed today's cell and the net, in place.
    expect((await cellInfo(page)).find((c) => c.date === '2026-08-05').name).toBe('Wed 5 Aug, +₹1,270.00')
  })

  test('the focus ring is drawn and visible', async ({ page }) => {
    await open(page, 'size=M')
    await page.keyboard.press('Tab')
    const outline = await page.evaluate(() => {
      const s = getComputedStyle(window.__c.el.shadowRoot.activeElement)
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) }
    })
    expect(outline.style).toBe('solid')
    expect(outline.width).toBeGreaterThanOrEqual(2)
  })
})

test.describe('on a phone', () => {
  test('a Banner is two half-year bands, and a wide one is one', async ({ page }) => {
    await open(page, 'size=Banner&width=351&locale=en-GB')
    const info = await page.evaluate(() => {
      const root = window.__c.el.shadowRoot
      const bands = [...root.querySelectorAll('.band')]
      return { bands: bands.length, weeks: bands.map((b) => b.querySelector('[role="row"]').querySelectorAll('.c').length), cells: root.querySelectorAll('.c').length, box: window.__c.el.getBoundingClientRect().height }
    })
    expect(info.bands).toBe(2)
    expect(info.weeks).toEqual([27, 26])
    expect(info.cells).toBe(53 * 5)
    expect(info.box).toBe(316)
    await page.evaluate(() => { window.__c.width(1264); window.__c.el.style.height = '150px' })
    await page.evaluate(() => window.__c.nextFrame())
    await page.waitForFunction(() => window.__c.el.shadowRoot.querySelectorAll('.band').length === 1)
    expect(await page.evaluate(() => window.__c.el.shadowRoot.querySelectorAll('.c').length)).toBe(53 * 5)
  })

  test('folding keeps the focus on the same date', async ({ page }) => {
    await open(page, 'size=Banner&width=1264&locale=en-GB')
    await page.evaluate(() => window.__c.el.shadowRoot.querySelector('.c[data-d="2026-03-04"]').focus())
    await page.evaluate(() => window.__c.width(351))
    await page.waitForFunction(() => window.__c.el.shadowRoot.querySelectorAll('.band').length === 2)
    expect(await activeDate(page)).toBe('2026-03-04')
    // Right from the last week of the first band continues into the first of the second.
    const edge = await page.evaluate(() => window.__c.el.shadowRoot.querySelectorAll('.band')[0].querySelector('[role="row"]').querySelectorAll('.c')[26].getAttribute('data-d'))
    await page.evaluate((d) => window.__c.el.shadowRoot.querySelector(`.c[data-d="${d}"]`).focus(), edge)
    await page.keyboard.press('ArrowRight')
    const next = await page.evaluate(() => window.__c.el.shadowRoot.activeElement.closest('.band') === window.__c.el.shadowRoot.querySelectorAll('.band')[1])
    expect(next).toBe(true)
    // Down stays in the band's weekdays.
    await page.keyboard.press('End')
    await page.keyboard.press('Control+End')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    expect(await page.evaluate(() => window.__c.el.shadowRoot.activeElement.closest('.band') === window.__c.el.shadowRoot.querySelectorAll('.band')[1])).toBe(true)
  })

  for (const [size, width] of [['Tall', 170], ['M', 351], ['Banner', 351]]) {
    for (const mode of ['theme=light', 'theme=dark', 'preset=terminal', 'wide']) {
      test(`${size} at ${width}px in ${mode} keeps everything inside its tile`, async ({ page }) => {
        await open(page, `size=${size}&width=${width}&${mode}`)
        const fit = await page.evaluate(() => {
          const el = window.__c.el
          const root = el.shadowRoot
          const tile = root.querySelector('.tile').getBoundingClientRect()
          const outside = []
          for (const node of root.querySelectorAll('.cell, .c, .hd, [data-k="grid"], .lb')) {
            const r = node.getBoundingClientRect()
            if (r.width && (r.left < tile.left - 0.5 || r.right > tile.right + 0.5 || r.bottom > tile.bottom + 0.5)) outside.push(node.getAttribute('data-k') || node.className)
          }
          // A figure that does not fit would be wider than the cell that holds it.
          const clipped = [...root.querySelectorAll('.cell')].filter((c) => c.scrollWidth > c.clientWidth + 1).map((c) => c.textContent)
          return { outside, clipped, page: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1, cellW: root.querySelector('.c').getBoundingClientRect().width }
        })
        expect(fit.outside).toEqual([])
        expect(fit.clipped).toEqual([])
        expect(fit.page).toBe(true)
        expect(fit.cellW).toBeGreaterThan(5)
      })
    }
  }
})

test.describe('words and states', () => {
  test('the header, the freshness and the tile name are the shared ones', async ({ page }) => {
    await open(page, 'size=Banner')
    const info = await page.evaluate(() => {
      const root = window.__c.el.shadowRoot
      return { tile: root.querySelector('.tile').getAttribute('aria-label'), heading: root.querySelector('[part="label"]').getAttribute('role'), meta: root.querySelector('[data-k="meta"]').textContent }
    })
    expect(info.heading).toBe('heading')
    expect(info.tile).toMatch(/^Daily P&L calendar, net \+₹?[\d,.]+ over \d+ trading days, live$/)
    expect(info.meta).toMatch(/just now|synced/i)
  })

  test('the figures carry a sign and an arrow that assistive technology skips', async ({ page }) => {
    await open(page, 'size=M')
    const figs = await page.evaluate(() =>
      ['net', 'best', 'worst'].map((k) => {
        const el = window.__c.el.shadowRoot.querySelector(`[data-k="${k}"]`)
        const ar = el.querySelector('.ar')
        return { text: el.textContent, hidden: ar.getAttribute('aria-hidden'), arrow: ar.textContent, cls: el.getAttribute('class') }
      }),
    )
    expect(figs[0].text).toMatch(/^▲\+/)
    expect(figs[1].text).toMatch(/^▲\+/)
    expect(figs[2].text).toMatch(/^▼−/)
    for (const f of figs) expect(f.hidden).toBe('true')
    expect(figs[2].cls).toContain('neg')
  })

  test('translated words reach every name', async ({ page }) => {
    await open(page, 'size=Tall')
    await page.evaluate(() => {
      window.__c.el.messages = { 'calendar.cellUpcoming': '{date}: bald', 'calendar.cell': '{date}: {value}', 'calendar.cellNone': '{date}: nichts' }
    })
    await page.evaluate(() => window.__c.nextFrame())
    const names = await cellInfo(page)
    expect(names.find((c) => c.date === '2026-08-05').name).toBe('Wed 5 Aug: +₹1,240.00')
    expect(names.find((c) => c.date === '2026-08-06').name).toBe('Thu 6 Aug: bald')
    expect(names.some((c) => /: nichts$/.test(c.name))).toBe(true)
  })

  test('the loading, empty and error views come from the base', async ({ page }) => {
    await open(page, 'size=M')
    await page.evaluate(() => { window.__c.el.data = null })
    await page.evaluate(() => window.__c.nextFrame())
    expect(await page.evaluate(() => window.__c.el.shadowRoot.querySelector('[part="empty"]').textContent)).toContain('No trading days yet')
    await page.evaluate(() => { window.__c.el.data = undefined })
    await page.evaluate(() => window.__c.nextFrame())
    expect(await page.evaluate(() => !!window.__c.el.shadowRoot.querySelector('[part="skeleton"]'))).toBe(true)
    // Coming back from another view the template is new, and the cells are drawn into it again, with the one tab stop.
    await page.evaluate(() => window.__c.tick(0))
    await page.evaluate(() => window.__c.nextFrame())
    const back = await cellInfo(page)
    expect(back.length).toBe(13 * 6)
    expect(back.filter((c) => c.tab === '0')).toHaveLength(1)
  })
})
