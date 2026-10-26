// Every tile on the widgets fixture has drawn its content. A burst of first renders is time-sliced over several tasks
// (RFC 0003 §23), so right after __ready a tile can still be the empty group it is built as, with no name and no
// figures. Waiting on frames or a timer would only guess how long that takes under load; the condition is the tile's
// own: named, and no longer busy.
export const drawn = (page) =>
  page.waitForFunction(() =>
    [...window.__fx.tiles.values()].every((el) => {
      const tile = el.shadowRoot.querySelector('.tile')
      return !!tile.getAttribute('aria-label') && !tile.hasAttribute('aria-busy')
    }),
  )
