---
module: watch
change: a-cli-task-run-in-a-git-repo-works-in-its-own-worktree-by-default-here-runs-it-in-my-checkout-session-worktree-1-a
---

# Delta: watch (the WATCH spawn client passes --here — SESSION-WORKTREE-1.a)

## Modified

### REQUIREMENT REQ-watch-006

WATCH `createSpawnAgentClient` SHALL spawn via `buildCorvidinhoArgv` so a
`.ts` corvidinho bin is always invoked with `bun` (never posix_spawn alone).
Spawns SHALL pass `--here` right after `task run`, so the run works in the
watcher's cwd and never makes a worktree of its own (REQ-cli-122).
Spawns SHALL NOT pass `--no-verify` (the flag is removed and refused,
REQ-cli-085) — prove-before-done (AGENT-4 / FLEDGE-2 / AGENT-14) always
applies to ingress runs; a run whose real diff is empty and that claimed no
change ends with "no changes, nothing to verify" inside the agent loop
(REQ-agent-003 / REQ-agent-085). Fixture tests SHALL cover argv shape.

Acceptance Criteria
- `.ts` → bun-prefixed argv; binary path unchanged when not `.ts`.
- Spawn argv is `task run --here --task <prompt> --output ndjson` with **no** `--no-verify`.
- No ProcessManager; allowlists unchanged.

### REQUIREMENT REQ-watch-073

The WATCH spawn agent client SHALL run
`task run --here --task <prompt> --output ndjson` (`--here`, REQ-cli-122), read stdout line by
line, forward live state / current tool / token totals to an optional
`onStatus` callback (AGENT-8), and take the summary from the stream's `result`
frame, falling back to `summarizeTaskRunOutput` when no result frame parses.
No new GitHub-visible surface is added.

Acceptance Criteria
- Fake-bin fixture printing ndjson drives the WATCH `onStatus` and returns the result-frame summary.
- Missing result frame falls back to `summarizeTaskRunOutput`.
- Spawn argv ends with `--output ndjson` (no `--json`) and has no `--no-verify`.
- Spawn argv is exactly `task run --here --task <prompt> --output ndjson` (REQ-cli-122).
