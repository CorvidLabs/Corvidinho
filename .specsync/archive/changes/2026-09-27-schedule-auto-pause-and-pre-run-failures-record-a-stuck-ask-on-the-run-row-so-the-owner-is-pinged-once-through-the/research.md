---
change: schedule-auto-pause-and-pre-run-failures-record-a-stuck-ask-on-the-run-row-so-the-owner-is-pinged-once-through-the
artifact: research
---

# Research

- `src/scheduler/service.ts` (main fbaa84b) `maybeAutoPause` (L840-846)
  only calls `store.setStatus(id, "paused")`; `finish()` passes
  `autoPaused` to `onRunFinished`, whose only consumer is
  `src/daemon/daemon.ts` (`run.finished` log field).
- `runOne`: the `project resolve failed` (L544-549) and `worktree failed`
  (L562-567) branches `finish()` and `return` before the post block.
- `resolveProjectDir` / `ensureTalkWorkspace` errors carry absolute host
  paths (`project path not found: X (tried /abs/…, /abs/…)`, `project
  directory missing: /abs`) and run-specific branch names (`talk/schedule_
  <schedule>_<run>` in git's stderr), so posting them would leak paths and
  would never repeat the same ping key.
- `setStatus` clears `ask_ping_key`, so the auto-pause ask always pings
  (a later resume re-arms it again).
- Repro (the new tests on main's scheduler sources, with only the new text
  exports appended): 4 daemon failures + a 5th → schedule paused, run row
  `ask_reason` null, bridge ticks post 0; 5 bridge failures → five silent
  `❌` posts; a missing project (daemon) → 0 posts; a blocked worktree
  (bridge) → 0 posts; stale-cache store handle at the 5th failure stores its
  own ask, not the pause ask.
