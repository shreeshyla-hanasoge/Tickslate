// Compact density, the rem type scale and the text-spacing check (RFC 0004 §2).
//
// The gallery (widgets.html) draws every widget it has at each size in both themes at once, and gains two controls:
// Density (data-ts-density on both theme blocks) and Text spacing, which adds the four WCAG 1.4.12 overrides to the
// document and to every open shadow root. These specs drive those controls, then read what each tile really drew.
import { test, expect } from '@playwright/test'

const GALLERY = '/widgets.html'
const FIXTURE = '/test/browser/fixtures/widgets.html'

// Runs in the page. For every tile in the gallery it finds the headline, label and figure text that a widget clips:
// a text run whose ink leaves a box that hides overflow, or whose box is squeezed below its own content. A label may be
// shortened with an ellipsis (that is how a narrow tile says so); a headline or figure may not be cut at all. Text a
// widget scrolls (a list inside a tile) and text the host slotted in are not the widget's to fit.
function findClips(source) {
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
  // The gallery draws each widget at every size in both themes; the fixture draws all 43 tiles in the one theme its URL names.
  const tiles = source === 'fixture' ? [...window.__fx.tiles.values()] : document.querySelectorAll('figure > [size]')
  for (const el of tiles) {
    const set = el.closest('.set')
    const place = source === 'fixture' ? 'desktop' : set.classList.contains('phone') ? 'phone' : set.previousElementSibling && set.previousElementSibling.textContent === 'States' ? 'states' : 'desktop'
    const theme = source === 'fixture' ? window.__fx.theme : el.closest('.theme').dataset.theme
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
      // The fixture pass reads every text run, secondary notes and axis labels included, which the gallery pass leaves out;
      // a note may end in an ellipsis (that is how it says it is short of room) but may not be cut by the tile.
      if (!own && source === 'fixture') own = parent
      if (!own) continue
      const isLabel = own.classList.contains('lb') || own.getAttribute('part') === 'label' || own === parent && !OWN.some((c) => own.classList.contains(c))
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
      const left = Math.min(...rects.map((q) => q.left))
      // Letter spacing adds room after the last glyph, which is not ink.
      const spacing = Math.max(0, parseFloat(getComputedStyle(parent).letterSpacing) || 0)
      const right = Math.max(...rects.map((q) => q.right)) - spacing
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
        const shortened = ellipsis && !isLabel && n.scrollWidth - n.clientWidth > 1 + spacing
        if (sideways || squeezed || shortened) {
          out.push({ tile: `${el.localName} ${el.getAttribute('size')} ${place}`, theme, text: t.textContent.trim().slice(0, 30), by: String(n.className || n.localName), sideways, squeezed, shortened })
        }
      }
    }
  }
  return out
}

// Tiles that clip under compact density with the overrides on, and whose widgets another story converts: they are
// listed so the spec fails the day one stops clipping (shrink the list) and the day a new one starts. Each reason is
// the row that would fix it with the shared .sec and .ter classes of widget.js.
const KNOWN = new Map([
  ['ts-metric S desktop', 'the compare row under the headline is not marked .sec; metric.js moves with type-scale-rollout'],
  ['ts-metric Wide desktop', 'the compare row under the headline is not marked .sec; metric.js moves with type-scale-rollout'],
  ['ts-session-clock S desktop', 'the from and to row under the progress track is not marked .sec; session-clock.js is market-presets-and-breaks'],
  ['ts-session-clock Banner phone', 'two px at the right edge of the next-close text; session-clock.js is market-presets-and-breaks'],
])

// Tiles the gallery never draws, and so the gallery's checks never looked at: they clip at compact density alone, because the
// row under their headline is not marked .sec (or .ter). type-scale-rollout converts their files and marks those rows; until
// it merges, this list names them, and the spec fails the day one stops being cut (shrink the list) or a new one starts.
// The value is the reason, and a leading "~" marks a tile whose fit depends on the engine's font metrics (WebKit's line boxes
// leave it whole), which may be cut or not and so is allowed but not required.
const KNOWN_COMPACT = new Map([
  ['ts-progress Wide desktop', '~ the "of target" line and the reset line are not marked .sec; progress.js moves with type-scale-rollout'],
  ['ts-progress S desktop', '~ the "of target" line is squeezed 2px short of its line box (the ink is whole); progress.js moves with type-scale-rollout'],
  ['ts-capital-funding S desktop', 'the shortfall line under the bar is not marked .sec; capital-funding.js moves with type-scale-rollout'],
  ['ts-edge-stats Wide desktop', 'the trades and period note is not marked .sec; edge-stats.js moves with type-scale-rollout'],
  ['ts-pnl-calendar Banner desktop', 'the weekday row is not marked .ter; pnl-calendar.js moves with type-scale-rollout'],
])

// The gallery asks Google Fonts for its two faces; refuse that, so every run measures the same fallback faces whether or not the machine is online.
async function open(page, query) {
  await page.context().route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname), (route) => route.abort())
  await page.goto(`${GALLERY}${query}`)
  // The widgets draw on the next frames; wait until the last tile has its label.
  await page.waitForFunction(() => [...document.querySelectorAll('figure > [size]')].every((el) => el.shadowRoot && el.shadowRoot.querySelector('.lb, .tile')))
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}

async function clips(page, known = KNOWN, source = 'gallery') {
  const found = await page.evaluate(findClips, source)
  const unknown = found.filter((c) => !known.has(c.tile))
  const tiles = new Set(found.map((c) => c.tile))
  return { found, unknown, stale: [...known.keys()].filter((k) => !tiles.has(k)) }
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
    // The label's own line height (1.2), not the font's 'normal'.
    expect(parseFloat(before.inner[0])).toBeCloseTo(before.font * 1.2, 1)
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

  // Compact density alone leaves nothing cut in any gallery widget. With the overrides on, only the tiles of KNOWN are cut
  // (the session clock's phone Banner shows it in Firefox and WebKit even at comfortable density), and a later story fixes them.
  for (const query of ['?density=compact', '?spacing=on', '?density=compact&spacing=on']) {
    test(`no headline, label or figure is cut at ${query}, in both themes`, async ({ page }) => {
      await open(page, query)
      const { found, unknown, stale } = await clips(page)
      // Both theme blocks are in the page, so a missing theme would pass quietly.
      expect(new Set(await page.evaluate(() => [...document.querySelectorAll('.theme')].map((b) => b.dataset.theme)))).toEqual(new Set(['light', 'dark']))
      expect(unknown, JSON.stringify(unknown, null, 1)).toEqual([])
      if (query.includes('density') && query.includes('spacing')) expect(stale, `no longer clips: ${stale.join(', ')}`).toEqual([])
      else if (!query.includes('spacing')) expect(found).toEqual([])
    })
  }

  // The gallery has six widgets. The fixture draws every registered widget at every size it supports, so this is the check that
  // reaches the rest. Compact density alone, no text spacing: the tiles of KNOWN_COMPACT are the only ones cut.
  for (const theme of ['light', 'dark']) {
    test(`every fixture tile at compact density alone in ${theme}: only the listed tiles are cut`, async ({ page }) => {
      await page.context().route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname), (route) => route.abort())
      // Tiles are drawn at their desktop column widths, so a phone engine needs a desktop-wide viewport to hold them.
      await page.setViewportSize({ width: 1400, height: 900 })
      await page.goto(`${FIXTURE}?theme=${theme}`)
      await page.waitForFunction(() => window.__ready === true)
      await page.evaluate(async () => {
        const { SIZES } = await import('/src/core/index.js')
        document.documentElement.dataset.tsDensity = 'compact'
        // A tile is as wide as its columns, set on the figure it sits in (a bare percentage would collapse to the content).
        for (const el of window.__fx.tiles.values()) {
          const cols = SIZES[el.getAttribute('size')].cols
          el.parentElement.style.width = `${cols * 304 + (cols - 1) * 16}px`
          el.style.width = '100%'
        }
        await window.__fx.nextFrame()
      })
      expect(await page.evaluate(() => window.__fx.tiles.size)).toBeGreaterThanOrEqual(43)
      const { unknown, stale } = await clips(page, KNOWN_COMPACT, 'fixture')
      expect(unknown, JSON.stringify(unknown, null, 1)).toEqual([])
      const required = stale.filter((tile) => !KNOWN_COMPACT.get(tile).startsWith('~'))
      expect(required, `no longer clips: ${required.join(', ')}`).toEqual([])
    })
  }

  test('today\'s P&L and the equity curve are clean at every size, in both themes, at compact density with the overrides on', async ({ page }) => {
    await open(page, '?density=compact&spacing=on')
    const { found } = await clips(page)
    expect(found.filter((c) => /ts-today-pnl|ts-equity-curve/.test(c.tile)), 'the two widgets this story converts').toEqual([])
  })

  test('a compact tile gives up its secondary rows: a snug S tile has no footer, a comfortable one keeps it', async ({ page }) => {
    await open(page, '')
    const footer = () => page.evaluate(() => getComputedStyle(document.querySelector('.theme[data-theme="light"] ts-today-pnl[size="S"]').shadowRoot.querySelector('[data-k="footer"]')).display)
    expect(await footer()).not.toBe('none')
    await page.getByRole('radio', { name: 'Compact' }).check()
    expect(await footer()).toBe('none')
  })
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
    await settle(page)
  })

  // The grid measures on a ResizeObserver callback that waits for the next frame, so a read taken right after load or an
  // attribute change can see the layout from before that measure. Wait on the real condition: every tile's box unchanged
  // over four consecutive frames.
  const settle = (page) =>
    page.evaluate(
      () =>
        new Promise((resolve) => {
          const boxes = () => [...document.querySelectorAll('#g > *')].map((el) => { const r = el.getBoundingClientRect(); return `${r.left},${r.top},${r.width},${r.height}` }).join('|')
          let last = boxes()
          let same = 0
          const step = () => {
            const now = boxes()
            same = now === last ? same + 1 : 0
            last = now
            if (same >= 4) resolve()
            else requestAnimationFrame(step)
          }
          requestAnimationFrame(step)
        }),
    )
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

// ── a preset never defeats compact density ──────────────────────────────────
// A preset sets --ts-pad on the element that names it, and a rule in a page's CSS outranks the grid's :host rule, so the
// presets yield their padding to density (src/themes/presets/*.css). Same element, an ancestor, either spelling.

test.describe('compact density wins over a preset', () => {
  const GRID = '/test/browser/fixtures/grid.html?mode=explicit&w=1240'
  const PRESETS = { calm: '18px', graphite: '16px', neutral: '16px', paper: '18px', signal: '16px', terminal: '12px' }

  async function open(page, name) {
    await page.context().route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname), (route) => route.abort())
    await page.goto(GRID)
    await page.waitForFunction(() => window.__ready === true)
    await page.addStyleTag({ url: `/src/themes/presets/${name}.css` })
  }
  // What the tile really draws: the padding of the tile inside the first card's shadow root, and the tokens on the grid.
  const read = (page) =>
    page.evaluate(async () => {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const g = document.getElementById('g')
      const style = getComputedStyle(g)
      const tile = document.querySelector('#g > [item="notes"]').shadowRoot.querySelector('.tile')
      return { pad: style.getPropertyValue('--ts-pad').trim(), row: style.getPropertyValue('--ts-row').trim(), gap: style.getPropertyValue('--ts-gap').trim(), drawn: getComputedStyle(tile).paddingLeft }
    })

  for (const [name, own] of Object.entries(PRESETS)) {
    test(`${name}: <ts-grid data-ts-theme density="compact"> has compact padding, rows and gap; comfortable keeps the preset's`, async ({ page }) => {
      await open(page, name)
      await page.evaluate((n) => document.getElementById('g').setAttribute('data-ts-theme', n), name)
      expect(await read(page), 'comfortable').toMatchObject({ pad: own, drawn: own, row: '150px' })
      await page.evaluate(() => document.getElementById('g').setAttribute('density', 'compact'))
      expect(await read(page), 'compact').toEqual({ pad: '12px', drawn: '12px', row: '120px', gap: '10px' })
      await page.evaluate(() => document.getElementById('g').removeAttribute('density'))
      expect(await read(page), 'back to comfortable').toMatchObject({ pad: own, drawn: own })
    })

    test(`${name}: the preset on an ancestor of a compact grid, and data-ts-density on the same element`, async ({ page }) => {
      await open(page, name)
      await page.evaluate((n) => {
        document.getElementById('wrap').setAttribute('data-ts-theme', n)
        document.getElementById('g').setAttribute('density', 'compact')
      }, name)
      expect(await read(page), 'preset on the wrapper, compact on the grid').toMatchObject({ pad: '12px', drawn: '12px', row: '120px' })
      await page.evaluate((n) => {
        document.getElementById('wrap').removeAttribute('data-ts-theme')
        const g = document.getElementById('g')
        g.removeAttribute('density')
        g.setAttribute('data-ts-theme', n)
        g.setAttribute('data-ts-density', 'compact')
      }, name)
      expect(await read(page), 'data-ts-density and the preset on the grid').toMatchObject({ pad: '12px', drawn: '12px' })
    })

    test(`${name}: a compact ancestor beats the preset on a descendant`, async ({ page }) => {
      await open(page, name)
      await page.evaluate((n) => {
        document.getElementById('wrap').setAttribute('data-ts-density', 'compact')
        document.getElementById('g').setAttribute('data-ts-theme', n)
      }, name)
      expect(await read(page)).toMatchObject({ pad: '12px', drawn: '12px' })
    })
  }
})

// The same for the light and dark themes of tokens.css, whose padding (18px and 16px) sat on the element that names the theme:
// a data-theme on the <ts-grid> itself beat the grid's :host rule, so compact padding lost to it.
test.describe('compact density wins over a theme set on the grid itself', () => {
  const GRID = '/test/browser/fixtures/grid.html?mode=explicit&w=1240'
  const THEMES = [['light', '18px', 'light'], ['dark', '16px', 'light'], ['auto', '16px', 'dark']]

  async function open(page, scheme) {
    await page.context().route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname), (route) => route.abort())
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto(GRID)
    await page.waitForFunction(() => window.__ready === true)
    // The fixture puts data-theme on the page; the cases below put it where each one names.
    await page.evaluate(() => document.documentElement.removeAttribute('data-theme'))
  }
  const read = (page) =>
    page.evaluate(async () => {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const g = document.getElementById('g')
      const tile = document.querySelector('#g > [item="notes"]').shadowRoot.querySelector('.tile')
      return { pad: getComputedStyle(g).getPropertyValue('--ts-pad').trim(), drawn: getComputedStyle(tile).paddingLeft }
    })

  for (const [theme, own, scheme] of THEMES) {
    test(`data-theme="${theme}" on the grid: its own padding, and 12px with density="compact"`, async ({ page }) => {
      await open(page, scheme)
      await page.evaluate((t) => document.getElementById('g').setAttribute('data-theme', t), theme)
      expect(await read(page), 'comfortable').toEqual({ pad: own, drawn: own })
      await page.evaluate(() => document.getElementById('g').setAttribute('density', 'compact'))
      expect(await read(page), 'compact').toEqual({ pad: '12px', drawn: '12px' })
      await page.evaluate(() => document.getElementById('g').removeAttribute('density'))
      expect(await read(page), 'comfortable again').toEqual({ pad: own, drawn: own })
    })

    test(`data-theme="${theme}" on an ancestor of a compact grid`, async ({ page }) => {
      await open(page, scheme)
      await page.evaluate((t) => {
        document.getElementById('wrap').setAttribute('data-theme', t)
        document.getElementById('g').setAttribute('density', 'compact')
      }, theme)
      expect(await read(page)).toEqual({ pad: '12px', drawn: '12px' })
    })

    test(`a compact ancestor over a grid that names data-theme="${theme}"`, async ({ page }) => {
      await open(page, scheme)
      await page.evaluate((t) => {
        document.getElementById('wrap').setAttribute('data-ts-density', 'compact')
        document.getElementById('g').setAttribute('data-theme', t)
      }, theme)
      expect(await read(page)).toEqual({ pad: '12px', drawn: '12px' })
    })
  }
})
