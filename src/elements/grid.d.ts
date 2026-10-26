import type { Calendar, Device, Layout, LayoutItem, LayoutIssue, Thresholds, MessageOverrides, ProfileSchedule, Catalog, SizeName, Translate } from '../core/index.js'

/**
 * Remote or async storage for `persistLayout`: either method may return a
 * promise. The grid shows its defaults while `load` is pending, and the result is ignored when the device changed,
 * `reset()` or `dispose()` ran, a later load started, or the user edited in the
 * meantime. `save` is called on each `ts-layout-change`, in event order, and
 * not awaited. A throw or a rejection is caught and warns once in development;
 * the adapter owns retries and ordering.
 */
export interface LayoutAdapter {
  /** What is stored for `device`; null or undefined for nothing. It is read like a saved layout, so a Layout or an item array both work. */
  load(device: Device): Layout | LayoutItem[] | unknown | null | undefined | Promise<Layout | LayoutItem[] | unknown | null | undefined>
  save(device: Device, layout: Layout): void | Promise<void>
  /** Called by `reset()`; without it `reset()` only applies the defaults. */
  remove?(device: Device): void | Promise<void>
}

export interface TsLayoutChangeDetail {
  /** The whole layout after the edit; save this. */
  layout: Layout
  /** `layout.profiles[profile]`, for hosts that don't use profiles. */
  items: LayoutItem[]
  /** The layout before the edit. */
  previous: Layout
  profile: string
  reason: 'move' | 'resize' | 'remove' | 'add' | 'undo'
  /** The item that was moved, resized, removed or added back. Empty for 'undo', which restores a whole profile: compare `previous` and `layout`. */
  id: string
  /** On 'remove': the item's index in the profile before it went. On 'add': its index after it came back. */
  index?: number
  /** On 'remove': the item that was removed. On 'add': the item as restored. */
  item?: LayoutItem
}

/** What `ts-add-request` carries (RFC 0003 §18.2). The event bubbles, is composed and is cancelable. */
export interface TsAddRequestDetail {
  /** The catalog key. */
  type: string
  /** The item id the host must give the new child. */
  id: string
  /** The size the grid will place it at. */
  size: SizeName
}

export interface TsReadingOrderChangeDetail {
  /** The visible tiles' ids in their new visual order. */
  order: string[]
}

/**
 * <ts-grid>: positions its children and lets the user rearrange them like
 * apps on an iPhone: long-press to edit, drag to move, drag the corner handle
 * to resize, tap − to remove. Ctrl or Cmd+Z undoes while editing, and after a
 * remove an undo toast (`part="toast"`; `undo-toast="off"` suppresses it) offers Undo for 6 s.
 *
 * Built-in edit controls, all hidden by `locked` and by `edit-controls="off"`
 * (for hosts with their own): a visually hidden "Edit layout" button that is
 * the grid's first Tab stop; while editing, a floating pill (`part="edit-pill"`)
 * with Done and, while tiles are hidden, "Add back (n)" and its list; and a
 * pointerdown outside the grid ends edit mode. When editing ends, focus goes
 * back to the element that started it, else to the grid. A profile with no
 * visible tiles shows an empty panel (`part="empty"`), replaceable through
 * `slot="empty"`, that also offers Add back (not while locked or with `edit-controls="off"`).
 *
 * Accessible editing: each tile's edit chrome is a plain container of three
 * sibling buttons, the handle (the tile's one Tab stop, named "<label>,
 * <size>, position n of N"), Remove and Resize. Space or Enter picks a tile
 * up, arrows move it, Space drops it, Escape cancels, + and - resize, Delete
 * removes. Without a keyboard or a drag (WCAG 2.5.7), tap a tile to pick it
 * up, then tap another tile to put it in that slot, or the held tile to drop
 * it; Escape or a tap on empty board cancels. Managed tiles are `inert` while
 * editing, and the grid's polite status region announces each step. A
 * scheduled profile change that falls due while editing applies after Done.
 *
 * Attributes: `editing`, `profile`, `locked`, `undo-toast="off"`,
 * `edit-controls="off"`, `locale` (for plural forms in its messages),
 * `persist="my-dash"` (saves the layout to `localStorage` per device, with no script).
 * Parts: `board`, `placeholder`, `toast`, `edit-pill`, `empty`.
 * Slots: the default one for tiles, and `empty`. The grid assigns tiles to its
 * own slots itself, so a tile's `slot` attribute is not used, except
 * `slot="empty"` on the content that replaces the empty board's text.
 *
 * Reading and Tab order follow the layout, not the host's DOM order, outside
 * edit mode (WCAG 1.3.2 and 2.4.3), and the grid never moves a child to do it.
 * `ts-reading-order-change` fires when the order of the visible tiles changes,
 * though not for the first order with a tile in it, which `readingOrder`
 * reports, nor for the host's first `layout` before any edit, nor mid-edit; at
 * Done it fires before `ts-edit-change`. A declarative shadow root without
 * `shadowrootslotassignment="manual"` assigns by name, so the grid falls back to
 * one slot there, and a tile's own `slot` attribute (other than `empty`) leaves it unrendered.
 *
 * With no `layout` set it works from its children alone (implicit mode): each
 * child becomes a tile, its id is written back as `item`, and the grid's own
 * list stays the truth across re-renders. Setting `layout` to a Layout or an
 * item array switches to explicit mode for good, where each child is matched
 * to a layout item by its `item` attribute. Items with no child are kept in
 * every commit, and items with an unknown type are kept as they are.
 */
export declare class TsGrid extends HTMLElement {
  /** In implicit mode, the layout seeded from the children. Reading never changes anything; setting it (a Layout or an item array) is read through readLayout(); repairs fire `ts-layout-issues`. */
  get layout(): Layout
  set layout(value: Layout | LayoutItem[])
  /** Column thresholds in px of the grid's own width. Defaults to `{ tablet: 700, desktop: 1200 }`; a missing key keeps its default and an invalid set is ignored with one development warning. Setting it re-measures. Property only. */
  breakpoints: Thresholds
  /** Defaults to WIDGETS. May be a function that resolves one item to its spec. */
  catalog: Catalog
  /** Overrides for the grid's own strings and for every tile inside it; null clears. Assign a new object to change them. */
  messages: MessageOverrides | null
  /** The grid's own translate function: its messages, then configure()'s, then EN, with plural forms from its `locale` attribute. */
  readonly t: Translate
  /** The profile shown; reflects the `profile` attribute. Defaults to 'market'. */
  profile: string
  /** Edit mode; reflects the `editing` attribute. */
  editing: boolean
  /**
   * Read-only dashboard: no long press, no edit mode, no edit controls. While
   * set, `editing = true` is ignored with one development warning, and setting
   * it while editing ends edit mode. Reflects the `locked` attribute.
   */
  locked: boolean
  /**
   * A key that saves the layout to `localStorage` under `${key}:${device}`, as
   * `persistLayout(grid, { key })` does, with the layout the grid shows when
   * its device is first known as the defaults. null, or no attribute, turns
   * saving off; so does an empty string, with one development warning. Changing
   * it re-attaches, and the grid detaches when removed from the page. Reflects
   * the `persist` attribute.
   */
  persist: string | null
  /** Children whose item id isn't in the active profile, which includes tiles the user removed. */
  readonly hiddenItems: ReadonlyArray<{ id: string; type: string; label: string }>
  /**
   * Restores the active profile's previous layout (up to 20 steps per profile,
   * cleared when the host sets `layout`) and fires `ts-layout-change` with
   * reason 'undo'. Returns false when there is nothing to undo.
   */
  undo(): boolean
  /**
   * Adds a hidden child's item back (its declared size, else its first
   * supported one), fires `ts-layout-change` with reason 'add' and records an
   * undo step. Returns false when no hidden child has that id.
   */
  restore(id: string): boolean
  /**
   * The types the host answers `ts-add-request` for: a list, '*' for every catalog type, or
   * null (the default) for none. The picker offers catalog types only for these; `add` doesn't need it.
   */
  addTypes: readonly string[] | '*' | null
  /**
   * Asks for a new tile of `type`. A hidden child with the same `id` is restored instead. Otherwise the
   * grid fires the cancelable `ts-add-request { type, id, size }`; the host takes it with `preventDefault()`
   * and answers by rendering a child with `item=id`, which the grid places at `size` and commits with
   * reason 'add' (it waits 10 s). Returns the id, or null when the type is unknown or nobody took the request.
   */
  add(request: { type: string; id?: string; size?: SizeName }): string | null
  /** Moves the item to `toIndex` in the active profile (clamped). False for an unknown id. Commits with reason 'move'. */
  move(id: string, toIndex: number): boolean
  /** Resizes the item, snapped to its spec. False for an unknown id. Commits with reason 'resize'. */
  resize(id: string, size: SizeName): boolean
  /** Removes the item, which becomes a hidden child. False for an unknown id. Commits with reason 'remove'. */
  remove(id: string): boolean
  /** The DOM's own `remove()`, which the grid keeps: it takes the grid off the page. TypeScript needs it declared, because `remove(id)` alone is not assignable to `Element.remove()`. */
  remove(): void
  /** The profile `override()` is showing, or null when the schedule (or the `profile` attribute) decides. */
  readonly profileOverride: string | null
  /** Set by `<ts-grid-controls>` while a picker is linked: the edit pill then shows Add, which calls this. */
  openPicker: (() => void) | null
  /**
   * The visible tiles' ids in visual order: row by row, in the page's inline
   * direction (right to left under dir=rtl), by each tile's top-left cell. Where the browser has manual slot assignment (Safari
   * 16.4, Chrome 86, Firefox 92), the grid slots its tiles in this order, so
   * reading and Tab order follow the layout outside edit mode while the host's
   * DOM order stays as it is; elsewhere they follow the DOM order. While
   * editing it holds the order from before, except that a tile removed
   * meanwhile leaves it at once, and it takes the new order at Done. Empty
   * before the first render.
   */
  readonly readingOrder: readonly string[]
  /** 2, 3 or 4, from the grid's own width. 0 before it is first measured. */
  readonly columns: number
  /** Switches between 'market' and 'closed' on time when `profile` isn't pinned. */
  schedule: (ProfileSchedule & { calendar: Calendar }) | null
  /** What the grid takes the time to be. Defaults to Date.now. */
  clock: () => number
  /** Show a profile until the schedule next changes (or until override(null) with no schedule). */
  override(profile: string | null): void
}

declare global {
  interface HTMLElementTagNameMap {
    'ts-grid': TsGrid
  }
  interface HTMLElementEventMap {
    'ts-layout-change': CustomEvent<TsLayoutChangeDetail>
    'ts-add-request': CustomEvent<TsAddRequestDetail>
    'ts-layout-issues': CustomEvent<{ issues: LayoutIssue[] }>
    'ts-edit-change': CustomEvent<{ editing: boolean }>
    'ts-reading-order-change': CustomEvent<TsReadingOrderChangeDetail>
    'ts-columns-change': CustomEvent<{ columns: 2 | 3 | 4; device: 'desktop' | 'phone'; initial: boolean }>
    'ts-profile-change': CustomEvent<{ profile: string; reason: 'schedule' | 'override' | 'override-ended' }>
  }
}
