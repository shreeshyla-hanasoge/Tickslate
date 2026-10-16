// The define modules (src/elements/define/<file>.js) whose elements are not widgets: no tile chrome, no data shape,
// no states. Three tests assume that every define module is one widget (entries.test.mjs by file name,
// tile-chrome.test.mjs by class, docs-coverage.test.mjs by page), and each reads this list to leave these out.
// A story that adds such an element (the layout list, say) adds one line here: `file: ['ts-tag', …]`.
// The grid has its own special cases in those tests and is not listed.
export const NON_WIDGET_DEFINES = {
  // The picker and the grid controls share one opt-in entry (RFC 0003 §18.5).
  controls: ['ts-widget-picker', 'ts-grid-controls'],
}

/** The define module file names, without `.js`. */
export const nonWidgetFiles = () => Object.keys(NON_WIDGET_DEFINES)

/** Every tag those modules register. */
export const nonWidgetTags = () => Object.values(NON_WIDGET_DEFINES).flat()
