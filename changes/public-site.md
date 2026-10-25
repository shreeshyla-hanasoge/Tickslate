### Internal

- The public site: a landing page with a live, editable board on a made-up feed, a docs hub built from the repository's Markdown, and a changelog page, with the playground at `/playground.html`, the gallery, and the examples behind a shared site bar and footer. `npm run dev:site`, `npm run build:site`, `npm run build:ld` and `npm run pack:site` build it; docs/site.md covers the GitHub Pages and LambdaDeploy deploys.
- `SITE_VERSION` sets the version the site's install lines, CDN pins and footer name (default: `package.lib.json`'s), so a deploy never points visitors at a version npm doesn't have; when it differs, the install section and docs hub say which version the docs describe.
- The site's Markdown is rendered by `scripts/md.mjs`, a small renderer with no dependencies; `node scripts/md.mjs --check` runs its self-checks before every site build. Links with a scheme other than http, https or mailto render as text.
- The site build puts `tokens.css` before the theme presets on every page and fails if it can't, which fixes Calm, Signal and Graphite not recolouring the built gallery. Its offline check runs after the pages are emitted, removes only the Google Fonts links the dev pages use, and fails on any other link, script, CSS `url()` or `@import`, or script `import()`, `new URL()` or `fetch()` of another host.
- One theme across the site: the bar's switch on every page writes `data-theme` (`auto` by default), and the playground's and generic example's own theme buttons follow it both ways. The gallery's page follows the system by default.
- The playground has a `Playground` heading with its grid's tile headings at level 2, and its edit log sits under the grid inside the page's main landmark instead of floating over the bottom tile.
- The example pages follow the system's dark mode, put a level 2 heading before their tiles, and the examples index no longer says the pages need `npm run dev`.
- `docs/reference/core.md` links `toNumber` at its real anchor, `#tonumberv`.
- `SITE_BASE` must be an absolute path; a relative base such as `./` is refused, since the published pages move to new folders.
