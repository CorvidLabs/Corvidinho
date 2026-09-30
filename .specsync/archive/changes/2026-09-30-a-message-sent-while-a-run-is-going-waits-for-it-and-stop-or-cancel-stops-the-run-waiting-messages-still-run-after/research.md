---
change: a-message-sent-while-a-run-is-going-waits-for-it-and-stop-or-cancel-stops-the-run-waiting-messages-still-run-after
artifact: research
---

# Research

- Sources: issue #122 (tracker; no AGENT-3 issue exists), Leif's interview
  record `/home/user/coord/interview-2026-09-28.md` (round 7 AGENT-3 design
  call, round 13 "Stop and the queue" and "Stop schedule runs"), the slice
  record `/home/user/coord/pr-stop-button-1.json` and the stop-button rows of
  `/home/user/coord/m34-defaults.md`.
- Run paths that start `task run` from Discord: `bridge.ts` `onMessage`
  (chat), `onComponent` (ask pick and Answer form submit),
  `command-handlers/session.ts` (`/session start`) and
  `command-handlers/work.ts` (`/work`). Schedules run through
  `SchedulerService` and stay out of scope.
- `createSpawnAgentClient` already runs the child in its own process group
  and kills the whole tree when `signal` aborts (`killProcessTree`, also the
  members it left as it exited); an aborted run returns (no throw) with no
  result frame and a non-zero exit. Nothing on the Discord side passed a
  signal.
- The must-ask gate records `approval_requests.waiter` as the `task run`
  process (`scheduleRunnerId()`); the card engine closes a pending request
  whose waiter is gone as a no (`orphaned` → `closeAsNo`, status `expired`) on
  its next pass, and a late press is a no too. So killing the tree is enough
  for SAFE-20; a pass right after the stop makes it immediate.
- The router resolved a reply through `getByBotMessage` first; a pick's
  progress message is its tracked Choose stub, and the chat / slash progress
  messages are not tracked at all, so a reply 'stop' to them needs its own
  lookup ahead of the session lookups (and ahead of the thread path, where
  the owner may have a session of their own).
- `SessionStore.forgetTurnsOfUsers` keeps the sessions (it only drops turns),
  so "forgotten while waiting" cannot be read from the session; the bridge's
  `onForgotten` hook is where it is known.
- `WorkStore` statuses are `queued | running | completed | failed | blocked`;
  a new status would touch its loader and `/status` counts.
