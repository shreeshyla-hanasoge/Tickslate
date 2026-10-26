/**
 * Default tokens (RFC 0002 §6.1): what makes a tile look finished when the host
 * imports only the elements and never loads tokens.css.
 *
 * tokens.css is canonical; TOKENS_CSS repeats its blocks, comments left out,
 * inside @layer tickslate.defaults. test/default-tokens.test.mjs fails unless
 * both declare the same properties with the same values in each block, so edit
 * tokens.css first and copy the change here.
 *
 * Why a layer: unlayered author CSS beats layered CSS whatever its specificity
 * or order. A tokens.css <link> added after load, or a host rule such as
 * :root { --ts-surface: … }, therefore always wins over these defaults.
 */
import { DEV, warnOnce } from './dev.js'
import { styleElement } from './html.js'

export const TOKENS_CSS = `@layer tickslate.defaults {
  :where(:root) {
    --ts-bg: #F3EFE6;
    --ts-surface: #FFFDF8;
    --ts-surface-2: #F1EBDE;
    --ts-line: #E2DACB;
    --ts-ink: #1C1A16;
    --ts-muted: #6A655B;
    --ts-profit: #0E7A4E;
    --ts-loss: #C0362C;
    --ts-warn: #A85A06;
    --ts-accent: #2C52C4;
    --ts-axis: #948C7C;
    --ts-series-1: #2C52C4;
    --ts-series-2: #B45309;
    --ts-series-3: #0F766E;
    --ts-series-4: #8B3FB5;
    --ts-series-5: #BE185D;
    --ts-series-6: #6B7A1A;
    --ts-focus: var(--ts-accent);
    --ts-radius: 10px;
    --ts-radius-sm: 6px;
    --ts-shadow: 0 1px 0 rgba(28, 26, 22, .04), 0 8px 20px -12px rgba(28, 26, 22, .25);
    --ts-fill: 12%;
    --ts-font-ui: 'Geist', system-ui, -apple-system, 'Segoe UI', sans-serif;
    --ts-font-num: 'Newsreader', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    --ts-row: 150px;
    --ts-gap: 16px;
    --ts-grid-max-width: none;
    --ts-pad: 18px;
    --ts-row-compact: 150px;
    --ts-gap-compact: 10px;
    --ts-strip-top: 0px;
    --ts-num-weight: 500;
    --ts-num-weight-small: 500;
    --ts-label-size: 10px;
    --ts-label-case: uppercase;
    --ts-label-tracking: .12em;
    --ts-label-weight: 600;
    --ts-headline-weight: var(--ts-num-weight);
    --ts-shadow-lift: 0 2px 6px rgba(28, 26, 22, .08), 0 28px 48px -18px rgba(28, 26, 22, .45);
    --ts-motion: 220ms;
    --ts-ease: cubic-bezier(.2, .8, .2, 1);
  }
  @media (prefers-color-scheme: dark) {
    :where([data-theme="auto"]) {
      --ts-bg: #111827;
      --ts-surface: #1F2937;
      --ts-surface-2: #374151;
      --ts-line: #374151;
      --ts-ink: #F3F4F6;
      --ts-muted: #9CA3AF;
      --ts-profit: #34D399;
      --ts-loss: #FB7185;
      --ts-warn: #FBBF24;
      --ts-accent: #818CF8;
      --ts-axis: #6B7280;
      --ts-series-1: #818CF8;
      --ts-series-2: #F59E0B;
      --ts-series-3: #2DD4BF;
      --ts-series-4: #C084FC;
      --ts-series-5: #F472B6;
      --ts-series-6: #A3E635;
      --ts-focus: var(--ts-accent);
      --ts-radius: 12px;
      --ts-pad: 16px;
      --ts-shadow: none;
      --ts-fill: 16%;
      --ts-num-weight-small: 600;
      --ts-shadow-lift: 0 2px 6px rgba(0, 0, 0, .3), 0 28px 48px -16px rgba(0, 0, 0, .7);
    }
  }
  :where([data-theme="dark"], .dark) {
    --ts-bg: #111827;
    --ts-surface: #1F2937;
    --ts-surface-2: #374151;
    --ts-line: #374151;
    --ts-ink: #F3F4F6;
    --ts-muted: #9CA3AF;
    --ts-profit: #34D399;
    --ts-loss: #FB7185;
    --ts-warn: #FBBF24;
    --ts-accent: #818CF8;
    --ts-axis: #6B7280;
    --ts-series-1: #818CF8;
    --ts-series-2: #F59E0B;
    --ts-series-3: #2DD4BF;
    --ts-series-4: #C084FC;
    --ts-series-5: #F472B6;
    --ts-series-6: #A3E635;
    --ts-focus: var(--ts-accent);
    --ts-radius: 12px;
    --ts-pad: 16px;
    --ts-shadow: none;
    --ts-fill: 16%;
    --ts-num-weight-small: 600;
    --ts-shadow-lift: 0 2px 6px rgba(0, 0, 0, .3), 0 28px 48px -16px rgba(0, 0, 0, .7);
  }
  :where([data-theme="light"]) {
    --ts-bg: #F3EFE6;
    --ts-surface: #FFFDF8;
    --ts-surface-2: #F1EBDE;
    --ts-line: #E2DACB;
    --ts-ink: #1C1A16;
    --ts-muted: #6A655B;
    --ts-profit: #0E7A4E;
    --ts-loss: #C0362C;
    --ts-warn: #A85A06;
    --ts-accent: #2C52C4;
    --ts-axis: #948C7C;
    --ts-series-1: #2C52C4;
    --ts-series-2: #B45309;
    --ts-series-3: #0F766E;
    --ts-series-4: #8B3FB5;
    --ts-series-5: #BE185D;
    --ts-series-6: #6B7A1A;
    --ts-focus: var(--ts-accent);
    --ts-radius: 10px;
    --ts-pad: 18px;
    --ts-shadow: 0 1px 0 rgba(28, 26, 22, .04), 0 8px 20px -12px rgba(28, 26, 22, .25);
    --ts-fill: 12%;
    --ts-num-weight-small: 500;
    --ts-shadow-lift: 0 2px 6px rgba(28, 26, 22, .08), 0 28px 48px -18px rgba(28, 26, 22, .45);
  }
  :where(ts-grid:not(:defined)) {
    display: block;
    min-height: var(--ts-row, 150px);
  }
  :where(ts-grid:not(:defined) > *) {
    display: none;
  }
  :where(:is(ts-today-pnl, ts-equity-curve, ts-session-clock, ts-pnl-calendar, ts-edge-stats, ts-capital-funding, ts-open-positions, ts-watchlist, ts-mini-chart, ts-card, ts-metric, ts-chart):not(:defined)) {
    display: block;
    height: var(--ts-row, 150px);
  }
  :where(:is(ts-pnl-calendar, ts-mini-chart):not(:defined):not([size])),
  :where(:is(ts-today-pnl, ts-equity-curve, ts-session-clock, ts-pnl-calendar, ts-edge-stats, ts-capital-funding, ts-open-positions, ts-watchlist, ts-mini-chart, ts-card, ts-metric, ts-chart):not(:defined):is([size="M"], [size="Tall"], [size="L"], [size="XL"])) {
    height: calc(2 * var(--ts-row, 150px) + var(--ts-gap, 16px));
  }
}`

// Documents already checked, so the (forced-style) probe runs once per page.
const checked = new WeakSet()

/**
 * Give the document the default tokens unless it already defines them. Called
 * on the first widget connect; later calls for the same document do nothing.
 * Without a document (Node, server rendering) it does nothing at all.
 */
export function ensureTokens(doc = typeof document === 'undefined' ? undefined : document) {
  // A test's stand-in document may have no root element yet; check again later.
  if (!doc || !doc.documentElement || checked.has(doc)) return
  checked.add(doc)
  const view = doc.defaultView || globalThis
  let defined = ''
  try {
    defined = view.getComputedStyle(doc.documentElement).getPropertyValue('--ts-surface')
  } catch {
    // No style engine to ask: assume tokens.css is absent, the safer guess for a page that looks blank.
  }
  if (defined && defined.trim()) return
  if (DEV) warnOnce('tokens', 'tokens.css is not loaded, so tickslate injected its default tokens. Link tickslate/tokens.css (or set the --ts-* variables) to theme the widgets yourself.')
  adopt(doc, view)
}

function adopt(doc, view) {
  const Sheet = view.CSSStyleSheet
  if (Array.isArray(doc.adoptedStyleSheets) && typeof Sheet === 'function' && Sheet.prototype && 'replaceSync' in Sheet.prototype) {
    try {
      const sheet = new Sheet()
      sheet.replaceSync(TOKENS_CSS)
      doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet]
      return
    } catch {
      // Fall through to a <style> element, which every browser supports.
    }
  }
  const style = styleElement(TOKENS_CSS, doc)
  style.setAttribute('data-tickslate', 'defaults')
  // Appended to <head> so a host's own <style> or <link> after it still comes later; layers make order moot anyway.
  ;(doc.head || doc.documentElement).appendChild(style)
}
