import { TsGrid } from '../grid.js'
import { persistLayout } from '../persist.js'
import { define } from '../registry.js'

// persistLayout is exported here too because the grid's `persist` attribute uses
// it: with the all-in entry also importing it, the bundler would otherwise keep
// it out of this entry's chunk and leave `define` in a chunk consumers drop.
export { TsGrid, persistLayout }

define('ts-grid', TsGrid)
