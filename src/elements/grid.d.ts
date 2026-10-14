import type { Calendar, Layout, LayoutItem, LayoutIssue, Messages, ProfileSchedule, Catalog, Translate } from '../core/index.js'

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
 * `edit-controls="off"`, `locale` (for plural forms in its messages).
 * Parts: `board`, `placeholder`, `toast`, `edit-pill`, `empty`.
 * Slots: the default one for tiles, and `empty`.
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
  /** Defaults to WIDGETS. May be a function that resolves one item to its spec. */
  catalog: Catalog
  /** Overrides for the grid's own strings and for every tile inside it; null clears. Assign a new object to change them. */
  messages: Partial<Messages> | null
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
    'ts-layout-issues': CustomEvent<{ issues: LayoutIssue[] }>
    'ts-edit-change': CustomEvent<{ editing: boolean }>
    'ts-columns-change': CustomEvent<{ columns: 2 | 3 | 4; device: 'desktop' | 'phone'; initial: boolean }>
    'ts-profile-change': CustomEvent<{ profile: string; reason: 'schedule' | 'override' | 'override-ended' }>
  }
}
