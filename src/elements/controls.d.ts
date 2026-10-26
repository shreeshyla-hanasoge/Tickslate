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

/**
 * <ts-layout-list for="grid-id">: the grid's active profile as a list, one row per tile with a button for each
 * size it supports, Move up, Move down and Remove, and an Undo button. It edits through the grid's move, resize
 * and remove, so it fires the same `ts-layout-change` events as dragging and shares its undo history. Needs no
 * pointer, no drag and no board. Parts: `list`, `rows`, `row`, `name`, `size`, `move`, `remove`, `undo`, `status`, `empty`.
 */
export declare class TsLayoutList extends HTMLElement {
  /** The id of the <ts-grid> it edits. */
  for: string
}

declare global {
  interface HTMLElementTagNameMap {
    'ts-widget-picker': TsWidgetPicker
    'ts-grid-controls': TsGridControls
    'ts-layout-list': TsLayoutList
  }
}
