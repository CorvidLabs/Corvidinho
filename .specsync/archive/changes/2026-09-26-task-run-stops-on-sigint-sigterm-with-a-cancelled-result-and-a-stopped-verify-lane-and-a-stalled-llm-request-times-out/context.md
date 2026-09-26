---
change: task-run-stops-on-sigint-sigterm-with-a-cancelled-result-and-a-stopped-verify-lane-and-a-stalled-llm-request-times-out
artifact: context
---

# Context

A bug sweep (agent-loop-4) found that `corvidinho task run` never connected
an AbortSignal. `taskRun` in `src/cli.ts` called `runTask` without `signal`,
so `runTask` used `new AbortController().signal`, which never fires. The
cancelled path, exit 130 and the verify runner's `signal` were dead code in
the CLI. Two failures followed:

- (a) SIGINT or SIGTERM from a supervisor, a user or a parent during verify
  killed corvidinho through Bun's default handler. No cancelled result, no
  exit 130 and no ndjson `result` frame were produced. The spawned
  `fledge lanes run verify` ran to completion in the background (AGENT-3:
  "when I interrupt it, it actually stops instead of finishing in the
  background").
- (b) `chatCompletions` in `src/agent/execute.ts` had no timeout. A provider
  that accepted the request and then stalled (headers, then a byte every few
  seconds) hung `task run` forever, and with it the Discord / watch / daemon
  runs and delegate workers waiting on that child.

Repro before the fix, on this branch's base (2ff0598):

- (a) Fake `fledge` on PATH that starts a lane task and blocks.
  `task run --task demo --output ndjson`, then SIGINT to the pid. The process
  died by the signal (`signalCode "SIGINT"`, SIGTERM gave 143), stdout had no
  `result` frame, and the fake lane kept running.
- (b) Local server that sends headers and then trickles a space every 50ms.
  The read-tier and tool-tier execute never returned; the regression tests
  hit bun's 5s test timeout.

While fixing (a), passing the signal alone was not enough. Bun's `signal`
spawn option SIGTERMs only `fledge`. A probe with the real fledge 1.8.0 (a
lane task `sleep 37`) showed that fledge dies on SIGTERM and leaves its lane
task running as an orphan. The verify runner therefore uses the process-group
helper from #185 (REQ-plugins-154), as Fledge plugin runs, delegate workers
and bridge-spawned agents already do.

Constraints: no new env vars, flags or slash commands. No package, CHANGELOG
or STATUS edits. The NDJSON protocol and the `TaskResult` shape stay the same.
