---
module: agent
change: always-verify-issue-85-agent-4-agent-4-a-fledge-2-discord-and-watch-spawns-stop-passing-no-verify-so-chat-slash
---

# Delta — agent (always verify, issue #85)

## Added

### REQUIREMENT REQ-agent-085

`runTask` SHALL decide whether a run changed anything from both the
tool-reported `filesChanged` and the real worktree: it SHALL fingerprint the
worktree containing `cwd` before the first execute (HEAD, `git status
--porcelain` including untracked files, and a content fingerprint of each
listed path) and, after each execute, SHALL treat any path whose status or
content differs, that vanished, or that changed between the two HEADs as a
change. Any change SHALL trigger the verify lane when the gate is on; the
worktree probe SHALL only add a reason to verify and SHALL never skip a
verification a tool report asked for. When `cwd` is not in a worktree, git is
missing, or the probe fails, the tool report alone SHALL decide. The probe
SHALL ignore `GIT_DIR` / `GIT_WORK_TREE` / `GIT_INDEX_FILE` from the parent env
and SHALL NOT take `index.lock`. Every non-cancelled `TaskResult.summary` SHALL
carry exactly one fixed plain verification line, never built from model or
lane output (AGENT-4): leading `Verified: …` when the lane passed, leading
`Verification FAILED: the project verify lane did not pass after N retries — not
done.` when retries are exhausted, leading `NOT verified: …` when the gate is
off and the run changed files, and trailing `No files changed — nothing to
verify.` when nothing changed. `describeFailedRun` SHALL return
`failed (exit N)` plus the FAILED line rebuilt from the template when a failed
run's summary carries it.

Acceptance Criteria
- Temp repo: a file written without any `filesChanged` report runs the verify lane and the summary leads with `Verified:`.
- Already-dirty file edited again, committed work (clean status, moved HEAD), and a subdirectory cwd are all detected.
- Clean chat run: no verify call; summary ends with `No files changed — nothing to verify.`
- Exhausted retries lead with the FAILED line and keep the lane output; gate off with a change leads with `NOT verified:`.
- Non-worktree cwd, failing git runner, or throwing probe fall back to tool reports.
- `GIT_DIR` set in the parent env does not redirect the probe.
- `describeFailedRun` rebuilds the FAILED line and ignores near-miss text.

## Modified

### REQUIREMENT REQ-agent-002

When `verify_before_complete` is enabled and the run changed files — the
execute step reports files changed, or the real worktree changed since the run
began (REQ-agent-085) — completion SHALL run `fledge lanes run verify
--non-interactive`. Pass → `verified=true`. Fail with retries remaining →
re-enter executing with verifier output. Exhausted retries → terminal failure
with `verified=false` (AGENT-4 / AGENT-4.a / FLEDGE-2).

Acceptance Criteria
- Mock verify fail then pass within max_retries yields `verified=true` and a second execute call that receives feedback.
- Exhausted retries yield `verified=false` and failed state.
- Default runner invokes fledge with `lanes run verify --non-interactive`.
- A worktree delta with no tool-reported `filesChanged` still runs the verify lane.

### REQUIREMENT REQ-agent-003

`--no-verify` or config `verify_before_complete=false` SHALL skip the gate
(`verify_skipped=true`); this is an operator-only escape hatch — Discord and
WATCH spawns SHALL NOT pass `--no-verify`. A skipped run that changed files
SHALL lead its summary with the plain `NOT verified: …` line so it never reads
as a verified done (AGENT-4). Cancellation via AbortSignal SHALL abort promptly
(AGENT-3).

Acceptance Criteria
- Skip path never calls verify runner; `verified=false`, `verify_skipped=true`.
- Skip path with a change leads the summary with `NOT verified:`.
- Aborted signal during/before verify returns `cancelled=true`.
