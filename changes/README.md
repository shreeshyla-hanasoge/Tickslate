# Changelog fragments

Each story records its changes here, in its own file, instead of editing
`CHANGELOG.md`. Stories built in parallel then never conflict over the
changelog, and release prep has one file per story to work from.

## The file

- **One file per story**, named `changes/<story-id>.md` after the story's id
  in the backlog, for example `changes/ts-metric.md`.
- **Headings**, in this order, and only those with entries. They are level
  three, the level they take under a version in `CHANGELOG.md`, so folding
  them in needs no re-levelling.

  | Heading | For |
  |---|---|
  | `### Added` | New things a user of the library can use: an element, a function, an attribute, an event, a token |
  | `### Changed` | Existing behaviour that works differently, without breaking a host's code |
  | `### Breaking` | Anything that makes a host change its code or data, including a removal, and what to do instead |
  | `### Internal` | Work only contributors notice: tests, CI, scripts, repository docs |

- **One user-facing line per change**: a single bullet, written for someone
  using the library rather than for a reviewer. Name the public thing in
  backticks. Leave out files, tests and how it was built.
- **A story with nothing user-facing** still writes a fragment, with only an
  `### Internal` section, so every story visibly has one.
- **Don't edit another story's fragment.** If your story changes something
  another unreleased fragment describes, describe the result in your own;
  release prep merges the two.

## Example

The names below are for illustration only.

```markdown
### Added

- `<ts-example>`: a single figure with a label and a signed change, at S and Wide.

### Changed

- Money formatting shows no sign on values that round to zero.

### Breaking

- `readExample()` returns `{ value, issues }` instead of the bare value; read `.value`.

### Internal

- Unit tests share one fake DOM.
```

## At release

Release prep folds the fragments into a new version section of
`CHANGELOG.md`, under the same Added, Changed and Breaking headings. It merges
lines that describe the same change, drops lines that a later story in the same
release undid, and leaves out Internal lines unless they matter to people who
build Tickslate from source. It then deletes the fragments it folded in, in the
same commit. This README stays.
