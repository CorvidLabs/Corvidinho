---
change: hear-slash-commands-for-session-status-agents-work-discord-4-steal-from-corvid-agent-thin-useful-set-fixture-tests-no
artifact: requirements
---

# Requirements

## DISCORD-4 slash commands (thin)

- Bridge SHALL register and dispatch `/session`, `/status`, `/agents`, `/work`.
- `/session list` SHALL report active SessionStore stubs; `/session start` with
  required `topic` SHALL create a session stub and drive AgentClient (no
  ProcessManager / no Discord thread product UI).
- `/status` SHALL report version, uptime, active session count, work-task counts,
  allowlisted channel count, protocol version.
- `/agents` SHALL list the local Corvidinho agent identity (single-runner thin).
- `/work` with required `description` SHALL create an in-memory work stub and
  drive AgentClient (agent ops, not token product).
- Slash handlers SHALL re-check the channel allowlist at run time (DISCORD-5 /
  DISCORD-7 light). Non-allowlisted → not authorized; no session/work created.
- SHALL NOT weaken allowlists, introduce ProcessManager, or require a live
  Discord token for tests. Secrets stay out of the repo.
