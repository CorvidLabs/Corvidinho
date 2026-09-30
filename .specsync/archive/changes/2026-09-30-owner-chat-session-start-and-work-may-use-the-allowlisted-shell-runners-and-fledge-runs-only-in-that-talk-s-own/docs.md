---
change: owner-chat-session-start-and-work-may-use-the-allowlisted-shell-runners-and-fledge-runs-only-in-that-talk-s-own
artifact: docs
---

# Docs

- `docs/DISCORD-GO-LIVE.md` (E.3): the three tool rows (`fledge-lanes-run` /
  `fledge-run`, `shell-exec`, the runners) and the intro say the model gets
  them only in the owner's own chat, `/session start`, `/work` or ask
  answer, inside that talk's own worktree, at code tier; the "What an entry
  unlocks" bullet lists every condition (code tier via
  `CORVIDINHO_LLM_TIER=code`), the operator line, the gates a granted call
  still passes and the known limits; E.6 names the internal
  `CORVIDINHO_ACTING_SURFACE` stamp next to the other acting keys.
- `docs/discord.md`: a Roles bullet (the shell is the owner's alone) and the
  code map entry for `src/agent/shell-gate.ts`.
- `STATUS.md`: the tool-loop "remaining gaps" line (SAFE-3.a Discord half;
  the local CLI still waits for a per-run worktree).
- Specs: `agent.spec.md` (files, Public API, scenario, error rows),
  `discord.spec.md` (files, stamp), `watch.spec.md` (WATCH stamp), each
  module's `testing.md`.
- No CHANGELOG / package.json edit (the release PR writes them).
