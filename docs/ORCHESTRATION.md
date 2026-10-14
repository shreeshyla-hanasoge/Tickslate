# Orchestrating Tickslate work

How an orchestrating agent turns roadmap stories into a reviewed, integrated
wave. It applies to any agent the maintainer sets up as an orchestrator,
whatever its model or platform. Every worker also follows
[AGENTS.md](../AGENTS.md).

## Trigger

You are the orchestrator when the maintainer sends one or more **"Copy for
agent" blocks**. Each block starts with a line `# Tickslate story: <title>`
and carries the agent handbook, the brief, the acceptance criteria, the tasks,
the owned files, the dependencies, the notes so far and the settled
decisions. Until such a block arrives, wait. Don't start work on your own.

A message may also name:

- **the base branch**: what the new wave is cut from and its PR targets.
  Default: the highest-numbered `wave/<n>` branch on `origin`.
- **the wave branch** you create and integrate into. Default:
  `wave/<n+1>`.
- **the worker model**. Default: the one the maintainer set up with you;
  otherwise your platform's sub-agent model.

State the branches you chose in your plan.

## Role

You never write product code. You plan, brief, review, integrate, verify and
report. Workers do all the building, fixing and reviewing. Your value is the
quality bar: nothing reaches the maintainer that you haven't checked yourself.

## Phase 0: Read before you delegate

1. `AGENTS.md`. Its rules bind you and every worker.
2. [RFC 0003](rfc/0003-p1-surfaces.md), the approved P1 contract. Its "Which
   story builds which section" table maps stories to sections. Read RFC 0001
   and RFC 0002 for anything 0003 doesn't cover.
3. [WORKFLOW.md](WORKFLOW.md), [ACCESSIBILITY.md](ACCESSIBILITY.md),
   [changes/README.md](../changes/README.md), and the header comment of
   `src/elements/widget.js`.

You can't judge a worker against a contract you haven't read.

## Phase 1: Plan the batch

- Check each story's dependencies are done. If one isn't, drop the story from
  this run and say why.
- Build a file-overlap matrix from the owned files. Stories with disjoint files
  run in **parallel**. Overlapping stories run **sequentially**, the later one
  starting from the integrated result of the earlier. Never let two workers own
  the same file at the same time.
- Order by priority, then by what unblocks the most later stories.
- Write the plan in five to ten lines before launching anything: branches,
  batches, parallel or sequential, and why.

## Phase 2: Brief one builder per story

Each builder works on its own branch (`story/<story-id>`, cut from the wave
branch) in its own checkout or worktree. Every brief contains:

1. **Setup:** the exact base commit and the branch to create.
2. **Read first:** the RFC sections by number, `AGENTS.md`,
   `changes/README.md`, and the source files to study.
3. **The story:** user story, build list and acceptance criteria, word for
   word from the block.
4. **File boundary:** the owned files, and the files it must not touch because
   other workers own them in this batch. If it needs another file, it stops
   and reports.
5. **Contract rules:**
   - Never edit an RFC; record deviations under `### Internal` in
     `changes/<story-id>.md`.
   - Every visible or spoken string is an `EN` key read via `ctx.t`.
   - Tokens only and logical CSS.
   - The template and the view model are pure; `update()` patches in place.
   - Accessibility follows `docs/ACCESSIBILITY.md`.
6. **Size rule:** never raise a budget, never trim strings or messages to fit
   one. Report the measurement.
7. **Verification:**
   - `npm ci`, `npm test`, and `npm run release`, which must exit 0 apart from
     a reported budget row.
   - Browser tests run through a scratch Playwright config outside the repo,
     on a port of its own (5180 to 5199, one per worker), with `--strictPort`
     and `reuseExistingServer: false`. Never use the shared port 5174 in
     parallel.
   - For visual work: screenshots at desktop and phone widths (S about 170px,
     Wide/M about 351px), light and dark, and `widgets.html?preset=terminal`.
     The worker looks at them.
8. **Commit:** one commit with an exact subject you give, `<plain sentence>
   (<story-id>)`. No AI attribution of any kind. No push unless you say so.
9. **Hand-back:**
   - the branch and SHA;
   - the files changed, and anything outside the boundary with the reason;
   - each acceptance criterion with its evidence;
   - unit and browser test counts;
   - sizes against budgets;
   - deviations from the RFC;
   - anything it is unsure of.

## Phase 3: Independent review

A fresh worker reviews each story, read-only. A builder never reviews its own
work. The reviewer gets the commit, the RFC section, the acceptance criteria
and the deviations you have already accepted, so it doesn't report those again.
It proves problems with concrete inputs (probe scripts, real browser runs,
real locales), not reasoning alone. Aim it at:

- races and leaks: connect, disconnect, reconnect, moves, pending async
  results, stale caches;
- locales and right-to-left text (`ar-EG`, `he`, `fa`, `nl`, `ja-JP`), DST gaps
  and overlaps, empty, null or garbage data, and prototype keys;
- accessibility: names, roles, headings, `aria-hidden` glyphs, forced colours,
  reduced motion;
- tests that can't fail: fake DOMs that invent nodes, regexes that miss cases,
  loops that never run;
- English literals that bypass `ctx.t`, colour values, physical CSS, impure
  templates;
- bundles: tree-shaking, side effects, duplicate cores, type stubs that don't
  match the runtime;
- docs, typings and fragments that don't match the code, and comments that say
  what instead of why.

Findings are graded blocker, major, minor or nit. Each has a file and line, a
failing scenario and a fix.

## Phase 4: Fix loop

Send findings back to the **same** builder, which has the context. It amends
its commit if the commit isn't integrated yet, and adds a new commit otherwise.

- Fix every blocker and major.
- Fix minors unless that would widen the story; record those as follow-ups.
- Review again if the fix was large.

## Phase 5: Integrate

A worker makes the edits; you direct and check.

- Cherry-pick or merge finished stories onto the wave branch in dependency
  order. Resolve conflicts by reading both stories' intent, never by dropping
  one side.
- After each batch, run the full suite on the wave branch:
  - `npm test` three times in a row, to catch flakiness;
  - `npm run release`;
  - `npm run test:browser` on all five projects.

  Integration failures are fixed at the root cause, in a separate commit that
  names the story.
- **Size budgets:** only you may authorise a re-measure, per RFC 0003 §25:
  measurement plus 10%, rounded up to the next 0.5 kB, dated, with the reason,
  and only after the feature is reviewed.
  - Never re-measure to hide a regression the review flagged.
  - Leave the "grid + one widget" rows as warnings; that question is parked.
- **Flaky tests** get fixed, never retried away.

## Phase 6: Verify it yourself

Never delegate this phase. Before you call anything done:

- Run `npm test` and `npm run release` yourself on the wave branch, and confirm
  the browser suite result.
- Look at screenshots yourself:
  - each changed widget at phone and desktop width;
  - light, dark and one monospace preset;
  - right-to-left, if the story touches layout.

  Look for figures that wrap mid-number, clipping, overflow and misaligned
  labels.
- Spot-check one acceptance criterion per story by hand, in the playground
  (`npm run dev`) or with a tiny script.
- Re-read each fragment: user-facing, one line per change, breaking changes
  under `### Breaking`.

If anything is off, send it back to a worker. Don't patch it yourself and don't
report it as done.

## Phase 7: Ship and report

1. **Push and open the PR.** Push the wave branch; never `master`, never
   force. Open one pull request from the wave branch into the base branch.
   The body covers:
   - the stories;
   - the checks, with counts;
   - breaking changes;
   - budget changes, with reasons;
   - deviations;
   - what the maintainer must decide.

   No AI attribution anywhere.
2. **Reply to the maintainer** with:
   1. A short summary: what shipped, the PR link and the test counts.
   2. The decisions needed, numbered, each with your recommendation.
   3. One board update per story, in the JSON shape from `AGENTS.md`.
      `status` is `done` only when the story passes on the integrated wave
      branch and every acceptance criterion holds. Otherwise it stays `now`,
      with what's missing in the note.

## Red flags

Reject a hand-back that has any of these:

- strings or error messages shortened to fit a budget, or a budget raised by a
  worker;
- an edited RFC, or files outside the boundary changed without a stated reason;
- "tests pass" with no counts, browser tests not run, or visuals not looked at;
- new English text in a template or view model, or colour values or physical
  CSS in widget code;
- tests that can't fail, or timing assertions on wall-clock time;
- docs, typings or the README that contradict the code;
- a `Co-Authored-By` line or any mention of an AI in a commit or PR.

## Escalate

Stop and ask the maintainer when:

- the RFC is ambiguous in a way that changes public API;
- a fix needs a public name the RFC doesn't have;
- a parked question blocks a story;
- the work would need publishing, tagging, editing `master`, or a sibling
  repository.

Keep escalations short: what is blocked, what you found, the options, and your
recommendation.

## If you can't start workers yourself

Do phases 0 and 1. Then give the maintainer ready-to-send briefs: a builder
brief per story in the phase 2 format and, after each hand-back, a reviewer
brief in the phase 3 format. Ask the maintainer to paste each worker's report
back to you, then continue with phases 3 to 7 exactly as written, still never
writing product code yourself.
