---
change: owner-chat-session-start-and-work-may-use-the-allowlisted-shell-runners-and-fledge-runs-only-in-that-talk-s-own
artifact: requirements
---

# Requirements

- SAFE-3.a (captured on main, Leif 2026-09-28 interview, round 2): "The model
  may use the shell, the language runners and Fledge lane/task runs only in
  my own interactive runs (chat, /session start, /work, local CLI), only when
  I allowlist them, and only inside that talk's own worktree; non-owners,
  WATCH and schedules never get them." This change builds the Discord
  surfaces (chat, /session start, /work and their ask answers); the local
  CLI half is later. Nothing new captured.
- Kept (must not regress): SAFE-3 (clamp), SAFE-21 (foot-gun refusals),
  SAFE-21.a (the shell and runners start without GitHub / git credentials),
  SAFE-1 (allowlist), SAFE-5 (audit), AUTONOMY-9 (prod asks on a card),
  IDENTITY-9..12 (roles re-resolved in the tool layer), AGENT-4 /
  REQ-agent-502 (unreported edits verify).
- Added: REQ-agent-503 (the gate), REQ-discord-735 (the Discord and
  scheduler surface stamp), REQ-watch-735 (the WATCH stamp).
- Modified: REQ-agent-501 (`SAFE3A_TOOLS` offered only with the grant),
  REQ-agent-502 (the renamed set, the granted shell names itself).
- One internal env key, `CORVIDINHO_ACTING_SURFACE`, always overwritten by
  the spawning client and dropped for workers and the verify lane; no config
  key, flag, slash option, table or schema version.
