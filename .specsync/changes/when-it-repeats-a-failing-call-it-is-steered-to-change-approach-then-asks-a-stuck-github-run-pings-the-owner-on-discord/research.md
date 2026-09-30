---
change: when-it-repeats-a-failing-call-it-is-steered-to-change-approach-then-asks-a-stuck-github-run-pings-the-owner-on-discord
artifact: research
---

# Research

- Sources: issue #86 (body; no comments), Leif's interview record
  `/home/user/coord/interview-2026-09-28.md` (round 2: AGENT-16 as written;
  round 13: WATCH stuck asks ping the owner on Discord, needs the bridge
  running), the M3/M4 slice record (`/home/user/coord/m34-scope-all.json`,
  key `loop-guards`, split PR a) and the conservative defaults
  (`/home/user/coord/m34-defaults.md`, slice loop-guards).
- Every surface reaches the tool loop through `task run` (src/cli.ts →
  `createTaskExecute` → `runTask`): Discord chat and resumes, `/session`,
  `/work`, schedules, WATCH, and delegate / council workers (child
  `task run` processes). So one guard in `runToolLoop` covers all of them,
  workers included.
- `runToolLoop` rebuilds `messages` per attempt, so a verify retry is a
  fresh conversation; closure state (`roleRefused`, `injection`) is the
  existing pattern for run-wide state.
- `isMutatingPlugin` is `dangerous || mutating`: it also covers
  `web-fetch`, `danger-ping`, `fledge-lanes-run` (dangerous) and
  `council` (mutating, advice only), none of which changes what a failing
  call depends on; hence an explicit classification with a test over the
  registry.
- A stuck ask is already handled on every Discord surface
  (`formatAskReply`, owner ping, AUTONOMY-2/4), in schedules (AUTONOMY-6.a)
  and `/work` (no PR). On WATCH, `buildSummaryBody` carries the summary
  (`Needs your input: …`) only for ackable events after a successful ack,
  and the spawn client dropped `result.ask`.
- Cross-process precedents on the shared DB: GitHub forget asks
  (`forget_requests`, DMed by the bridge's tick), daemon schedule asks
  (`schedule_runs` ask columns, posted by the bridge's tick), backup owner
  notices (`schema_meta`, compare-and-delete claim, hand-back on stop), and
  module-owned tables created on first use without a schema bump
  (`watch_event_ids`, `discord_session_turns`, `spend_ledger`). There is
  no bridge-liveness marker; schedule runner ids (`<pid>:<proc start>`,
  `isScheduleRunnerAlive`) give a crash-safe liveness check to reuse.
- The gateway's `sendDm` (used by the forget card and private replies)
  parses no mentions; a DM notifies the recipient by itself.
