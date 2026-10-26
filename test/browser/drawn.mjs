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

// The same condition for every child of a grid, the ones a page adds after __ready included (the XSS page builds its own
// tiles, and the last of a burst of thirty are drawn a task or more after the first).
export const gridDrawn = (page, selector = '#g > *') =>
  page.waitForFunction((sel) => [...document.querySelectorAll(sel)].every((el) => {
    const tile = el.shadowRoot && el.shadowRoot.querySelector('.tile')
    return !!tile && !!tile.getAttribute('aria-label') && !tile.hasAttribute('aria-busy')
  }), selector)
