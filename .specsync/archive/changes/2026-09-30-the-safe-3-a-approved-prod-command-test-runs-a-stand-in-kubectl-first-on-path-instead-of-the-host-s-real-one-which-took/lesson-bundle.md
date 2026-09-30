# Lesson bundle — the-safe-3-a-approved-prod-command-test-runs-a-stand-in-kubectl-first-on-path-instead-of-the-host-s-real-one-which-took

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: The SAFE-3.a approved-prod-command test runs a stand-in kubectl first on PATH instead of the host's real one, which took 2.4-3.1 s on CI runners and once passed the 5 s test timeout
- **Kind**: BugFix
- **Specs**: agent
- **Paths**: tests/agent.safe3a-owner-shell.test.ts
- **Acceptance**: The SAFE-3.a approved test runs its prod command against a stand-in kubectl first on PATH: the stand-in records exactly one call (get pods) in the talk worktree and none in the main checkout, and the deny test records none; with a kubectl on the host PATH that takes 5.5 s (like the CI runner run that timed out) the file passes 20 of 20 under 4 concurrent copies with the approved test at 123-214 ms, where before the fix it failed 20 of 20 at the 5 s timeout; the full suite passes

## Evidence

- Verification commit: `334c1da0ea155c036d7302e0d84249cadfa865c2`
- Base commit: `635d6a9b6a32a7874e5b32a1400051c641729bd2`
- Verified by: `specsync check --spec agent`

## From the change's context.md

# Context

CI (`smoke`, ubuntu-latest) failed on PR #328, run 36763209623 attempt 1:
`(fail) SAFE-3.a: … > approved on the card, the same prod command runs once
in the talk worktree [5000.76ms]`, `this test timed out after 5000ms`, with
`killed 1 dangling process` just before it. Attempt 2 passed.

The CI logs of every run since #324 show the same test far slower than its
siblings in the same file:

| CI run | approved test | deny test (same gate) | other 7 siblings |
|---|---|---|---|
| 918 (main, #324) | 2559.6 ms | 29.6 ms | 22-96 ms |
| 929 attempt 1 (PR #328) | 5000.8 ms (timeout, 1 dangling process killed) | 42.9 ms | 37-151 ms |
| 929 attempt 2 (PR #328) | 2408.2 ms | 42.5 ms | 35-143 ms |
| 931 (main, #328) | 3092.5 ms | 43.0 ms | 38-153 ms |
| 932 (PR #329) | 2887.3 ms | 42.7 ms | 36-150 ms |

Where the time goes (local phase probe of the same test, no kubectl on PATH):
talk worktree set-up 42 ms, first model round to the tool call 35 ms, the
must-ask gate from card raised to approved 3 ms (the `answerMustAsk` fixture
decides the card as it is recorded and polls every 5 ms, so no store poll or
engine tick is waited through), `shell-exec` spawn to result 12 ms; 114 ms in
all. In the full local suite it took 119 ms. The deny test goes through the
identical gate, card and store and takes about 43 ms on CI. The one step only
the approved test takes is running the command, and `shell-exec` hands the
child `process.env` (scrubbed, PATH kept), so `sh` runs the host's `kubectl`.
ubuntu-latest images ship kubectl; with HOME a fresh temp dir and no
KUBECONFIG it tries the default cluster and fails, and that run took
2.4-3.1 s per CI run and once more than 5 s. The dangling process bun killed
at the timeout is that still-running child. (How that time splits between
loading the binary and its failed cluster discovery on the runner was not
measured; the test should not depend on it either way.) CPU load alone does
not explain it: 4 concurrent copies of the file locally keep the test at
114-240 ms.

Also: `KUBECONFIG` is not in the verify-lane drop list, so on an operator's
box with KUBECONFIG set the verify lane's `bun test` would make this test
run `kubectl get pods` against a real cluster.

Ruled out: a store poll interval or engine tick (the fixture decides at once,
5 ms poll; gate 3 ms), the approval-cards delivery poll (no bridge in this
test), SQLite busy waits (the deny test opens the same DB the same number of
times and is fast), CPU load (above). No other test runs a real prod tool
after an approval: the other `answerMustAsk("approved")` users post through a
faked fetch (`discord-post-message`), push to a local bare repo (`git-push`)
or run a recording fake command (`must-ask.gate`); `update-helpers` already
puts a fake `systemctl` on PATH.

Constraints: test-only; no product surface change; no raised timeout (the
remaining time is about 0.1 s); no test skipped.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-503` | `tests/agent.safe3a-owner-shell.test.ts` "approved on the card, the same prod command runs once in the talk worktree" | The stand-in `kubectl` records exactly one call, `get pods`, in the talk worktree and none in the main checkout; `ran.marker` is written; one `mustask` card. Load bench (4 concurrent copies of the file, 5 rounds = 20 file runs each), approved test min/median/max: before the fix with a `kubectl` on PATH that takes 5.5 s (as the CI run that timed out) 0 of 20 passed, every run timed out at 5001-5010 ms with `killed 1 dangling process`, the CI failure; with one that takes 2.5 s (the CI median) 20 of 20 at 2616/2652/2673 ms. After the fix: 5.5 s kubectl 20 of 20 at 123/167/214 ms, 2.5 s kubectl 20 of 20 at 136/158/196 ms, no kubectl 20 of 20 at 119/150/184 ms (before: 114/158/240 ms), no load 20 of 20 at 101/105/112 ms (before: 85/98/110 ms); with the full suite running alongside the 4 copies and a 5.5 s kubectl on PATH, 20 of 20 at 148/196/304 ms (the suite alongside: 3198 pass, 0 fail). |
| `REQ-agent-503` | `tests/agent.safe3a-owner-shell.test.ts` "the owner's shell-exec of a prod command still raises the must-ask Approve card; a deny runs nothing" | With the same stand-in first on PATH, a deny records no `kubectl` call and no `ran.marker`; one `mustask` destructive card. |
| `REQ-agent-503` | the whole file and full `bun test` | All 9 tests of the file pass (93 expect calls); PATH is restored after each test, so later tests see the host PATH. Full suite passes. |

## Where these lessons go

- `specs/agent/context.md`
