---
change: the-safe-3-a-approved-prod-command-test-runs-a-stand-in-kubectl-first-on-path-instead-of-the-host-s-real-one-which-took
artifact: tasks
---

# Tasks

- [x] Read the CI logs of the failed and passing runs: only the approved test is slow, 2.4-3.1 s every run and over 5 s once.
- [x] Time each phase of the test locally (talk set-up, model round, must-ask gate, shell spawn) with and without 4 concurrent copies.
- [x] Reproduce the CI failure locally with a slow `kubectl` on PATH (timed out after 5000 ms, `killed 1 dangling process`).
- [x] Check the deny sibling and every other test that drives the must-ask gate for the same cause (none runs a real prod tool).
- [x] `tests/agent.safe3a-owner-shell.test.ts`: a stand-in `kubectl` first on PATH (restored after each test) that records its calls; the approved test asserts one `get pods` call in the talk worktree and none in the main checkout, the deny test none.
- [x] Prove 20/20 under the same load with a slow `kubectl` on the host PATH; full verify.
