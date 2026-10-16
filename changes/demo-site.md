### Added

- A demo site you can try without cloning: the playground, the widget gallery and the examples, built as static pages. It makes no third-party requests and uses the system fonts.
- The playground's `Copy HTML` button copies the layout and sample data on screen as one standalone page that loads the published package from jsDelivr.

### Internal

- `npm run build:site` builds `dist-site/` (`vite.site.config.js`, base `/Tickslate/`, or `SITE_BASE=./` for relative URLs) and fails if a built page references another host; `npm run preview:site` serves it.
- `.github/workflows/pages.yml` builds and deploys the site to GitHub Pages on a push to `master`. It stays skipped until the maintainer sets Pages to the GitHub Actions source and adds the `PAGES_ENABLED` repository variable.
- The playground and gallery wrap their content in `<main>`.
