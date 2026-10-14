import type { Calendar, Layout, LayoutItem, LayoutIssue, ProfileSchedule, Catalog } from '../core/index.js'

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
  /** On 'remove': the item's index in the profile before it went. */
  index?: number
  /** On 'remove': the item that was removed. */
  item?: LayoutItem
}

/**
 * <ts-grid>: positions its children and lets the user rearrange them like
 * apps on an iPhone: long-press to edit, drag to move, drag the corner handle
 * to resize, tap − to remove. Ctrl or Cmd+Z undoes while editing, and after a
 * remove an undo toast (`part="toast"`; `undo-toast="off"` suppresses it) offers Undo for 6 s.
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
