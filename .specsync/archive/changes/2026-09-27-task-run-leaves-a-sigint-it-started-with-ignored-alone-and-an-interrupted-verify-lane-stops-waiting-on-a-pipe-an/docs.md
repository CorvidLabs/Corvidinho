---
change: task-run-leaves-a-sigint-it-started-with-ignored-alone-and-an-interrupted-verify-lane-stops-waiting-on-a-pipe-an
artifact: docs
---

# Docs

- Inline comments in `taskRun` (`src/cli.ts`) say why a signal started
  ignored is not hooked; `src/agent/verify.ts` documents the post-abort
  pipe grace.
- `specs/cli/cli.spec.md` and `specs/agent/agent.spec.md` get an Error Cases
  row each (SIGINT started ignored; escaped process holding the lane pipe),
  the agent invariant paragraph names the 250 ms pipe grace, and both change
  logs get a row.
- No README, CHANGELOG, STATUS or package version change; no operator doc
  change (no env var or flag).
