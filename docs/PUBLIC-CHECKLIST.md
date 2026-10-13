# Going public: checklist

Before Tickslate goes public, this checklist lists everything in the
repository, in files and in history, that is private or might be real. It also
lists the settings only the maintainer can change. The audit was run on
13 Oct 2026 over branch `wave/0` at `dd51551`, every local and remote ref, and
the Wave 0 working tree. Line numbers are as of `dd51551` unless a row says
otherwise.

Agents prepare this list. The maintainer decides and changes the settings.
Agents never change repository settings, publish, tag, rewrite history or
force-push.

This file will be public too, so it never repeats what it flags. "The app
name" means the internal name of the first consumer, the trading app the
designs were made for. Figures appear only as their shape, for example
`+₹#,###.##`. To see a flagged value, open the line the row names, for example
`git show dd51551:test/format.test.mjs`.

## How the audit was run

```bash
# Tracked files. <app> is the app name; <brokers> are the broker and company names.
git grep -n -i -E '<app>|claude\.ai|/Users/|@gmail|<brokers>|~/projects'
git grep -n '₹'
# History: every commit on every ref, and the commit messages
git grep -n -i -E '<same pattern>' $(git rev-list --all)
git log --all -p -S'<figure>'          # for each flagged figure below
git log --all --format='%h %B' | grep -i -E '<same pattern>|₹'
```

Every number in the repository was also compared with the design references
(the design canvas boards *Money*, *Capital*, *Strategies*, *Market*, *Grid*
and *PhoneEdit*), and the figures shown in those designs are flagged below. The
brief says the designs use the maintainer's real figures in places, so any
figure from the designs might be real.

Re-run the commands before making the repository public. Some Wave 0 files
did not exist yet when this audit ran: `docs/rfc/0002-integration-and-ux.md`,
`docs/ACCESSIBILITY.md` and `docs/design/generic-widgets.html`.

## Flagged figures

These are the unique figures that came from the design references. In the
files this story owns, each one is replaced by a made-up value of the same
shape (the same sign, digits, decimals and grouping). The tests were updated to
expect the new values.

**Maintainer answer: pending.** Which of these are real? The answer decides
whether git history needs rewriting (see the steps at the end).

| # | Shape | What the designs show | Seen at (`dd51551`) | Replaced with (go-public files) | Maintainer answer |
|---|---|---|---|---|---|
| 1 | `+₹#,###.##`, plus its rounded `+₹#,###` and a lakh example made from its digits (`₹#,##,###.00`) | Today's net P&L | `docs/BRIEF.md:60`, `test/format.test.mjs:10, 21, 50, 57` | `+₹2,185.65`, `+₹2,186`, `+₹2,74,936.00`, `274936.5` | pending |
| 2 | `−₹###.00` | One strategy's P&L today | `docs/BRIEF.md:60`, `test/format.test.mjs:11` | `−₹263.00` | pending |
| 3 | `−₹###`, the intraday low "at 09:45" | Today's intraday low | `docs/rfc/0001-api.md:542`, `src/elements/today-pnl.js:103` | `−₹715` | pending |
| 4 | `+₹#,###.00`, plus a near copy `#,###.5` | Realised P&L | `test/today-pnl.test.mjs:13`, `test/format.test.mjs:37` | `+₹1,860.00`, `1375.5` | pending |
| 5 | `+₹###.##` | Unrealised P&L | `test/today-pnl.test.mjs:14` | `+₹412.95` | pending |
| 6 | `₹##.##` | Today's fees | `test/today-pnl.test.mjs:15` | `₹87.30` | pending |
| 7 | "# closed · # open" | Today's trade counts | `test/today-pnl.test.mjs:16–17` | "3 closed · 1 open" | pending |
| 8 | `₹##,###.##` | Total capital across two brokers | `test/format.test.mjs:25` | `₹64,318.27` | pending |
| 9 | `₹##,###.##` | One broker's balance | `docs/rfc/0001-api.md:643` | not in go-public files | pending |
| 10 | `₹##,###` (two of them) | Strategy allocations | `docs/rfc/0001-api.md:643` | not in go-public files | pending |
| 11 | `₹#,###.##` | One allocation's shortfall | `docs/rfc/0001-api.md:644` | not in go-public files | pending |
| 12 | `+₹#.#k`, `−₹#.#k`, plus lakh forms made from them | P&L calendar compact figures | `docs/BRIEF.md:61`, `test/format.test.mjs:31–33`, `index.html:324–325` | `+₹2.7K`, `−₹4.6K`, `₹2.7L`, `−₹4.6L` | pending |
| 13 | `#.##` | Profit factor | `test/format.test.mjs:65` | `1.38` | pending |
| 14 | `##%` | Win rate | `test/format.test.mjs:78` | `43%` | pending |
| 15 | `##,###.##` and `+#.##%` | NIFTY 50 level and change; the *Market* board says they came from a screenshot | `test/format.test.mjs:70, 75` | `23,847.60`, `+2.70%` | pending |
| 16 | `−#.##%` | CRUDEOIL change | `test/format.test.mjs:76` | `−0.58%` | pending |
| 17 | Two broker names (not figures) | The brokers the accounts are held at | `docs/rfc/0001-api.md:623, 642` | not in go-public files | pending |

Checked and **not** flagged:

- **Clock times and durations.** These are `11:42`, `11:42:20`, `09:45`,
  `2:40` and `3h 48m`, plus the session minutes 147, 375, 385 and 870 in
  tests. The brief says the 11:42 session is made up, and session hours are
  public exchange facts.
- **Equity-curve test values** (`1000`, `500`, `2500`, `−1500`, `−1800`, fees
  `₹310.50`, and so on) were written for the tests. `2500` and `1800` match
  only chart-scale constants in the designs, not any figure shown there.
- **RFC 0001's "low −₹801 at 09:30"** comes from the gallery's seeded
  synthetic data, not from the designs.
- **Synthetic data in `index.html` and `widgets.html`**: fees `21460.35` and
  `184.6`, the random walks, `12,345.67`, `18,45,000.50` and `5,432.1`.
- **The maintainer's name** in `LICENSE`, `README.md` and `package.lib.json`
  is intentional authorship.

## Findings in tracked files

Kinds: internal name, private link, local path, possibly real figure, personal
data.

### go-public (this story): fixed here

| File | Line | Kind | Action | Owning story |
|---|---|---|---|---|
| `CHANGELOG.md` | 57 | internal name (the dark theme named after the app) | Renamed to Graphite | go-public |
| `index.html` | 51 | internal name (theme button) | Renamed to Graphite | go-public |
| `index.html` | 194 | internal name (the app's market hours) | Now "Example market hours" | go-public |
| `index.html` | 323–326 | possibly real figure (#1, 2, 8, 12, 14, 15) | Formatting samples use made-up values | go-public |
| `widgets.html` | 12, 180 | internal name (theme name) | Renamed to Graphite | go-public |
| `src/themes/tokens.css` | 6 | internal name (twice) | Gives a generic reason: an app on the Tailwind gray palette needs no dark overrides | go-public |
| `src/elements/grid.js` | 271 | internal name (the app's build spec) | `override()` described generically | go-public |
| `src/elements/widget.js` | 30, 149 | possibly real figure (#1) | `+₹2,185.65`, which is still 10 characters, so the width reasoning holds | go-public |
| `src/core/index.d.ts` | 204, 210 | possibly real figure (#1, 2, 15) | `+₹2,185.65`, `−₹263.00`, `0.027 → '+2.70%'` | go-public |
| `test/calendar.test.mjs` | 141 | internal name (the app's build spec) | Now "Example market hours" | go-public |
| `test/format.test.mjs` | 10, 11, 21, 25, 31–33, 37, 50, 56, 57, 65, 70, 75, 76, 78, 106 | possibly real figure (#1, 2, 4, 8, 12–16) | Replaced, expectations recomputed | go-public |
| `test/today-pnl.test.mjs` | 12–17, 23, 25 and every assertion on them | possibly real figure (#1, 3–7) | Replaced and kept consistent (realised + unrealised − fees = net), expectations recomputed | go-public |
| `package.lib.json` | 6 | personal data (author email) | **Kept.** npm shows the author publicly, and every commit already carries this address. The maintainer may drop the email and keep the name. | go-public (maintainer decides) |

### rfc-0002: not edited here

| File | Line | Kind | Action | Owning story |
|---|---|---|---|---|
| `CLAUDE.md` | 5 | internal name | Describe it as "the maintainer's trading app, the first consumer" | rfc-0002 |
| `CLAUDE.md` | 13–14 | local path (`~/projects/Emberwick`, plus the app's checkout paths) and internal name | Keep the rule without the app name or the paths ("never edit sibling projects from a Tickslate session"), or move the paths to an untracked local file | rfc-0002 |
| `docs/BRIEF.md` | 4, 8, 11, 18, 21, 34, 59, 111, 178 | internal name | Neutral wording ("a trading app", "the first consumer"), and "Graphite" for the dark theme | rfc-0002 |
| `docs/BRIEF.md` | 16 | private link (claude.ai artifact) | Remove the link and say the design references are private | rfc-0002 |
| `docs/BRIEF.md` | 20 | private link and internal name (the app's build spec) | Same | rfc-0002 |
| `docs/BRIEF.md` | 60–61 | possibly real figure (#1, 2, 12) | Use made-up values (for example the go-public ones) | rfc-0002 |
| `docs/rfc/0001-api.md` | 8, 406, 477, 501, 593, 869 | internal name (the app's build spec, the app's formula) | Neutral wording ("the build spec", "the designs' formula") | rfc-0002 |
| `docs/rfc/0001-api.md` | 294, 297, 300–301, 921 | possibly real figure (#1, 2, 12) | Made-up values | rfc-0002 |
| `docs/rfc/0001-api.md` | 542–543 | possibly real figure (#1, 3) | Made-up values | rfc-0002 |
| `docs/rfc/0001-api.md` | 623 | internal name (broker names, #17) | Generic examples (`'Broker A'`, `'Broker B'`) | rfc-0002 |
| `docs/rfc/0001-api.md` | 642–644, 651–652 | internal name (#17) and possibly real figure (#9, 10, 11) | A made-up account and amounts with the same arithmetic (each allocation short when measured alone) | rfc-0002 |
| `docs/rfc/0001-api.md` | 697 | possibly real figure (#15) | `0.027 = +2.70%` | rfc-0002 |
| `docs/rfc/0001-api.md` | 901 | possibly real figure (#1) | Made-up value | rfc-0002 |

### Other stories: not edited here

| File | Line | Kind | Action | Owning story |
|---|---|---|---|---|
| `docs/WORKFLOW.md` (new, working tree) | 142–143 | internal name and local path (the app's checkout paths) | Same fix as `CLAUDE.md` 13–14 | land-v1-foundation |
| `src/elements/session-clock.js` | 113, 287 | none: a false positive (the pattern matches inside an identifier) | No action | prep-refactors |
| `test/equity-curve.test.mjs` | 162–393 (`₹` lines) | none: test-made values, checked against the designs | No action | prep-refactors |
| `src/elements/today-pnl.js` | 103 | possibly real figure (#3, in a comment) | Use a made-up value in the comment | No Wave 0 owner; data-inputs (Wave 1) is the first story to edit the file |
| `src/core/format.js` | 58 | none: `−₹0.00` is a generic example | No action | (none) |

## Findings in git history

History is linear. `origin/master` is at `344f8c6`. The stacked PR branches
(`claude/layout-engine`, `claude/grid-element`, `claude/format-calendar`,
`claude/widgets-first-three`, `claude/project-requirements-execution-0e3a2a`)
and `wave/0` carry the later commits. Each finding stays in every later commit
until history is rewritten. Fixing the files, as above, removes nothing from
history.

| Commit | Line | Kind | Action | Owning story |
|---|---|---|---|---|
| `344f8c6` Scaffold (on `master`) `CLAUDE.md` | 5, 13, 14 | internal name, local path | History: maintainer decides (step 1) | maintainer |
| `344f8c6` `docs/BRIEF.md` | 4, 8, 11, 18, 21, 34, 59, 111, 178 | internal name | Same | maintainer |
| `344f8c6` `docs/BRIEF.md` | 16, 20 | private link (two claude.ai artifact IDs) | Same | maintainer |
| `344f8c6` `docs/BRIEF.md` | 60, 61 | possibly real figure (#1, 2, 12) | Same | maintainer |
| `344f8c6` `package.lib.json` | 6 | personal data (email) | Same | maintainer |
| `344f8c6` `src/themes/tokens.css` | 6 | internal name | Same | maintainer |
| `3141181` RFC 0001 `docs/rfc/0001-api.md` | 8, 368, 419, 443\*, 512, 542, 561\*, 692 | internal name (broker names at 542, 561) | Same | maintainer |
| `3141181` `docs/rfc/0001-api.md` | 262, 265, 268, 269, 483, 484, 562, 563, 570, 571, 616, 724, 742 | possibly real figure (#1–3, 9–12, 15) | Same | maintainer |
| `00917cd` `docs/rfc/0001-api.md` | 577 | internal name | Same | maintainer |
| `fab1244` `docs/rfc/0001-api.md` | 467 | internal name | Same | maintainer |
| `fab1244` `index.html` | 38 | internal name (theme name) | Same | maintainer |
| `66bf557` `index.html` | 192 | internal name | Same | maintainer |
| `66bf557` `index.html` | 248–251 | possibly real figure (#1, 2, 8, 12, 14, 15) | Same | maintainer |
| `66bf557` `src/core/index.d.ts` | 204, 210 | possibly real figure (#1, 2, 15) | Same | maintainer |
| `66bf557` `src/elements/grid.js` | 271 | internal name | Same | maintainer |
| `66bf557` `test/calendar.test.mjs` | 141 | internal name | Same | maintainer |
| `66bf557` `test/format.test.mjs` | 10, 11, 21, 25, 31–33, 37, 50, 56, 57, 65, 70, 75, 76, 78, 106 | possibly real figure | Same | maintainer |
| `dd51551` commit message | body | internal name (theme name) | Same | maintainer |
| `dd51551` `CHANGELOG.md` | 57 | internal name | Same | maintainer |
| `dd51551` `widgets.html` | 12, 180 | internal name | Same | maintainer |
| `dd51551` `src/elements/widget.js` | 30, 149 | possibly real figure (#1) | Same | maintainer |
| `dd51551` `src/elements/today-pnl.js` | 103 | possibly real figure (#3) | Same | maintainer |
| `dd51551` `test/today-pnl.test.mjs` | 12–17, 23, 25, 53–62, 84–93, 101, 138–142, 146, 157, 219–220, 232–235 | possibly real figure (#1, 3–7) | Same | maintainer |
| All 8 commits: author and committer | — | personal data (the same email as `package.lib.json`) | Public on every commit once the repository is public | maintainer |

\* These lines exist only in history: later commits reworded them. Their
wording still contains the same names.

No commit message or trailer carries AI attribution. No tags or notes exist.

## URLs in `package.lib.json` and `README.md`

Checked on 13 Oct 2026 with an unauthenticated `curl -L` and `gh api`:

| URL | Where | Result | Verdict |
|---|---|---|---|
| `https://github.com/shreeshyla-hanasoge/Tickslate#readme` | `homepage` | 404 | Correct. `gh api` gives this `html_url`; it 404s only because the repository is private |
| `https://github.com/shreeshyla-hanasoge/Tickslate/issues` | `bugs.url` | 404 | Correct; issues are enabled. 404 only while private |
| `git+https://github.com/shreeshyla-hanasoge/Tickslate.git` | `repository.url` | 404 | Correct; matches `origin`. 404 only while private |
| `https://github.com/shreeshyla-hanasoge/Emberwick` | README | 200 | Resolves; Emberwick is public |
| `docs/BRIEF.md` (relative) | README | file exists | npmjs.com resolves relative links against `repository`, so it 404s there until the repository is public |
| `http://localhost:5173` | README, dev section | local dev server | Not a public link |
| `https://keepachangelog.com/en/1.1.0/`, `https://semver.org/` | `CHANGELOG.md`, which ships in the package | 200 | Resolve |

The name `tickslate` is free on npm: `npm view tickslate` returned 404, and the
peer dependency `emberwick` resolves (200).

## Maintainer-only steps

Do these in order. Agents never do them.

1. **Answer the figures question above and decide whether history needs
   rewriting.** Agents never rewrite history or force-push. If no flagged
   figure is real, history can stay as it is. If some are real:
   - GitHub keeps every pull request's commits under `refs/pull/<n>/head`, and
     a force-push does not remove them. The GitHub guide to removing sensitive
     data says to ask GitHub Support to purge pull request refs and cached
     views after a rewrite.
   - The simpler path is to push a fresh history before the repository is
     made public, for example one squashed root commit in a new repository.
     The other path is a `git filter-repo` rewrite of every branch while the
     repository is still private, followed by the Support request.
   - The two claude.ai artifact IDs and the internal names are in history
     either way. Decide whether they matter once the figures are settled.
2. **Make the repository public** (Settings → General → Danger Zone → Change
   visibility). Do it after step 1 and after the Wave 0 files are fixed, and
   before release-0-1-0. Afterwards, check that the three GitHub URLs above
   return 200. Two optional tidy-ups first: delete the PR branches once they
   have merged, because their names become public too, and turn on "Keep my
   email addresses private" if future commits should use the noreply address.
3. **Enable private vulnerability reporting** (Settings → Code security →
   Private vulnerability reporting → Enable). The API returns 404 for it while
   the repository is private.
4. **Enable GitHub Pages when demo-site lands** (Settings → Pages → Source:
   GitHub Actions). Pages is off today (`has_pages: false`).
5. **Optionally, reserve the npm name.** `npm view tickslate` returned 404 on
   13 Oct 2026. npm holds a name only once a version is published, so either
   publish a placeholder (`npm publish ./dist-lib` of a 0.0.x) now, or wait
   for 0.1.0.
