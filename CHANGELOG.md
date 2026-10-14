# Changelog

All notable changes to Tickslate are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## Unreleased

- Repository scaffold: build, packaging, test and CI setup, theme tokens, and
  the product brief. No widgets yet.
- Layout engine in the core (RFC 0001 §4): sizes and breakpoints, phone and
  tablet reflow, gap-filling placement that matches CSS `grid-auto-flow:
  dense`, forgiving layout loading (`readLayout`), pure editing operations, and
  `dropIndex` / `sizeForExtent` for live drag and resize in the grid.
- `<ts-grid>` (RFC 0001 §8.4, §8.6): lays out the host's tiles from a layout,
  reflows across 4, 3 and 2 columns, and edits like an iPhone home screen:
  long-press or `editing` to start, drag with live reflow, a resize handle that
  snaps between supported sizes, remove badges, edge auto-scroll, and full
  keyboard support. Fires `ts-layout-change` for the host to save.
- New tokens: `--ts-row-compact`, `--ts-gap-compact`, `--ts-num-weight`,
  `--ts-num-weight-small`, `--ts-shadow-lift`, `--ts-motion`, `--ts-ease`.
- `sizeForExtent` takes optional `columns` and `current`, so resizing on a
  phone or tablet snaps by what the user sees.
- Playground: a demo dashboard to try it, in both themes and both profiles.
