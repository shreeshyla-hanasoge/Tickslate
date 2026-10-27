# Versioning

Tickslate follows [Semantic Versioning](https://semver.org/). This page says
what counts as a breaking change for each surface a host can touch, so a
reviewer and a user read the same line. The surface itself is pinned by
`test/api-surface.snapshot.json` (see [Checking it](#checking-it)).

## The rules

- **Under 0.x** a minor release (0.2 to 0.3) may break. It says so in the
  changelog's `### Breaking` section, with a line telling the host what to do
  instead. A patch release never breaks.
- **From 1.0.0** only a major release breaks.
- **A removal is announced first.** The old name keeps working for at least one
  minor release and warns once in development, then goes in a later release
  listed under Breaking.
- **Not breaking** still goes in the changelog: a new thing under Added, a
  different default value or reworded English under Changed.

## What counts, surface by surface

| Surface | Breaking | Not breaking |
|---|---|---|
| Core exports (`tickslate`) | Removing or renaming an export; a required new argument; a changed return shape (a removed or retyped field); throwing where it didn't | A new export; a new optional argument or field |
| Element classes and tags | Removing or renaming a tag or an exported class | A new element |
| Attributes and properties | Removing, renaming or changing the meaning of one; changing a default that changes behaviour a host relied on | A new attribute or property |
| Events and `ts-action` details | Removing or renaming an event or an action; removing or retyping a detail field | A new event; a new field; a new action that is opt-in through `actions` |
| Parts and slots | Removing or renaming one | A new part or slot |
| `--ts-*` tokens | Removing or renaming a token | A new token; a changed default *value* (Changed, not Breaking, unless it breaks a contrast floor) |
| Message keys (`EN`) | Removing or renaming a key, or removing a parameter | A new key; reworded English (listed under Changed) |
| Saved layouts (`LAYOUT_VERSION`) | A change that makes a layout a previous version wrote read differently; a bump without a migration | New optional fields; new issue codes |
| Package entries and `exports` | Removing or renaming an entry; dropping a condition | A new entry |
| Browser and Node floors | Raising a floor | Lowering it |
| Keyboard and accessibility tree | Adding or removing a tab stop in a default widget (0.3.0: one tab stop on every chart that draws a plot); changing a role | Reworded accessible names (Changed); a tab stop that only an opt-in adds |
| The tile's CSS contract | Changing the tile's container type or name (0.3.0: `container-type: inline-size` became `container: ts-tile / size`); requiring something new of the host's CSS, such as a definite height | A new tier rule inside the widget |
| Look and layout of widgets | Not API: the visual baselines make changes visible, and the changelog lists them under Changed | |
| Size budgets, `Internal` modules, tests | Not API: no promise | |

## Checking it

- **`test/api-surface.test.mjs`** reads the exports, each tag's observed
  attributes, events and `ts-action` names, its parts, the `--ts-*` tokens
  declared in `src/themes/tokens.css` and the keys of `package.lib.json`'s
  `exports`, and fails on any difference from `test/api-surface.snapshot.json`.
  It runs under `npm test` without an install. When a change is intended, run
  `npm run api:update`, review the diff of the snapshot, and commit it in the
  same PR with a changelog line under Added (a new name) or Breaking (a removed
  or renamed one).
- **The visual baselines** (`npm run test:visual`) show a change of look. An
  intentional one updates the baselines in the same PR, and the PR says which
  look changed and why.
- **`npm run coverage`** reports line coverage of `src/core` (90 % floor) and
  of the widget view models (80 % floor).
