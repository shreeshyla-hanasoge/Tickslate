# Tickslate

Finance dashboard widgets for the web. A grid of trading-aware widgets that
users can add, remove and resize, with one layout for market hours and another
for after the close. Framework-free, themed with CSS variables, and fed by
your own data.

> **Status: pre-release.** Nothing usable has shipped yet. This repository is
> the scaffold; the plan is in [docs/BRIEF.md](docs/BRIEF.md).

## What it will do

- **A widget grid with fixed sizes.** Seven sizes on a 4-column grid
  (S, Wide, Tall, M, L, Banner, XL). Widgets move up to fill gaps, and the
  grid drops to 3 columns on tablets and 2 on phones.
- **Widgets that understand trading.** Today's P&L, equity curve, daily P&L
  calendar, edge stats, capital funding with shortfalls, open positions with
  stop and target, watchlist, exchange session clock, and a candlestick mini
  chart drawn with [Emberwick](https://github.com/shreeshyla-hanasoge/Emberwick).
- **Layouts that follow the market.** A market-hours layout and an
  after-close layout, switched by the exchange session clock and saved as JSON.
- **Works anywhere.** The widgets are custom elements, so they run in Vue,
  React, Svelte or plain HTML. The core has no runtime dependencies.
- **Your theme.** Ships with Paper (light) and Graphite (gray-scale dark); every
  colour, radius and font is a `--ts-*` CSS variable you can override.
- **Your data.** Tickslate never talks to a broker. Your app passes data in.

## Development

```bash
npm install
npm run dev        # playground at http://localhost:5173
npm test           # node --test, no install needed
npm run release    # test, build ESM + UMD, assemble dist-lib/
```

Publishing is done from the assembled folder: `npm publish ./dist-lib`.

## Licence

MIT © Shreeshyla Hanasoge
