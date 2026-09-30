---
change: a-cli-task-run-in-a-git-repo-works-in-its-own-worktree-by-default-here-runs-it-in-my-checkout-session-worktree-1-a
artifact: testing
---

# Testing

Temp git repos under the test run's temp root only (never this checkout), a
localhost fake model (`startFakeLlm`, a scripted `files-write` turn), a fake
`fledge` whose verify lane prints a passing `bun test` summary, a `git`
wrapper that pauses in `worktree add` for the signal case, and fake
`corvidinho` sh bins that record their argv. Every test removes the
worktrees and branches it made; the real repo's `git worktree list` and
`git branch --list 'talk/cli_*'` show no `talk-cli_*` worktree and no
`talk/cli_*` branch before and after the full suite.

Fail-on-base proof: with the base's (9ea4005) six modified sources swapped in
(`src/cli.ts`, `src/agent/types.ts`, `src/agent/shell-gate.ts`,
`src/discord/agent-client.ts`, `src/watch/agent-client.ts`,
`src/autonomous/delegate.ts`; the new `src/worktree/cli-run.ts` kept so
imports resolve), `bun test tests/cli.task-worktree.test.ts
tests/autonomous.council.test.ts tests/autonomous.delegate.test.ts
tests/agent.ndjson-spawn.test.ts tests/agent.safe3a-gate.test.ts
tests/agent.safe3a-owner-shell.test.ts` gave 73 pass, 7 fail
(`cli.task-worktree` cannot load: no `parseTaskHere`; the delegate, council,
Discord and WATCH argv cases and both SAFE-3.a reason cases fail). With that
import stubbed so the file loads, `tests/cli.task-worktree.test.ts` gave 10
pass, 8 fail on the base: every real-CLI worktree case (edit in the worktree,
text-mode lines, clean-run cleanup and the `--here`-as-text cases, fail-closed
exits, SIGINT during creation), the flag parse and both spawner argv cases;
the 10 that pass are the in-process units of the new module and the
`--here` / old-bridge-child cases, which run in place on the base too.
Restored: 18 of 18 pass, and the six files above 80 of 80.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-122` | `tests/cli.task-worktree.test.ts` ("--here is read only …") | `--here` counts only among `task run`'s args before `--`; never `--task --here`, `--task=--here`, `-- --here` or `--here=1`. |
| `REQ-cli-122` | `tests/cli.task-worktree.test.ts` ("enterCliTaskWorkspace …") | Worktree from the realpath repo top (start dir via a symlink) under `<repo parent>/.corvid-worktrees` (or `WORKTREE_BASE_DIR`), `talk-cli_<12 hex>-<16 hex>` on `talk/<same>`, same subdir, no uncommitted edit or untracked file; `--here`, non-git and every child env stay in place; untracked subdir and unborn HEAD fail closed with nothing left; an aborted signal is cancelled and makes nothing. |
| `REQ-cli-122` | `tests/cli.task-worktree.test.ts` ("finishCliTaskWorkspace …") | Uncommitted changes keep the worktree and branch with the stderr note; a clean worktree with a commit is removed, its branch kept; a clean one without is removed with its branch. |
| `REQ-cli-122` | `tests/cli.task-worktree.test.ts` ("task run CLI in a git repo …") | The real CLI's edit lands in the worktree, the checkout is unchanged, the first event is the start line, `result.workspace` names the kept worktree (`--json`) and text mode prints the start and kept lines; `--here` edits the checkout and makes nothing; a no-change run leaves nothing; an old-bridge child makes nothing; untracked subdir, a file as base dir and an unborn HEAD exit 1 with the `pass --here` hint and no model call; SIGINT during `worktree add` exits 130 with nothing left. |
| `REQ-discord-014`, `REQ-discord-073` | `tests/agent.ndjson-spawn.test.ts` (Discord), `tests/cli.task-worktree.test.ts` ("Discord and WATCH clients …") | Argv is exactly `task run --here --task <prompt> --output ndjson`. |
| `REQ-watch-006`, `REQ-watch-073` | `tests/agent.ndjson-spawn.test.ts` (WATCH), `tests/cli.task-worktree.test.ts` ("Discord and WATCH clients …") | Argv is exactly `task run --here --task <prompt> --output ndjson`. |
| `REQ-agent-117` | `tests/cli.task-worktree.test.ts` ("delegate and council workers …") | `buildDelegateSpawn` argv is `task run --here --non-interactive --tier <t> --output ndjson --task <text>`. |
| `REQ-plugins-117` | `tests/autonomous.delegate.test.ts` ("runs one worker …") | The worker's argv has `--here` right after `task run`. |
| `REQ-plugins-118` | `tests/autonomous.council.test.ts` ("voices are delegated …") | Every voice's argv has `--here` right after `task run`. |
| `REQ-agent-503` | `tests/agent.safe3a-gate.test.ts`, `tests/agent.safe3a-owner-shell.test.ts` | A run with no role session is refused with `a local CLI run has no role session (the CLI half of SAFE-3.a is not built yet)`. |
