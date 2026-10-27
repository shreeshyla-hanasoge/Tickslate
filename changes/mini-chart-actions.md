### Added

- `<ts-mini-chart>` can ask to switch its instrument. Give each chart `instruments` (`{ id, label }`, at most 50) and the shown `instrumentId`, and list `'instrument'` in `actions`: a native select named "Instrument" replaces the name in the chart's row at M, L and XL, and choosing fires `ts-action { action: 'instrument', id, value }`. The widget never switches itself; `preventDefault()` puts the picker back.
- Any widget can ask to be expanded. List `'expand'` in `actions` and every size but `S` gets an icon button named "Expand {label}" last in the header, firing `ts-action { action: 'expand', id }`. The host decides what expanding means, for example `requestFullscreen()`. Both actions do nothing while the grid is being edited.
- Three messages: `action.expand`, `miniChart.instrument` and `miniChart.instrumentOf`.
