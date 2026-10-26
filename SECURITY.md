# Security policy

## Supported versions

| Version | Supported |
|---|---|
| 0.1.x | Yes |
| Earlier than 0.1.0 | No. 0.0.0 was a private scaffold and was never published |

While Tickslate is 0.x, only the latest 0.1 release gets fixes. When a new
minor version ships, this table is updated in the same change.

## Reporting a vulnerability

**Please do not open a public issue, pull request or discussion for a
vulnerability.** Report it privately through GitHub:

1. Open the repository's **Security** tab.
2. Choose **Report a vulnerability**.
3. Describe what you found. This opens a private advisory that only you and
   the maintainer can see.

Direct link:
<https://github.com/shreeshyla-hanasoge/Tickslate/security/advisories/new>

A useful report has:

- the version of `tickslate` (and how you load it: npm, a CDN script, a local build)
- the browser and version
- the smallest HTML or data that shows the problem
- what you expected, and what happened instead

## What counts

Tickslate renders data a host passes in. It has no network code, no
credentials and no runtime dependencies, so the surface is small. These are in
scope:

- script or markup injection through any data, attribute or string a widget
  renders (cross-site scripting)
- a way for widget data to reach outside its own shadow root or the page it was
  given to
- a flaw in a saved layout that lets stored data run code when it is loaded
- a vulnerability in the published package or its build and release scripts

These are not, and a normal issue is the right place for them:

- a bug with no security effect, such as a wrong figure or a layout glitch
- a vulnerability in a host app, a browser, or a development-only dependency
  that does not ship in the published package

## How releases are protected

- Layouts read from storage or the network are capped (100 items per profile,
  20 profiles, 128-character ids) and `readLayout` never throws, so a hostile
  or broken value is dropped and reported, not run.
- Every string a host can pass in is tested as an XSS payload in real browsers,
  and `npm run lint` fails the build on a non-constant `innerHTML`,
  `eval` or `new Function` in the source.
- Dependabot and CodeQL run weekly, and every GitHub Action is pinned to a
  commit.
- A release is published only by the maintainer, from a protected environment,
  with an npm provenance attestation that links the package to its source
  commit (docs/RELEASING.md).

## What to expect

This is a small open-source project run by one maintainer, so these are
intentions, not guarantees:

- an acknowledgement within about a week
- an assessment, and a fix or a plan, as soon as the report is confirmed
- credit in the release notes if you want it, once a fixed version is out

Please give the maintainer time to ship a fix before you disclose the problem
publicly. GitHub's advisory page is used to coordinate the fix and the
disclosure.
