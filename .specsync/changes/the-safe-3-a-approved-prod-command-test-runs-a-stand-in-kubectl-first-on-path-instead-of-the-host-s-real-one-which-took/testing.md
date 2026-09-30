---
change: the-safe-3-a-approved-prod-command-test-runs-a-stand-in-kubectl-first-on-path-instead-of-the-host-s-real-one-which-took
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-503` | `tests/agent.safe3a-owner-shell.test.ts` "approved on the card, the same prod command runs once in the talk worktree" | The stand-in `kubectl` records exactly one call, `get pods`, in the talk worktree and none in the main checkout; `ran.marker` is written; one `mustask` card. Load bench (4 concurrent copies of the file, 5 rounds = 20 file runs each), approved test min/median/max: before the fix with a `kubectl` on PATH that takes 5.5 s (as the CI run that timed out) 0 of 20 passed, every run timed out at 5001-5010 ms with `killed 1 dangling process`, the CI failure; with one that takes 2.5 s (the CI median) 20 of 20 at 2616/2652/2673 ms. After the fix: 5.5 s kubectl 20 of 20 at 123/167/214 ms, 2.5 s kubectl 20 of 20 at 136/158/196 ms, no kubectl 20 of 20 at 119/150/184 ms (before: 114/158/240 ms), no load 20 of 20 at 101/105/112 ms (before: 85/98/110 ms); with the full suite running alongside the 4 copies and a 5.5 s kubectl on PATH, 20 of 20 at 148/196/304 ms (the suite alongside: 3198 pass, 0 fail). |
| `REQ-agent-503` | `tests/agent.safe3a-owner-shell.test.ts` "the owner's shell-exec of a prod command still raises the must-ask Approve card; a deny runs nothing" | With the same stand-in first on PATH, a deny records no `kubectl` call and no `ran.marker`; one `mustask` destructive card. |
| `REQ-agent-503` | the whole file and full `bun test` | All 9 tests of the file pass (93 expect calls); PATH is restored after each test, so later tests see the host PATH. Full suite passes. |
