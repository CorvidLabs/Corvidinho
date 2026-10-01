---
module: plugins
change: an-idle-timeout-and-a-turn-cap-i-set-stop-stalled-or-endless-runs-and-it-says-so-agent-12
---

# Delta: plugins (tool process output counts as the run's activity for the idle timeout — AGENT-12)

## Added

### REQUIREMENT REQ-plugins-125

AGENT-12: `spawnCapped` (`plugins/fledge/spawn.ts`, the bounded spawn of the
shell, the language runners and Fledge commands) SHALL count each non-empty
chunk its child writes on stdout or stderr — also past the byte cap — as
the calling run's activity (`noteIdleActivity`, REQ-agent-244), so a tool
that keeps printing is never stopped by the idle timeout and a tool that
prints nothing for that long is. Outside a run it does nothing; the cap,
timeout, abort and process-tree kill are unchanged (REQ-plugins-154).

Acceptance Criteria
- Inside a run with a 500 ms idle timeout, a `spawnCapped` child that prints every 0.1 s for 1.5 s exits 0 without the watchdog firing; a child that sleeps 1.2 s silently lets it fire.
- Fixture: `tests/agent.limits.test.ts`.
