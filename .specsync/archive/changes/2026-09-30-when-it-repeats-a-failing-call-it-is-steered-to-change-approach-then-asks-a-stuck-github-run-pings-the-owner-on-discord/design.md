---
change: when-it-repeats-a-failing-call-it-is-steered-to-change-approach-then-asks-a-stuck-github-run-pings-the-owner-on-discord
artifact: design
---

# Design

- **Pure module** `src/agent/loop-guards.ts`: `callSignature` (JSON of the
  name and `argvFromToolArguments`), `changedState` (the one "something
  changed" predicate: `filesChanged` reported ok or not, or a successful
  `STATE_CHANGING_TOOLS` / Fledge plugin command; `NO_STATE_CHANGE_TOOLS`
  lists the dangerous or mutating builtins that are not changes, so a test
  can require every such builtin to be classified), the steer / ask text and
  `createRepeatFailureGuard`. Not `isMutatingPlugin`: it also flags
  `web-fetch`, `danger-ping`, `fledge-lanes-run` and `council`.
- **Guard state.** Failure counts live in the `createTaskExecute` closure
  (like `roleRefused` / `injection`), so they last across verify-retry
  attempts. Which signatures were steered, and in which round, is per
  conversation (`newConversation()` at each `runToolLoop`). `before(sig,
  round)` says "ask" only when the call has `STEER_AFTER_FAILURES`+ failures
  and its steer went out in an earlier round of this conversation; so an
  identical call in the same batch, or the first identical call of a fresh
  verify-retry conversation, runs and gets the steer again. A change clears
  everything; a call's own success clears its own count.
- **Dispatch wiring** (execute.ts): after the `ask-human` interception,
  `before` → "ask" returns `askExecuteResult(repeatedFailureAsk(eventName))`
  with one `ToolResult` and one operator Text line (scrubbed excerpt). After
  each result, `after` counts it; on `steer` the harness text is appended to
  the finished tool message, after any fence or SAFE-13 note. The ask names
  `eventName` (offered name or `(unknown tool)`), never error text.
- **Surfaces.** Every surface already runs `task run` and handles a
  `stuck` ask: Discord pings the owner with the Answer button, schedules
  block later ticks, `/work` opens no PR, the CLI prints it, a worker's
  blocked result is `ok:false` to its lead (whose guard counts it).
- **WATCH → Discord (AGENT-16.a).** The watch process and the bridge are
  separate processes sharing one data dir (as for GitHub forget asks). The
  WATCH spawn client now returns `ask`. After each finished run the poller
  calls `noteWatchRunAsk`: a stuck ask with an owner Discord id and a DB is
  upserted into `watch_owner_asks` (one per thread, scrubbed, SCRUB_TARGETS),
  anything else drops the thread's row. The log line says "queued" when a
  live bridge marked itself (`markBridgeRunning`: `<pid>:<proc start>` in
  `schema_meta`, checked with `isScheduleRunnerAlive`), else that the
  Discord ping could not be sent (no bridge; no owner id; no DB). The bridge's
  scheduler `onTick` runs `createWatchAskDelivery().deliver()` next to the
  forget cards: compare-and-delete claim, owner DM with
  `formatWatchStuckAskDm` (the `formatAskReply` stuck post, no mention, led
  by the thread link), hand-back plus a 10-minute wait on failure, give-up
  after a day, stop/settle hand-back on shutdown (the backup-notice pattern).
  DM, not a channel: a WATCH run has no Discord channel, and the question may
  come from a private repo.
- **Alternatives rejected.** A schema v14 table (other PRs bump the schema;
  module-owned tables are the precedent), `schema_meta` rows for asks (no
  structure, not scrub-targetable), posting to the `/announce` channel
  (public; AUTONOMY-10 round 13 makes channel posts ask first), and WATCH
  calling Discord REST itself (a second Discord client; Leif said it needs
  the bridge running).
