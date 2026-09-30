---
module: watch
change: owner-chat-session-start-and-work-may-use-the-allowlisted-shell-runners-and-fledge-runs-only-in-that-talk-s-own
---

# Delta: watch (WATCH runs stamp the watch surface, SAFE-3.a)

## Added

### REQUIREMENT REQ-watch-735

The WATCH spawn client SHALL always set `CORVIDINHO_ACTING_SURFACE=watch`
(overwriting any inherited value), so a WATCH run is never offered the
shell, the language runners or the Fledge core runs (SAFE-3.a,
REQ-agent-503), whatever the allowlist says; the agent's shell gate also
refuses any run whose env carries `CORVIDINHO_WATCH_SESSION_ID`. WATCH runs
stay non-ADMIN with no Discord actor (REQ-watch-008). No env var, config key
or flag is added.

Acceptance Criteria
- `tests/discord.safe3a-surface.test.ts` ("Discord: the caller's surface, else empty; WATCH: always watch"): the WATCH client's child sees `CORVIDINHO_ACTING_SURFACE=watch` even with `chat` in the watcher's env.
- `tests/agent.safe3a-gate.test.ts`: the owner's stamp in the own worktree with `CORVIDINHO_WATCH_SESSION_ID` set is refused ("WATCH runs never get them"), and a `watch` stamp is refused.
- With the base's `src/watch/agent-client.ts` the first test fails; it passes on the branch.
