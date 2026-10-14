### Changed

- The dark theme is now called Graphite in the README, playground and gallery. `data-theme="dark"`, `.dark` and every `--ts-*` token are unchanged.

### Internal

- `docs/PUBLIC-CHECKLIST.md`: an audit of internal names, private links, local paths, personal data and possibly real figures, in files and in git history. Each finding has an owning story and an action, and the list ends with the steps only the maintainer can take to make the repository public.
- Tests, type comments and playground samples use made-up figures instead of ones taken from the design references, and code comments describe the first consumer generically.
