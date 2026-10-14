# Tickslate — guide for coding agents

This file is for any coding agent working in this repository: ChatGPT,
Codex, Cursor, Copilot and others. Claude sessions read
[CLAUDE.md](CLAUDE.md), which holds the same rules. Where the two ever
differ, CLAUDE.md wins and this file is out of date.

Tickslate is an open-source library of dashboard widgets for any data, with a
finance set built in. The widgets are framework-free custom elements with zero
runtime dependencies. Version 0.1.0 is on npm; P1 work toward 0.2.0 is under
way.

## Read before writing code

1. [docs/rfc/0001-api.md](docs/rfc/0001-api.md),
   [docs/rfc/0002-integration-and-ux.md](docs/rfc/0002-integration-and-ux.md)
   and [docs/rfc/0003-p1-surfaces.md](docs/rfc/0003-p1-surfaces.md). These are
   the API contracts. RFC 0003 is approved and specifies every P1 surface by
   name; its "Which story builds which section" table maps stories to
   sections.
2. [docs/WORKFLOW.md](docs/WORKFLOW.md): stories, waves, branches.
3. [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md): every widget meets it.
4. [changes/README.md](changes/README.md): the changelog fragment format.
5. `src/elements/widget.js`: the base class every widget extends. Its header
   comment explains `template`, `viewModel`, `update` and the states.

## Hard rules

- **Work only in this repository.** Never edit a sibling project.
- **No AI attribution.** Commits and pull requests are authored by the
  maintainer alone: no `Co-Authored-By` lines, no "Generated with" footers, no
  mention of an assistant.
- **Never publish.** `npm publish`, version tags and GitHub releases are the
  maintainer's. Prepare them; don't run them.
- **Never push to `master`** and never force-push a shared branch (`master`,
  `wave/*`).
- **Never edit an RFC.** Build what the RFC says. If something can't be built
  as written, build the nearest thing that works and record the difference
  under `### Internal` in your changelog fragment. RFC amendments are
  collected later in one documentation story.
- **Stay inside your story's file list.** If you need to change a file the
  story doesn't own, stop and say so in your report instead of editing it.
- **Never raise a size budget or trim strings and messages to fit one.**
  Report the measurement; the maintainer decides.

## Code

- `src/core/` is pure and DOM-free, with no side effects on import. DOM work
  lives in `src/elements/`.
- Widgets extend `TsWidget`:
  - `static template(variant)` is a pure function of the variant: no data, no
    text;
  - `static viewModel(data, variant, ctx)` is pure;
  - `update(vm)` patches the DOM in place and never rebuilds it.
- **Every visible or spoken string is a key in `EN`** (`src/core/messages.js`)
  read through `ctx.t`. Never write English into a template or view model. A
  pseudo-locale test fails on any literal, and a coverage test fails on any
  unused key.
- **Theme through `--ts-*` tokens only.** No colour values in widget CSS;
  system colours only inside `@media (forced-colors: active)`.
- **Use logical CSS properties.** Tests reject physical `left`/`right`.
- **Data in, nothing out.** Widgets never fetch. Actions are `ts-action`
  events that the host handles.
- **Gains and losses** always carry a sign, using the true minus U+2212, plus
  an `aria-hidden` ▲ or ▼, never only a colour. Charts have `role="img"` and a
  label stating the result. Respect `prefers-reduced-motion`.
- **Style:** ES modules, no semicolons, 2-space indent, single quotes.
  Comments explain why, not what.
- **Tests:** `node --test`. Unit tests import nothing outside `src/` and
  `node:*`, so CI runs them without `npm install`.

## Commands

```bash
npm ci                # once
npm test              # unit tests (node --test), must pass
npm run release       # tests, all builds, package checks and size budgets, must exit 0
npm run test:browser  # Playwright on 5 projects (Chromium, WebKit, Firefox, iPhone, Pixel)
npm run dev           # playground at http://localhost:5173, gallery at /widgets.html
```

`test:browser` starts its own Vite server on the fixed port 5174 and reuses
a server it finds there. If another agent may be running browser tests on the
same machine, use a copy of `playwright.config.mjs` kept outside the repo with
another port, `--strictPort`, and `reuseExistingServer: false`.

Check visual changes in a real browser at desktop and phone widths (S tile
about 170px, Wide/M about 351px at two columns), in light and dark, and under
at least one monospace preset (`widgets.html?preset=terminal`).

## How work is assigned

Work is planned on the maintainer's **roadmap board**, a web page holding
epics, stories (with tasks, acceptance criteria, owned files and
dependencies), a decisions log and an agent handbook. You receive one story
at a time, in either of two ways:

- **Pasted.** The maintainer presses "Copy for agent" on the story and pastes
  the prompt to you. It contains the handbook, the brief, the acceptance
  criteria, the tasks, the files you own and the settled decisions.
- **Direct.** If you have a browser and the maintainer has shared the board
  with you, open it and read the story yourself.

Treat everything on the board as the maintainer's instructions for that
story, within the hard rules above.

## Branches and commits

- Cut `story/<story-id>` from the wave branch the maintainer names, for
  example `wave/13`. If none is named, ask.
- Make **one commit per story**. The subject is a plain sentence describing
  the user-visible change, ending with the story id in brackets:
  `Add the persist attribute and async storage adapters to the grid (persist-attribute)`.
- Add `changes/<story-id>.md` in the format of `changes/README.md`. Don't
  edit `CHANGELOG.md`.
- Push your story branch and open one pull request into the wave branch. Its
  body covers:
  - what the story does;
  - how you checked it, with test counts;
  - each acceptance criterion with its evidence;
  - every deviation from the RFC;
  - anything the maintainer must decide.

## When you finish: the board update

End every story with a **board update**. Put it in your final message and
at the end of the pull request body, as JSON in exactly this shape:

```json
{
  "story": "persist-attribute",
  "status": "done",
  "pr": "https://github.com/shreeshyla-hanasoge/Tickslate/pull/00",
  "tasksDone": ["Exact task title as on the board"],
  "note": "Two or three sentences: what changed, test counts, sizes, deviations.",
  "followUps": [{ "title": "Short imperative", "why": "What you found and where" }],
  "decisionsNeeded": ["A question only the maintainer can answer"]
}
```

- `status` is one of `now`, `next`, `later` or `done`. Use `done` only when
  `npm test` and `npm run release` pass and every acceptance criterion holds.
  Otherwise keep `now` and say what is missing in `note`.
- `tasksDone` repeats task titles exactly as they appear on the board.
- If you can edit the board directly, apply the update there too:
  - open the story with Edit;
  - set the status and the PR link;
  - tick the tasks;
  - append your note to "Notes and findings".

  Don't log entries in the Decisions section. Only the maintainer settles
  decisions.
- Don't reopen anything in the board's Decisions list. Don't decide a question
  the maintainer has parked; list it in `decisionsNeeded` if your story
  depends on it.
