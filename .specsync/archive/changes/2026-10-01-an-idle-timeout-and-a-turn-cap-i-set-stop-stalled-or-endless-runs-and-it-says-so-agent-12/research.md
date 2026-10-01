---
change: an-idle-timeout-and-a-turn-cap-i-set-stop-stalled-or-endless-runs-and-it-says-so-agent-12
artifact: research
---

# Research

- Sources: issue #80 (body: "an idle timeout, `max_turns` … steal from Merlin
  provider_chain / fallback idle timeout"; comments: the v0.0.36 rollup lists
  AGENT-12 as not met — only the fixed 10-minute per-request timeout and a
  fixed `maxToolRounds ?? 8` per attempt), Leif's interview record
  `/home/user/coord/interview-2026-09-28.md` (round 2: capture AGENT-12),
  the slice entry `/home/user/coord/pr-providers-4.json` and the providers
  rows of `/home/user/coord/m34-defaults.md` (turn cap per attempt, stop
  reason only when the final attempt hit it; `stopped=turn-cap` in the
  footer / thinking plumbing, a plain note only on WATCH and the CLI; default
  idle 10 minutes, verify-lane and tool output reset it).
- Every product run is a `task run` child (Discord spawn client, WATCH spawn
  client, scheduler and daemon through the Discord client, delegate / council
  workers) that inherits the parent's env; the worker env drops only
  `DISCORD_*`, GitHub tokens, the audit key and `CORVIDINHO_ACTING_*`, so the
  two keys reach every run without new plumbing.
- Every Approve-card wait (the spend card #334/#339, the must-ask gate #319,
  the SAFE-18 engine #316) goes through `ApprovalStore.waitForDecision`.
- The shell, the language runners and Fledge commands all spawn through
  `spawnCapped`, which already reads its pipes chunk by chunk; the default
  verify runner read its pipes only after the lane exited.
- Bun 1.4.2 propagates AsyncLocalStorage across awaits, timers and stream
  reads (checked), so the run's watchdog reaches those call sites.
- `Bun.which` resolves with the PATH the process started with, so tests that
  put a fake `fledge` on PATH run the CLI as a child.
