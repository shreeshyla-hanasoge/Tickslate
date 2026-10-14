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
import { persistLayout } from './persist.js'
import { define } from './registry.js'

export { version, persistLayout, TsGrid, TsWidget, TsTodayPnl, TsEquityCurve, TsSessionClock }

define('ts-grid', TsGrid)
define('ts-today-pnl', TsTodayPnl)
define('ts-equity-curve', TsEquityCurve)
define('ts-session-clock', TsSessionClock)
