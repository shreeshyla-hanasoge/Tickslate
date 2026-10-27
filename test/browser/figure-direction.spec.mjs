// Signed figures keep their locale's order in a right-to-left page: an English "+12%" must not read "12%+" because
// the page runs right to left, and an Arabic, Hebrew or Persian figure must read the same in either page direction.
// The probe measures with Range rects, the way the eye sees it, over every text node in every shadow root.
import { test, expect } from '@playwright/test'
import { drawn, rendered } from './drawn.mjs'

const PAGE = '/test/browser/fixtures/widgets.html'

test.beforeEach(async ({ page }) => {
  await page.context().route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname), (route) => route.abort())
})

async function open(page, locale, dir) {
  await page.goto(PAGE)
  await page.waitForFunction(() => window.__ready === true)
  await drawn(page)
  await page.evaluate(({ locale, dir }) => {
    document.documentElement.setAttribute('dir', dir)
    const walk = (root) => {
      for (const el of root.querySelectorAll('*')) {
        if (/^ts-/.test(el.localName) && el.localName !== 'ts-grid') el.setAttribute('locale', locale)
        if (el.shadowRoot) walk(el.shadowRoot)
      }
    }
    walk(document)
  }, { locale, dir })
  // Every tile re-draws in the new locale; read them only when none still owes that render.
  await rendered(page)
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
}

// For each visible text node with a sign and a digit: where the sign sits against the first digit ('before' or 'after'),
// with the node's text, in document order.
const probe = (page) => page.evaluate(() => {
  const out = []
  const SIGN = /[+−]/
  const DIGIT = /\p{Nd}/u
  const visit = (root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.data
      const sign = text.search(SIGN)
      const digit = text.search(DIGIT)
      if (sign < 0 || digit < 0) continue
      const rect = (i) => {
        const r = document.createRange()
        r.setStart(node, i)
        r.setEnd(node, i + 1)
        return r.getBoundingClientRect()
      }
      const a = rect(sign)
      const b = rect(digit)
      // A figure squeezed to a sliver (a clipped tile) has no order to read.
      if (a.width < 3 || b.width < 3) continue
      // A sign that is not before its digits in the text (a trailing minus, a range) is not this probe's business.
      if (sign > digit) continue
      // A sign at the end of one line and its digits at the start of the next is a wrap, not an order.
      if (Math.abs(a.top - b.top) > a.height / 2) continue
      out.push({ text: text.trim(), sign: a.left < b.left ? 'before' : 'after' })
    }
    for (const el of root.querySelectorAll('*')) if (el.shadowRoot) visit(el.shadowRoot)
  }
  visit(document.body)
  return out
})

for (const locale of ['en-US', 'en-IN']) {
  test(`${locale}: every signed figure reads sign first in both page directions`, async ({ page }) => {
    for (const dir of ['ltr', 'rtl']) {
      await open(page, locale, dir)
      const found = await probe(page)
      expect(found.length, `${dir} found signed figures`).toBeGreaterThan(10)
      expect(found.filter((f) => f.sign !== 'before'), `${locale} under ${dir}`).toEqual([])
    }
  })
}

for (const locale of ['ar-EG', 'he-IL', 'fa-IR']) {
  test(`${locale}: the sign sits where it does under dir=ltr, whatever the page direction`, async ({ page }) => {
    await open(page, locale, 'ltr')
    const ltr = await probe(page)
    await open(page, locale, 'rtl')
    const rtl = await probe(page)
    expect(ltr.length).toBeGreaterThan(10)
    expect(rtl).toEqual(ltr)
  })
}
