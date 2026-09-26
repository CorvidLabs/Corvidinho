---
change: always-verify-issue-85-agent-4-agent-4-a-fledge-2-discord-and-watch-spawns-stop-passing-no-verify-so-chat-slash
artifact: testing
---

# Testing

`tests/agent.verify-gate.test.ts` (temp repos under the OS tmpdir; no network):

- Probe: non-worktree → null; clean → `[]`; untracked + tracked edit listed;
  already-dirty file edited again listed; committed work (clean status, HEAD
  moved) listed; subdirectory cwd resolves to root-relative paths; `GIT_DIR`
  in the parent env does not redirect the probe; porcelain `-z` rename parse;
  failing runner → null.
- `runTask`: unreported edit in a real temp repo runs the lane and leads with
  `Verified:` (+ `Worktree changed` Text event); clean chat skips the lane and
  ends with the no-change note; tool report verifies even when the probe sees
  nothing; probe delta alone triggers verify and retries get the lane output
  (AGENT-4.a); exhausted retries lead with the FAILED line and keep lane output;
  gate off + change leads with `NOT verified:`; throwing probe falls back.
- `verify-report`: each note; `describeFailedRun` rebuilds the FAILED line and
  ignores near-miss text.
- Bridges: fake bin records argv — Discord and WATCH argv are
  `task run --task <prompt> --output ndjson` with no `--no-verify`.
- Scheduler: failed fake agent run posts `failed (exit 1)` + the FAILED line.

Updated: `tests/agent.ndjson-spawn.test.ts` and `tests/spawn.argv.test.ts`
argv expectations; `tests/agent.cli.test.ts` asserts the `NOT verified:` lead
for `task run --no-verify --json` (demo stub reports a change).

Commands: `bunx tsc --noEmit`, `bun test`, `specsync check --require-coverage
100`, `fledge lanes run verify --non-interactive`.
