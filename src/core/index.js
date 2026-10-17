/**
 * Tickslate core — framework-free, zero runtime dependencies, no DOM side
 * effects on import. The API is specified in docs/rfc/0001-api.md.
 */
export const version = '0.2.0'

export {
  SIZES,
  SIZE_NAMES,
  BREAKPOINTS,
  isSize,
  columnsFor,
  deviceFor,
  footprint,
  snapSize,
} from './sizes.js'
export { WIDGETS, DEFAULT_PROFILE, typeOf, typeForTag } from './catalog.js'
export { place } from './place.js'
export { LAYOUT_VERSION, BUILT_IN_PROFILES, TOP_STRIP_MAX, readLayout, emptyLayout } from './layout.js'
export {
  addItem,
  removeItem,
  moveItem,
  resizeItem,
  stepSize,
  sizeForExtent,
  dropIndex,
  withProfile,
  setTopStrip,
} from './edit.js'
export { createFormatter, configure, onConfigure, currentConfig, toNumber } from './format.js'
export { EN, createMessages } from './messages.js'
export { createCalendar, presets, activeProfile, nextProfileChange, usDaylightSaving } from './calendar.js'
export { edgeStats, histogram, funding } from './stats.js'
export { zonedTime, localDate } from './zone.js'
export { toTime, toDay } from './time.js'
export { equitySeries, equityStats, dayStats } from './stats.js'
