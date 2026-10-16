/**
 * <ts-widget-picker for="grid-id">: a native modal dialog (a bottom sheet below
 * 700px, centred above) from which a user adds tiles to a <ts-grid>. It lists the
 * grid's hidden children as "Add back" and, for the types in `grid.addTypes`,
 * the catalog's widgets with one button per size. Search matches the label and
 * the description. Parts: `sheet`, `search`, `group`, `row`, `chip`, `empty`, `close`.
 */
export declare class TsWidgetPicker extends HTMLElement {
  /** The id of the <ts-grid> it adds to. */
  for: string
  /** Reflects whether the dialog is open. */
  readonly open: boolean
  /** Opens the dialog. Focus returns to `opener` (default: the focused element) when it closes. */
  show(opener?: HTMLElement): void
  close(): void
}

/**
 * <ts-grid-controls for="grid-id">: a profile switcher (Auto, Market hours,
 * After close, with the next switch under it) that renders only when the grid
 * has a `schedule`, and the link that makes the edit pill's Add open a picker.
 * Parts: `switcher`, `option`, `next`.
 */
export declare class TsGridControls extends HTMLElement {
  /** The id of the <ts-grid> it controls. */
  for: string
  /** The id of a <ts-widget-picker> to link; null means the one whose `for` is the same grid. */
  picker: string | null
}

declare global {
  interface HTMLElementTagNameMap {
    'ts-widget-picker': TsWidgetPicker
    'ts-grid-controls': TsGridControls
  }
}
