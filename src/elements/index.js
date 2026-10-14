/**
 * Tickslate custom elements. Importing this entry registers every element
 * with customElements, so it is a side effect (scripts/pack-lib.mjs lists it
 * in the published "sideEffects"). Where there is no DOM, as during server-side rendering, it
 * registers nothing and still imports cleanly.
 *
 * Each element registers itself in its own module under ./define/, which is
 * also its per-widget entry (RFC 0003 §2.1): this file only gathers them, so
 * the all-in entry stays the same set a host gets by importing each by name.
 */
import { version } from '../core/index.js'
import { TsGrid } from './define/grid.js'
import { TsCard } from './define/card.js'
import { TsMetric } from './define/metric.js'
import { TsChart } from './define/series-chart.js'
import { TsTodayPnl } from './define/today-pnl.js'
import { TsEquityCurve } from './define/equity-curve.js'
import { TsSessionClock } from './define/session-clock.js'
import { TsWidget, escapeHtml } from './widget.js'
import { linePaths, scale } from './chart.js'
import { defineWidget, widgetCatalog, onCatalogChange } from './registry.js'
import { persistLayout } from './persist.js'

export { version, persistLayout, TsGrid, TsWidget, TsCard, TsMetric, TsChart, TsTodayPnl, TsEquityCurve, TsSessionClock }
// The authoring kit (RFC 0003 §3): register a widget of your own, and the helpers the built-in widgets draw with.
export { defineWidget, widgetCatalog, onCatalogChange, linePaths, scale, escapeHtml }
