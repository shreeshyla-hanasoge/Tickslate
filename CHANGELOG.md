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
