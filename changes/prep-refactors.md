### Internal

- No user-facing change. The chart, equity curve and session clock find a minimum or maximum with a loop instead of spreading data into `Math.min(...)` or `Math.max(...)`. A long series, such as 200,000 points, no longer overflows the stack, and the output is unchanged.
- The element tests' fake DOM (`FakeNode`, `FakeRoot`, `FakeElement`, `tick`) now lives in `test/fake-dom.mjs`, so new element tests import it from there instead of copying it.
