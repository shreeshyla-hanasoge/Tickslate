import type { Layout, LayoutIssue, WidgetCatalog } from '../core/index.js'

export { version } from '../core/index.js'

export interface TsLayoutChangeDetail {
  /** The whole layout after the edit; save this. */
  layout: Layout
  profile: string
  reason: 'move' | 'resize' | 'remove'
  /** The item that was moved, resized or removed. */
  id: string
}

/**
 * <ts-grid>: positions its children (each tagged item="<layout id>") from a
 * Layout, and lets the user rearrange them like apps on an iPhone: long-press
 * to edit, drag to move, drag the corner handle to resize, tap − to remove.
 */
export declare class TsGrid extends HTMLElement {
  /** Read through readLayout(); repairs fire `ts-layout-issues`. */
  layout: Layout
  /** Defaults to WIDGETS. Set it before `layout` if it adds tiles of the host's own. */
  catalog: WidgetCatalog
  /** The profile shown; reflects the `profile` attribute. Defaults to 'market'. */
  profile: string
  /** Edit mode; reflects the `editing` attribute. */
  editing: boolean
  /** 2, 3 or 4, from the grid's own width. 0 before it is first measured. */
  readonly columns: number
}

declare global {
  interface HTMLElementTagNameMap {
    'ts-grid': TsGrid
  }
  interface HTMLElementEventMap {
    'ts-layout-change': CustomEvent<TsLayoutChangeDetail>
    'ts-layout-issues': CustomEvent<{ issues: LayoutIssue[] }>
    'ts-edit-change': CustomEvent<{ editing: boolean }>
    'ts-columns-change': CustomEvent<{ columns: 2 | 3 | 4; device: 'desktop' | 'phone' }>
  }
}
