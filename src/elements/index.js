/**
 * Tickslate custom elements. Importing this entry registers them with
 * customElements, so it is a side effect (listed in package.lib.json
 * "sideEffects"). Where there is no DOM, as during server-side rendering, it
 * registers nothing and still imports cleanly.
 */
import { version } from '../core/index.js'
import { TsGrid } from './grid.js'
import { TsWidget } from './widget.js'
import { TsTodayPnl } from './today-pnl.js'
import { TsEquityCurve } from './equity-curve.js'
import { TsSessionClock } from './session-clock.js'

export { version, TsGrid, TsWidget, TsTodayPnl, TsEquityCurve, TsSessionClock }

// Skipping a tag that is already defined lets two bundles, or a hot reload,
// import this entry without "already defined" errors.
function define(tag, ctor) {
  if (typeof customElements !== 'undefined' && !customElements.get(tag)) customElements.define(tag, ctor)
}

define('ts-grid', TsGrid)
define('ts-today-pnl', TsTodayPnl)
define('ts-equity-curve', TsEquityCurve)
define('ts-session-clock', TsSessionClock)
