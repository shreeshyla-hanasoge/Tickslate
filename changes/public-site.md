### Internal

- The public site: a landing page with a live, editable board on a made-up feed, a docs hub built from the repository's Markdown, and a changelog page, with the playground at `/playground.html`, the gallery, and the examples behind a shared site bar. `npm run dev:site`, `npm run build:site`, `npm run build:ld` and `npm run pack:site` build it; docs/site.md covers the GitHub Pages and LambdaDeploy deploys.
- The site's Markdown is rendered by `scripts/md.mjs`, a small renderer with no dependencies, so the site keeps the library's zero-dependency rule.
- The site build puts `tokens.css` before the theme presets on every page and fails if it can't, which fixes Calm, Signal and Graphite not recolouring the built gallery. Its offline check now runs after the pages are emitted, so it sees them, and it also catches a third-party `<script src>`.
- The playground has a `Playground` heading with its grid's tile headings at level 2, and its edit log sits under the grid inside the page's main landmark instead of floating over the bottom tile.
- The example pages follow the system's dark mode (`data-theme="auto"`), and the examples index no longer says the pages need `npm run dev`.
- `SITE_BASE` must be an absolute path; a relative base such as `./` is refused, since the published pages move to new folders.
