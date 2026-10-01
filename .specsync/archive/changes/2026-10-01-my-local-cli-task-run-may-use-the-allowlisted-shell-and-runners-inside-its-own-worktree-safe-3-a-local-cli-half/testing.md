---
change: my-local-cli-task-run-may-use-the-allowlisted-shell-and-runners-inside-its-own-worktree-safe-3-a-local-cli-half
artifact: testing
---

# Testing

Regression tests (fixtures only: temp git projects under the test run's temp
root and the worktree `enterCliTaskWorkspace` makes there, another talk
worktree from `ensureTalkWorkspace`, an injected fake provider, a localhost
fake model for the spawned CLI, a fake passing `fledge` lane, a stand-in
`kubectl` first on PATH, the real card store with a short TTL; no network,
no tokens; every test removes the worktrees and `talk/*` branches it made).

- `tests/cli.safe3a-shell.test.ts` (11 tests, new).
- Adjusted: `tests/agent.safe3a-gate.test.ts`,
  `tests/agent.safe3a-owner-shell.test.ts` (the local-CLI refusal reason).

Fail-on-base proof: in this branch's worktree, the base's (b84c75f)
`src/agent/shell-gate.ts`, `src/agent/execute.ts` and `src/cli.ts` swapped
in: `tests/cli.safe3a-shell.test.ts` cannot load (`isCliRunWorktree` is not
exported) and the two adjusted cases fail on the old reason (3 failures, 15
pass). With `isCliRunWorktree` stubbed to `false` in the base gate, 10 of the
11 new tests fail (every grant, every new refusal reason, the must-ask lapse
through the granted shell, all three real-CLI cases); the role-session guard
passes on the base too. Restored: all 28 tests in the three files pass.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-681` | `tests/cli.safe3a-shell.test.ts` › "granted: a local run at the top of the worktree it made for itself (through a symlink too)" | `shellToolsGate` grants a run with no role session, session id or stamp whose cwd (or a symlink to it) is `talkWorktree`; `isCliRunWorktree` true for both. |
| `REQ-cli-681` | `tests/cli.safe3a-shell.test.ts` › "refused in place: --here (the checkout) and a non-git folder pass no worktree" | No or blank `talkWorktree` in the checkout, a non-git folder or even the worktree: `a local CLI run gets them only in the new worktree it made for itself, not with --here or outside a git repo`. |
| `REQ-cli-681` | `tests/cli.safe3a-shell.test.ts` › "refused: any cwd but the top of that worktree, and a 'worktree' that is not a linked one" | A subdirectory, the main checkout, another talk's worktree, a non-git folder, a missing dir, a main checkout / non-git folder / look-alike named as the worktree and a missing worktree path: `the run is not at the top of the worktree this CLI run made for itself`; `isCliRunWorktree` false. |
| `REQ-cli-681` | `tests/cli.safe3a-shell.test.ts` › "refused even in its own worktree: delegate workers, WATCH, schedules and a spawned child without a role session" | Depth 1 / 2 / junk, a WATCH marker and a `schedule_` session id keep their reasons; a Discord session id or a `chat` / `watch` / `schedule` / `cli` stamp without a role session is refused as a spawn. |
| `REQ-agent-503` | `tests/cli.safe3a-shell.test.ts` › "a role session never uses the CLI worktree: the owner's chat there is not in its own talk worktree" | The owner's chat env with `talkWorktree` set to the CLI worktree: `the run is not in this talk's own worktree`. |
| `REQ-cli-681` | `tests/cli.safe3a-shell.test.ts` › "offered at code tier and it runs in the run's worktree, not the checkout; no SAFE-3.a line" | `createTaskExecute` with `talkWorktree` offers `shell-exec` and `fledge-run`; the marker is in the worktree, not the checkout; no SAFE-3.a line; `unreportedEditTools` `["shell-exec"]`; attempt 2 still offered. |
| `REQ-cli-681` | `tests/cli.safe3a-shell.test.ts` › "--here, a non-git folder and a subdirectory: not offered, the call is refused, one operator line per run" | Neither tool offered over two attempts; both calls refused as not offered; no marker; exactly one `[operator] SAFE-3.a: shell-exec, fledge-run allowlisted but not offered: <why>` line; none in the summaries. |
| `REQ-cli-681` | `tests/cli.safe3a-shell.test.ts` › "a prod command still raises the must-ask card; with no bridge nobody answers, it lapses (no) and the run says why" | One `mustask` destructive card carrying the command; unanswered, the call fails with `no answer on the owner's Approve card … with no bridge running it lapses`; the stand-in `kubectl` records no call; the wait line says the one-time code and that no answer means no. |
| `REQ-cli-681` | `tests/cli.safe3a-shell.test.ts` › "by default the allowlisted shell is offered and runs in the run's own worktree" | The real CLI: the first model request offers `shell-exec`, it runs, the marker is in the kept worktree and not the checkout, no SAFE-3.a line, exit 0. |
| `REQ-cli-681` | `tests/cli.safe3a-shell.test.ts` › "--here (text output): not offered, one SAFE-3.a line on stderr, nothing runs, no worktree" | Not offered; exactly one SAFE-3.a line on stderr, none on stdout; no marker; no worktree or branch. |
| `REQ-cli-681` | `tests/cli.safe3a-shell.test.ts` › "a non-git folder (--json): not offered, one SAFE-3.a Text event, nothing runs" | Not offered; exactly one SAFE-3.a `Text` event; not in the summary; no `workspace`; no marker. |
| `REQ-agent-503` | `tests/agent.safe3a-gate.test.ts` › "refused: delegate and council workers (depth > 0) and a run with no role session outside its own CLI worktree" | Depth refusals unchanged; no role session with a session id and stamp is refused as a spawn; a plain local run with no worktree gets the in-place reason. |
| `REQ-agent-503` | `tests/agent.safe3a-owner-shell.test.ts` › "WATCH, a schedule, a delegate worker and a local CLI run: refused" | WATCH, schedule and worker unchanged; a local CLI run with no worktree of its own is not offered `shell-exec` and gets the in-place line. |
