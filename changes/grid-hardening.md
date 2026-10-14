### Fixed

- A `<ts-grid>` inside a closed shadow root no longer leaves edit mode when a tile, handle or the edit pill inside it is tapped, and its Add back list is no longer closed by a press on one of its own items. A tap outside the host still ends editing.
- A resize that loses its pointer (the browser cancels it, the pointer is released elsewhere, or the pointer leaves the window) now puts the tile back as it was, with its resize button visible again and nothing committed, instead of leaving the tile lifted.

### Internal

- `isOutside()` in `src/elements/grid-focus.js` takes an optional fourth argument, `passedThrough`, for a press the grid itself saw. It is internal and not part of the public API.
- The closed-shadow-root spec in `test/browser/grid-edge.spec.mjs` is no longer `fixme`, and new specs cover the Add back list in a closed root and a resize whose capture is lost or whose pointer is cancelled.
