---
change: task-run-stops-on-sigint-sigterm-with-a-cancelled-result-and-a-stopped-verify-lane-and-a-stalled-llm-request-times-out
artifact: research
---

# Research

Checked on Bun 1.4.2 and fledge 1.8.0:

- Aborting a `fetch` signal after the response headers arrived also rejects
  a pending `resp.json()`. With a server that sends headers and then trickles
  bytes, the body read rejected with the abort reason 500ms after the abort
  was scheduled. One combined signal therefore bounds both headers and body.
  `AbortSignal.any` is available.
- `Bun.spawn({ signal })` sends SIGTERM only to the direct child. In a
  scratch project, a `fledge lanes run verify --non-interactive` whose lane
  runs `sleep 37` was sent that SIGTERM. fledge exited 143 at once, and
  `sleep 37` (and its `sh -c`) kept running. Passing the signal alone
  therefore leaves the lane's tasks running in the background. Stopping the
  whole tree needs the process-group helpers (`detached: true` +
  `killProcessTree`, REQ-plugins-154).
- With a `process.once("SIGINT")` listener installed, Bun does not
  terminate on SIGINT. The proc-group hook skips its kill-and-re-raise when
  another listener exists, so the CLI's abort path owns shutdown.
- Before the fix, a child `task run` sent SIGINT during verify reported
  `exitCode 130, signalCode "SIGINT"`: Bun reports 128+n for a signal death.
  The test therefore also asserts `signalCode === null`, which tells a
  handled cancel from a death by signal. SIGTERM gave 143.
