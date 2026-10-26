// Compact density, the rem type scale and the text-spacing check (RFC 0004 §2).
//
// The gallery (widgets.html) draws every widget it has at each size in both themes at once, and gains two controls:
// Density (data-ts-density on both theme blocks) and Text spacing, which adds the four WCAG 1.4.12 overrides to the
// document and to every open shadow root. These specs drive those controls, then read what each tile really drew.
import { test, expect } from '@playwright/test'

const GALLERY = '/widgets.html'
const FIXTURE = '/test/browser/fixtures/widgets.html'

// Runs in the page. For every tile in the gallery it finds the headline, label and figure text that a widget clips:
// a text run whose ink leaves a box that hides overflow, or whose box is squeezed below its own content. A label, or the line under a stat, may be
// shortened with an ellipsis (that is how a narrow tile says so); a headline or figure may not be cut at all. Text a
// widget scrolls (a list inside a tile) and text the host slotted in are not the widget's to fit.
function findClips({ fixture = false, phone = false } = {}) {
  const OWN = ['lb', 'big', 'xbig', 'n', 'nv', 'md']
  const composedParent = (n) => n.assignedSlot || n.parentNode || n.host || null
  const out = []
  const visit = (node, acc) => {
    for (const c of node.childNodes) {
      if (c.nodeType === 3) {
        if (c.textContent.trim()) acc.push(c)
      } else if (c.nodeType === 1 && !['STYLE', 'SCRIPT'].includes(c.tagName)) {
        if (c.shadowRoot) visit(c.shadowRoot, acc)
        else visit(c, acc)
      }
    }
  }
  // The gallery's figures, or every tile of the fixture page: all the built-in widgets, at each size they have.
  const subjects = fixture
    ? [...window.__fx.tiles].map(([key, el]) => ({ el, tile: `${key} ${phone ? 'phone' : 'desktop'}`, place: phone ? 'phone' : 'desktop', theme: new URLSearchParams(location.search).get('theme') || 'light' }))
    : [...document.querySelectorAll('figure > [size]')].map((el) => {
        const set = el.closest('.set')
        const place = set.classList.contains('phone') ? 'phone' : set.previousElementSibling && set.previousElementSibling.textContent === 'States' ? 'states' : 'desktop'
        return { el, tile: `${el.localName} ${el.getAttribute('size')} ${place}`, place, theme: el.closest('.theme').dataset.theme }
      })
  for (const { el, tile, theme } of subjects) {
    const texts = []
    visit(el.shadowRoot, texts)
    for (const t of texts) {
      const parent = t.parentElement
      let own = null
      for (let a = parent; a && a.nodeType === 1; a = composedParent(a)) {
        if (a.classList && OWN.some((c) => a.classList.contains(c))) {
          own = a
          break
        }
        if (a.getAttribute && ['value', 'label'].includes(a.getAttribute('part'))) {
          own = a
          break
        }
      }
      if (!own) continue
      const isLabel = own.classList.contains('lb') || own.getAttribute('part') === 'label'
      // The second line under a stat (.sub) is built to give way with an ellipsis before the figure does (edge-stats.js).
      const mayShorten = isLabel || own.classList.contains('sub')
      const range = document.createRange()
      range.selectNodeContents(t)
      const rects = [...range.getClientRects()].filter((q) => q.width > 0.5 && q.height > 0.5)
      if (!rects.length) continue
      // Hidden from sight on purpose: a collapsed box, or a tier's display: none (no rects, skipped above).
      let skip = false
      for (let a = parent; a && a.nodeType === 1; a = composedParent(a)) {
        const s = getComputedStyle(a)
        const q = a.getBoundingClientRect()
        if (s.overflowY === 'auto' || s.overflowY === 'scroll' || (q.width <= 1.5 && q.height <= 1.5 && s.overflowX !== 'visible')) {
          skip = true
          break
        }
      }
      if (skip) continue
      let left = Math.min(...rects.map((q) => q.left))
      // Letter spacing adds room after the last glyph, which is not ink.
      const spacing = Math.max(0, parseFloat(getComputedStyle(parent).letterSpacing) || 0)
      let right = Math.max(...rects.map((q) => q.right)) - spacing
      // The range of a shortened text still spans the words that were cut, but what is drawn ends at the box with the ellipsis.
      for (let n = parent; n && n.nodeType === 1; n = composedParent(n)) {
        const s = getComputedStyle(n)
        if (s.textOverflow !== 'ellipsis' || s.overflowX === 'visible') continue
        const box = n.getBoundingClientRect()
        left = Math.max(left, box.left)
        right = Math.min(right, box.right)
        break
      }
      let block = parent
      while (block && block.nodeType === 1 && ['inline', 'contents'].includes(getComputedStyle(block).display)) block = composedParent(block)
      const blockBox = block.getBoundingClientRect()
      const size = parseFloat(getComputedStyle(block).fontSize)
      for (let n = parent; n && n !== document.documentElement; n = composedParent(n)) {
        if (n.nodeType !== 1) continue
        const s = getComputedStyle(n)
        if (!['hidden', 'clip'].some((v) => s.overflowX === v || s.overflowY === v)) continue
        const box = n.getBoundingClientRect()
        const ellipsis = s.textOverflow === 'ellipsis'
        const sideways = !ellipsis && (left < box.left - 2 || right > box.right + 2)
        // A line box is shorter than the glyphs' own box (line-height 1), so a little overflow is not ink.
        const squeezed = n === block ? n.scrollHeight - n.clientHeight > 0.16 * size : blockBox.top < box.top - 2 || blockBox.bottom > box.bottom + 2
        const shortened = ellipsis && !mayShorten && n.scrollWidth - n.clientWidth > 1 + spacing
        if (sideways || squeezed || shortened) {
          out.push({ tile, theme, text: t.textContent.trim().slice(0, 30), by: String(n.className || n.localName), sideways, squeezed, shortened })
        }
      }
    }
  }
  return out
}

// The gallery asks Google Fonts for its two faces; refuse that, so every run measures the same fallback faces whether or not the machine is online.
async function open(page, query) {
  await page.context().route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname), (route) => route.abort())
  await page.goto(`${GALLERY}${query}`)
  // The widgets draw on the next frames; wait until the last tile has its label.
  await page.waitForFunction(() => [...document.querySelectorAll('figure > [size]')].every((el) => el.shadowRoot && el.shadowRoot.querySelector('.lb, .tile')))
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}

async function clips(page, options) {
  return page.evaluate(findClips, options)
}

test.describe('compact density and text spacing in the gallery', () => {
  test('the controls drive the tokens: compact rows, padding and gap, and a phone keeps its rows', async ({ page }) => {
    await open(page, '')
    const read = () =>
      page.evaluate(() => {
        const tile = (set, tag) => document.querySelector(`.theme[data-theme="light"] .set${set} ${tag}[size="S"]`)
        const px = (el, name) => getComputedStyle(el).getPropertyValue(name).trim()
        const desk = tile(':not(.phone)', 'ts-metric')
        const phone = tile('.phone', 'ts-metric')
        return {
          deskRow: px(desk, '--ts-row'), deskPad: px(desk, '--ts-pad'), deskGap: px(desk, '--ts-gap'), deskHeight: desk.getBoundingClientRect().height,
          phoneRow: px(phone, '--ts-row'), phonePad: px(phone, '--ts-pad'), phoneHeight: phone.getBoundingClientRect().height,
        }
      })
    expect(await read()).toMatchObject({ deskRow: '150px', deskPad: '18px', deskGap: '16px', deskHeight: 150, phoneHeight: 150 })
    await page.getByRole('radio', { name: 'Compact' }).check()
    expect(page.url()).toContain('density=compact')
    expect(await read()).toMatchObject({ deskRow: '120px', deskPad: '12px', deskGap: '10px', deskHeight: 120, phoneRow: '150px', phonePad: '12px', phoneHeight: 150 })
    await page.getByRole('radio', { name: 'Comfortable' }).check()
    expect(page.url()).not.toContain('density')
    expect(await read()).toMatchObject({ deskRow: '150px', deskPad: '18px', deskHeight: 150 })
  })

  test('the Text spacing switch puts the four overrides on the page and inside every widget, and takes them off again', async ({ page }) => {
    await open(page, '')
    const measure = () =>
      page.evaluate(() => {
        const host = document.querySelector('ts-today-pnl[size="S"]')
        const inner = getComputedStyle(host.shadowRoot.querySelector('.lb'))
        const outer = getComputedStyle(document.querySelector('figcaption'))
        return { inner: [inner.lineHeight, inner.letterSpacing, inner.wordSpacing], font: parseFloat(inner.fontSize), outer: [outer.letterSpacing, outer.wordSpacing, parseFloat(outer.fontSize)] }
      })
    const before = await measure()
    // The label already tracks at .12em, so word spacing and line height tell the overrides apart.
    expect(before.inner[2]).toBe('0px')
    expect(before.inner[0]).toBe('normal')
    await page.getByRole('checkbox', { name: /WCAG 1.4.12/ }).check()
    expect(page.url()).toContain('spacing=on')
    const on = await measure()
    expect(parseFloat(on.inner[0])).toBeCloseTo(on.font * 1.5, 1)
    expect(parseFloat(on.inner[1])).toBeCloseTo(on.font * 0.12, 1)
    expect(parseFloat(on.inner[2])).toBeCloseTo(on.font * 0.16, 1)
    expect(parseFloat(on.outer[0])).toBeCloseTo(on.outer[2] * 0.12, 1)
    await page.getByRole('checkbox', { name: /WCAG 1.4.12/ }).uncheck()
    expect(page.url()).not.toContain('spacing')
    expect(await measure()).toEqual(before)
  })

  // Nothing is cut: not at compact density, not with the overrides on, and not with both. A tile that cannot fit its
  // secondary rows hides them (the .sec and .ter classes), so a headline, a label or a figure is never the thing that gives.
  for (const query of ['?density=compact', '?spacing=on', '?density=compact&spacing=on']) {
    test(`no headline, label or figure is cut at ${query}, in both themes`, async ({ page }) => {
      await open(page, query)
      const found = await clips(page)
      // Both theme blocks are in the page, so a missing theme would pass quietly.
      expect(new Set(await page.evaluate(() => [...document.querySelectorAll('.theme')].map((b) => b.dataset.theme)))).toEqual(new Set(['light', 'dark']))
      expect(found, JSON.stringify(found, null, 1)).toEqual([])
    })
  }

  test('today\'s P&L and the equity curve are clean at every size, in both themes, at compact density with the overrides on', async ({ page }) => {
    await open(page, '?density=compact&spacing=on')
    const found = await clips(page)
    expect(found.filter((c) => /ts-today-pnl|ts-equity-curve/.test(c.tile)), 'the two widgets the density story converts').toEqual([])
  })

  test('a compact tile gives up its secondary rows: a snug S tile has no footer, a comfortable one keeps it', async ({ page }) => {
    await open(page, '')
    const footer = () => page.evaluate(() => getComputedStyle(document.querySelector('.theme[data-theme="light"] ts-today-pnl[size="S"]').shadowRoot.querySelector('[data-k="footer"]')).display)
    expect(await footer()).not.toBe('none')
    await page.getByRole('radio', { name: 'Compact' }).check()
    expect(await footer()).toBe('none')
  })
})

// The gallery draws six widgets. The fixture page draws all of them (the cards, metrics, charts, lists, calendars and
// gauges, 43 tiles at their sizes), so the same check runs there: compact rows and the four WCAG 1.4.12 overrides on,
// light and dark, at a desktop column width and at a phone's (the two columns and 150px rows of RFC 0001 §4.1).
test.describe('every built-in widget at compact density with the text-spacing overrides on', () => {
  const SPACING = '*, *::before, *::after { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-block-end: 2em !important; }'
  for (const theme of ['light', 'dark']) {
    for (const phone of [false, true]) {
      test(`${theme}, ${phone ? 'phone' : 'desktop'}: no headline, label or figure is cut`, async ({ page }) => {
        await page.setViewportSize({ width: phone ? 390 : 1400, height: 900 })
        await page.goto(`${FIXTURE}?theme=${theme}`)
        await page.waitForFunction(() => window.__ready === true)
        await page.evaluate(({ phone, SPACING }) => {
          const COLS = { S: 1, Tall: 1, Wide: 2, M: 2, L: 3, Banner: 4, XL: 4 }
          for (const el of window.__fx.tiles.values()) {
            const c = COLS[el.getAttribute('size')]
            // A phone is two columns (170px a cell); a desktop column is 304px with 16px gaps.
            const w = phone ? (c === 1 ? 170 : 350) : c * 304 + (c - 1) * 16
            el.style.width = `${w}px`
            el.parentElement.style.width = `${w}px`
          }
          // A phone's rows are --ts-row-compact whatever the density (RFC 0004 §2.1).
          if (phone) document.documentElement.style.setProperty('--ts-row', 'var(--ts-row-compact)')
          document.documentElement.setAttribute('data-ts-density', 'compact')
          const sheet = new CSSStyleSheet()
          sheet.replaceSync(SPACING)
          const adopt = (root) => { root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet] }
          const walk = (root) => { for (const el of root.querySelectorAll('*')) if (el.shadowRoot) { adopt(el.shadowRoot); walk(el.shadowRoot) } }
          adopt(document)
          walk(document)
        }, { phone, SPACING })
        await page.evaluate(() => window.__fx.nextFrame())
        await page.waitForTimeout(300)
        const found = await clips(page, { fixture: true, phone })
        expect(found, JSON.stringify(found, null, 1)).toEqual([])
      })
    }
  }
})

test.describe('the rem type scale', () => {
  test('the sizes the scale replaces are unchanged at 16px, and a 62.5% root does not shrink a single one (the px floor)', async ({ page }) => {
    await page.goto(FIXTURE)
    await page.waitForFunction(() => window.__ready === true)
    const sizes = (root) =>
      page.evaluate((root) => {
        document.documentElement.style.fontSize = root
        const probe = document.createElement('div')
        document.body.append(probe)
        const out = {}
        for (const name of ['2xs', 'xs', 'sm', 'md', 'base', 'lg', 'xl', '2xl', '3xl', 'big', 'xbig']) {
          probe.style.fontSize = `var(--ts-text-${name})`
          out[name] = parseFloat(getComputedStyle(probe).fontSize)
        }
        probe.style.fontSize = 'var(--ts-label-size)'
        out.label = parseFloat(getComputedStyle(probe).fontSize)
        const tile = window.__fx.tiles.get('todayPnl:S')
        out.tileLabel = parseFloat(getComputedStyle(tile.shadowRoot.querySelector('.lb')).fontSize)
        out.tileBase = parseFloat(getComputedStyle(tile.shadowRoot.querySelector('.tile')).fontSize)
        out.tileHeight = tile.getBoundingClientRect().height
        probe.remove()
        return out
      }, root)
    const base = await sizes('16px')
    expect(base).toMatchObject({ '2xs': 9, xs: 10, sm: 11, md: 12, base: 13, lg: 14, xl: 16, '2xl': 17, '3xl': 26, big: 34, xbig: 48, label: 11, tileLabel: 11, tileBase: 13, tileHeight: 150 })
    const small = await sizes('62.5%')
    expect(small).toEqual(base)
    const large = await sizes('20px')
    for (const name of Object.keys(base)) if (name !== 'tileHeight') expect(large[name], name).toBeGreaterThanOrEqual(base[name])
    expect(large.label).toBeCloseTo(13.75, 1)
    expect(large.base).toBeCloseTo(16.25, 1)
    // Row heights stay in px: a layout must not move because a reader changed a font.
    expect(large.tileHeight).toBe(150)
  })

  test('a long label or note never widens a column: only a figure can, so the layouts a default dashboard has are unchanged', async ({ page }) => {
    await page.goto(FIXTURE)
    await page.waitForFunction(() => window.__ready === true)
    const widths = () =>
      page.evaluate(async () => {
        await window.__fx.nextFrame()
        const of = (key, selectors) => {
          const root = window.__fx.tiles.get(key).shadowRoot
          return selectors.map((s) => Math.round(root.querySelector(s).getBoundingClientRect().width))
        }
        return { pnl: of('todayPnl:Wide', ['.lhs', '.rhs']), equity: of('equityCurve:Wide', ['.side', '.plot']) }
      })
    const before = await widths()
    await page.evaluate(async () => {
      for (const key of ['todayPnl:Wide', 'equityCurve:Wide']) window.__fx.tiles.get(key).setAttribute('label', 'A very long custom label for this dashboard tile that cannot fit')
      // The label is written on the next render.
      for (let i = 0; i < 50 && !window.__fx.tiles.get('todayPnl:Wide').shadowRoot.querySelector('.lb').textContent.startsWith('A very'); i++) await new Promise((r) => setTimeout(r, 50))
    })
    expect(await widths()).toEqual(before)
  })

  test('at a 20px root the tiles keep their size, the text grows, and compact density still shows its headline', async ({ page }) => {
    await page.goto(FIXTURE)
    await page.waitForFunction(() => window.__ready === true)
    const read = (key) =>
      page.evaluate((key) => {
        const tile = window.__fx.tiles.get(key)
        const label = tile.shadowRoot.querySelector('.lb')
        const footer = tile.shadowRoot.querySelector('[data-k="footer"]')
        const box = tile.getBoundingClientRect()
        return { h: box.height, label: parseFloat(getComputedStyle(label).fontSize), footer: footer ? getComputedStyle(footer).display : null }
      }, key)
    const before = await read('todayPnl:S')
    await page.evaluate(() => { document.documentElement.style.fontSize = '20px' })
    const after = await read('todayPnl:S')
    expect(after.h).toBe(before.h)
    expect(after.label).toBeGreaterThan(before.label)
    // 112px of content is 5.6rem at 20px: the tile is snug, so its footer gives way before anything clips.
    expect(before.footer).not.toBe('none')
    expect(after.footer).toBe('none')
  })
})

// ── <ts-grid density> ───────────────────────────────────────────────────────

test.describe('<ts-grid density>', () => {
  const GRID = '/test/browser/fixtures/grid.html?mode=explicit&w=1240'
  let warnings

  test.beforeEach(async ({ page }) => {
    warnings = []
    await page.context().route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname), (route) => route.abort())
    page.on('console', (msg) => msg.type() === 'warning' && warnings.push(msg.text()))
    await page.goto(GRID)
    await page.waitForFunction(() => window.__ready === true)
  })

  const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  const read = (page) =>
    page.evaluate(() => {
      const grid = document.getElementById('g')
      const style = getComputedStyle(grid)
      const tile = (id) => document.querySelector(`#g > [item="${id}"]`).getBoundingClientRect()
      return {
        density: grid.density,
        row: style.getPropertyValue('--ts-row').trim(),
        pad: style.getPropertyValue('--ts-pad').trim(),
        gap: style.getPropertyValue('--ts-gap').trim(),
        columns: grid.columns,
        notes: [tile('notes').width, tile('notes').height],
        traffic: [tile('traffic').width, tile('traffic').height],
        tilePad: getComputedStyle(document.querySelector('#g > [item="notes"]')).getPropertyValue('--ts-pad').trim(),
        layout: JSON.stringify(grid.layout),
      }
    })

  test('compact sets the three tokens, re-measures, and leaves the layout as it was; removing the attribute restores them', async ({ page }) => {
    const before = await read(page)
    expect(before).toMatchObject({ density: 'comfortable', row: '150px', pad: '18px', gap: '16px' })
    expect(before.columns).toBeGreaterThanOrEqual(3)
    await page.evaluate(() => document.getElementById('g').setAttribute('density', 'compact'))
    await settle(page)
    const compact = await read(page)
    expect(compact).toMatchObject({ density: 'compact', row: '120px', pad: '12px', gap: '10px', tilePad: '12px' })
    // A one-row tile is the row, a two-row tile two rows and a gap.
    expect(compact.notes[1]).toBe(120)
    expect(compact.traffic[1]).toBe(250)
    expect(before.notes[1]).toBe(150)
    expect(before.traffic[1]).toBe(316)
    expect(compact.layout).toBe(before.layout)
    await page.evaluate(() => document.getElementById('g').removeAttribute('density'))
    await settle(page)
    expect(await read(page)).toEqual(before)
  })

  test('the density property reflects the attribute, and setting it re-measures', async ({ page }) => {
    await page.evaluate(() => { document.getElementById('g').density = 'compact' })
    await settle(page)
    expect(await page.evaluate(() => document.getElementById('g').getAttribute('density'))).toBe('compact')
    expect((await read(page)).notes[1]).toBe(120)
    await page.evaluate(() => { document.getElementById('g').density = null })
    await settle(page)
    expect(await page.evaluate(() => document.getElementById('g').hasAttribute('density'))).toBe(false)
    expect((await read(page)).notes[1]).toBe(150)
  })

  test('a rule on the ts-grid element still wins, while a value on :root is only inherited and loses', async ({ page }) => {
    await page.addStyleTag({ content: ':root { --ts-pad: 30px; --ts-row: 200px; } ts-grid { --ts-gap: 14px; }' })
    await page.evaluate(() => document.getElementById('g').setAttribute('density', 'compact'))
    await settle(page)
    // The grid's own compact values beat the inherited root ones; the host's rule on the element beats the grid's.
    expect(await read(page)).toMatchObject({ row: '120px', pad: '12px', gap: '14px' })
  })

  test('an invalid value warns once and is comfortable; a phone keeps its rows and changes only the padding', async ({ page }) => {
    await page.evaluate(() => document.getElementById('g').setAttribute('density', 'dense'))
    await page.evaluate(() => document.getElementById('g').setAttribute('density', 'tight'))
    await settle(page)
    expect(await read(page)).toMatchObject({ density: 'comfortable', row: '150px', pad: '18px', gap: '16px' })
    expect(warnings.filter((w) => w.includes('density'))).toHaveLength(1)

    await page.setViewportSize({ width: 390, height: 800 })
    await page.evaluate(() => { document.getElementById('g').parentElement.style.width = '' })
    await page.evaluate(() => document.getElementById('g').setAttribute('density', 'compact'))
    await settle(page)
    const phone = await read(page)
    expect(phone.columns).toBe(2)
    expect(phone.pad).toBe('12px')
    // The rows of a phone are --ts-row-compact (150px) whatever the density, so live numbers never resize a tile.
    expect(phone.notes[1]).toBe(150)
  })
})
