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

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-085` | `tests/agent.verify-gate.test.ts` | Temp-repo probe cases (untracked, dirty-then-edited, committed, subdir, `GIT_DIR` ignored, non-repo, failing runner); unreported edit runs the lane; plain notes for passed / failed / gate-off / no-change; `describeFailedRun` rebuild and near-miss. |
| `REQ-agent-002` | `tests/agent.verify-gate.test.ts`, `tests/agent.loop.test.ts` | Probe delta alone triggers verify and retries with lane output; tool report still verifies; existing retry / exhaustion / argv tests. |
| `REQ-agent-003` | `tests/agent.verify-gate.test.ts`, `tests/agent.loop.test.ts`, `tests/agent.cli.test.ts` | Gate off never calls the runner and leads with `NOT verified:`; abort still cancels. |
| `REQ-cli-006` | `tests/agent.cli.test.ts` | `task run --no-verify --json` exits 0, verify_skipped, summary leads with `NOT verified:`; help lists `--no-verify`. |
| `REQ-cli-007` | `tests/agent.cli.test.ts`, `tests/agent.ndjson-spawn.test.ts` | Help documents task run flags; demo execute path unchanged. |
| `REQ-cli-009` | `tests/agent.verify-gate.test.ts`, `tests/agent.ndjson-spawn.test.ts` | Discord and WATCH fake-bin argv contain no `--no-verify`. |
| `REQ-discord-085` | `tests/agent.verify-gate.test.ts` | Discord fake-bin argv has no `--no-verify`; failed schedule run posts `failed (exit 1)` + the FAILED line. |
| `REQ-discord-001` | `tests/agent.verify-gate.test.ts`, `tests/discord.router.test.ts` | Mention path still starts a session stub; spawn argv without `--no-verify`. |
| `REQ-discord-014` | `tests/spawn.argv.test.ts`, `tests/agent.verify-gate.test.ts` | `.ts` bun-prefixed argv without `--no-verify`; summary parsing unchanged. |
| `REQ-discord-073` | `tests/agent.ndjson-spawn.test.ts` | Discord ndjson spawn argv is `task run --task <prompt> --output ndjson`. |
| `REQ-watch-006` | `tests/agent.verify-gate.test.ts`, `tests/memory.spawn-env.test.ts` | WATCH fake-bin argv has no `--no-verify`; env hygiene unchanged. |
| `REQ-watch-073` | `tests/agent.ndjson-spawn.test.ts` | WATCH ndjson spawn argv is `task run --task <prompt> --output ndjson`. |

Commands: `bunx tsc --noEmit`, `bun test`, `specsync check --require-coverage
100`, `fledge lanes run verify --non-interactive`.
