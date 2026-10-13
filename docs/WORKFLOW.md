# Workflow

How work reaches `master`, and the house rules every change follows. It
applies to the maintainer and to every agent session working in this repo.

Work is planned as **stories**. Each story has an id (for example
`land-v1-foundation`), acceptance criteria, and a list of the files it may
change. Stories are built in **waves**: a set of stories that are built
together, checked together, and land on `master` in one merge.

## Branches

| Branch | Cut from | Merges into | Merged by |
|---|---|---|---|
| `wave/<n>` | `master`, or `wave/<n-1>` while that is unmerged | `master` (its PR targets `wave/<n-1>` until that merges) | The maintainer, once the wave's RFC is approved |
| `story/<story-id>` | `wave/<n>` | `wave/<n>`, through one PR | The maintainer, or an agent he tells in chat to merge it |

1. **One integration branch per wave**, named `wave/<n>` and counting from 0.
2. **Cut it from `master`.** If `wave/<n-1>` is still unmerged, cut it from
   `wave/<n-1>` instead, so the next wave can start while the last one waits
   for review.
3. **Never more than one unmerged wave ahead of `master`.** A wave may stack on
   one unmerged wave, never on two: `wave/<n>` is cut from an unmerged
   `wave/<n-1>` only when `wave/<n-2>` is already on `master`. So at most two
   waves are open at once, and a third waits.
4. **Shared branches are never rewritten.** `master` and `wave/*` are not
   rebased or force-pushed. To take in new commits from the branch below,
   merge that branch in.
5. **Story branches are `story/<story-id>`**, not `wave/<n>/<story-id>`: git
   can't hold a branch `wave/0` and a branch `wave/0/<anything>` at once.

```bash
git fetch origin
git switch -c wave/3 origin/master    # wave/2 is on master
git switch -c wave/3 origin/wave/2    # wave/2 is unmerged, wave/1 is on master
git push -u origin wave/3
```

### Where wave 0 starts

PRs #1 to #5 (RFC 0001, the layout engine, `<ts-grid>`, formatting and
calendars, and the first three widgets) came before this policy. They are a
stack of their own, and they count as the wave before wave 0. `wave/0` is cut
from their head, `claude/widgets-first-three`, and its PR targets that branch
until #5 merges, then `master`. Rule 3 applies: `wave/1` is not cut until #1
to #5 are on `master`.

## Stories

1. **Branch** from the wave: `git switch -c story/<story-id> origin/wave/<n>`.
2. **Change only the story's files**, plus its changelog fragment
   `changes/<story-id>.md`. A change needed in another file goes to the story
   that owns it, or becomes a new story. It isn't made in passing.
3. **Check** with `npm test` before opening the PR.
4. **Open one PR into `wave/<n>`**, titled with the story's title. The body
   says what it does, how it was checked, each acceptance criterion with its
   evidence, and anything the maintainer has to decide.
5. **Keep up** with the wave by merging `wave/<n>` into the story branch.
   Rebasing would need a force-push, which needs the maintainer's go-ahead.

CI runs on every PR, story PRs into a wave included.

### Conflicts

A conflict goes back to the story that caused it, which is the one that
would merge second. That story resolves the conflict on its own branch, checks
again, and updates its PR. Nobody fixes another story's conflict on the wave
branch.

The same goes for a wave whose tests fail after stories that each passed
alone are merged. Find the merge that broke it, for example with
`git bisect --first-parent` on `wave/<n>`, and send the failure back to that
story.

### Orchestrated waves

When one orchestrating session builds a wave's stories in parallel in a single
working tree, the story branch and the story PR are replaced by **one commit
per story on `wave/<n>`**, which the orchestrator makes. Everything else
holds: each story touches only its own files and writes its own fragment, a
conflict or failure goes back to that story's agent, and the wave closes and
lands as below. The maintainer reviews the wave PR commit by commit.

## Closing a wave

A wave closes when:

- every story in it has merged into `wave/<n>`, or has been moved to a later
  wave, and
- `npm test` and `npm run release` pass at the tip of `wave/<n>`.

Then open **one PR for the wave**: `wave/<n>` into `master`, or into
`wave/<n-1>` while that is unmerged. The body lists each story with its PR or
commit, the test count, the bundle sizes from `npm run release`, the RFC the
wave builds against and its status, and the open questions. A wave that fails
either command stays open, and the failure goes back to the story that caused
it.

## Landing a wave

- **The maintainer merges `wave/<n>` into `master` once its RFC is approved.**
  The wave PR names the RFC it builds against. A wave that changes no public
  API names none, and lands on review alone.
- **Waves land in order.** A wave PR that still targets `wave/<n-1>` is not
  merged there: `wave/<n-1>` lands first, then the PR is retargeted to
  `master` and merged.
- **Use "Create a merge commit".** It keeps the wave's commits as they are, so
  a wave stacked on this one shrinks to its own commits once it targets
  `master`.
  - Don't squash. A squash puts one new commit on `master`, and the wave
    stacked on it still carries the originals, so its PR shows them all again.
  - "Rebase and merge" also writes new commits on GitHub. It works, but the
    next wave branch then has to be rebased onto `master` (git drops the
    commits that are already there) and force-pushed.
- **Retarget the PR stacked on it** to `master` straight after the merge:
  `gh pr edit <pr> --base master`. Deleting the merged branch also makes GitHub
  retarget it, but this repository doesn't delete branches on merge. Check a
  stacked PR's base before merging it, or it lands on the old branch instead of
  `master`.
- **After a squash or a rebase-merge**, retarget the next PR, then rebase its
  branch: `git rebase --onto origin/master <old-base-tip> <branch>`. Pushing
  that needs a force-push, so ask the maintainer in chat first.
- `master` receives wave merges and the maintainer's own commits, nothing
  else.

## House rules

- **No AI attribution in commits or PRs.** No `Co-Authored-By` trailers, no
  "Generated with" footers, and no naming the tools or models that did the
  work. Commits are authored by the maintainer alone.
- **Publishing, tags and releases are the maintainer's.** Agents prepare them:
  the version bump, the changelog, `dist-lib/` and the exact commands. They
  never run `npm publish`, push a version tag or create a GitHub release.
- **Merging and force-pushing need the maintainer's go-ahead in chat**, each
  time. Agents don't comment on PRs on his behalf unless he asks.
- **API changes go through the RFC.** A new public name, a changed signature
  or a change to documented behaviour needs an approved section in
  [docs/rfc/](rfc/) before the code that implements it merges. Building what
  an approved RFC already says needs nothing new. Where the code has to differ
  from the RFC, record it in the RFC in the same PR and point it out for
  approval.
- **Never edit Emberwick or Traed.** `~/projects/Emberwick`, `~/projects/traed`
  and its `traed-*` checkouts are read for reference only. A change they need
  is written up for the maintainer.
- **Each story adds `changes/<story-id>.md` instead of editing
  `CHANGELOG.md`.** Release prep folds the fragments into `CHANGELOG.md`; the
  format is in [changes/README.md](../changes/README.md).
- **No figures from the design references.** Numbers in code, tests, docs and
  demos are made up.

## Checks

| When | Run |
|---|---|
| Before opening a story PR | `npm test` |
| Closing a wave | `npm test` and `npm run release` on `wave/<n>` |
| Before the maintainer publishes | `npm run release`, then `npm publish ./dist-lib` (his to run) |
