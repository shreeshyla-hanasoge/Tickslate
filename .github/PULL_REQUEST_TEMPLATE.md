## What this does

<!-- One or two sentences. Link the issue or RFC it builds on. -->

## How it was checked

<!-- Commands you ran, browsers you tried, manual accessibility checks and what you found. -->

## Acceptance

<!-- Each criterion of the story or issue, and the evidence that it is met. -->

## For the maintainer to decide

<!-- Open questions, or "nothing". -->

## Checklist

- [ ] `npm test` passes
- [ ] `npm run test:browser` passes, if this changes what a browser renders
- [ ] `npm run release` passes, if this changes anything that ships (size budgets included)
- [ ] Any new or changed public name is in an approved RFC, or this builds what one already says
- [ ] Docs are updated (`docs/widgets/`, `docs/reference/`, the guides) and no figure in them is real
- [ ] `changes/<story-id>.md` is added, and `CHANGELOG.md` is not edited
- [ ] [docs/ACCESSIBILITY.md](https://github.com/shreeshyla-hanasoge/Tickslate/blob/master/docs/ACCESSIBILITY.md) is met, and the manual checks I ran are noted above
- [ ] Theming goes through `--ts-*` tokens, with no hard-coded colours
- [ ] Unit tests import only `src/` and `node:*`
- [ ] Comments explain why, not what
- [ ] This is one story, and touches only the files it needs
