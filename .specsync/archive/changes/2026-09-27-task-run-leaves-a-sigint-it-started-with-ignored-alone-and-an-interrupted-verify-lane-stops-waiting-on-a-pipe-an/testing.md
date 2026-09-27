---
change: task-run-leaves-a-sigint-it-started-with-ignored-alone-and-an-interrupted-verify-lane-stops-waiting-on-a-pipe-an
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-244` | `tests/agent.cli.test.ts` | "SIGINT the run started with ignored (a background job) stays ignored; SIGTERM still cancels". `task run --task demo --output ndjson` runs under `sh -c 'trap "" INT; exec "$@"'` with a fake `fledge` that blocks. 1 s after a SIGINT the run has no exit code or signal and the fake fledge is alive; a SIGTERM then exits 130, the last frame is a `result` with `cancelled: true`, and the fake fledge is gone. On the PR head before this change the SIGINT cancelled the run (`exitCode` 130). |
| `REQ-cli-244` | `tests/agent.cli.test.ts` | Existing "SIGINT during verify: …" and "SIGTERM during verify: …" still pass (signals not started ignored are still hooked). |
| `REQ-agent-244` | `tests/agent.cli.test.ts` | "a lane process that escaped the tree kill and holds the output pipe does not keep the run from exiting". The fake `fledge` starts `(setsid sh -c '…; exec sleep 30' &)` (own session, reparented, holding the lane's stdout) and blocks. SIGTERM exits 130 in under 8 s with a cancelled `result` frame and the fake fledge gone. On the PR head before this change the run was "still running" 10 s after SIGTERM. |
| `REQ-agent-244` | `tests/agent.loop.test.ts`, `tests/agent.execute.test.ts` | The PR's abort-during-verify and LLM timeout tests still pass. |

Full suite: `bun test`, `bunx tsc --noEmit`, `specsync check --require-coverage 100`
and `fledge lanes run verify --non-interactive`.
