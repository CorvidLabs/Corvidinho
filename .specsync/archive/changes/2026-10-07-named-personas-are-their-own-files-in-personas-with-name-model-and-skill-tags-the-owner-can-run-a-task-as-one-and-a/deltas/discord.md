---
module: discord
change: named-personas-are-their-own-files-in-personas-with-name-model-and-skill-tags-the-owner-can-run-a-task-as-one-and-a
---

# Delta: discord (/session start persona option, owner only — AUTONOMOUS-2, AUTONOMOUS-5.a)

## Added

### REQUIREMENT REQ-discord-225

`/session start` SHALL have an optional STRING option `persona` (after
`topic` and `project`; no new command name) to run that session's start run
as a named persona (AUTONOMOUS-2 / AUTONOMOUS-5.a, REQ-agent-225). After the
SAFE-13 topic check and before any session, worktree or run, the handler
SHALL refuse a non-empty `persona` with one ephemeral line and start
nothing: `PERSONA_OWNER_ONLY_LINE` when the actor's role is not owner (team
members and the community can't pick personas); for the owner, the
`findPersona` line for an unknown persona or refused file, or the
`personaModelRefusal` line when its model is not configured (scrubbed),
reading `personas/` from Corvidinho's checkout (`SlashContext.personaRoot` is
a test seam). Otherwise the run SHALL get `persona: <name>`, the progress
status SHALL show the persona's model, and the answer head SHALL add
`Persona: <name>`. The pick covers that run only; later replies in the
session run in `persona.md`'s voice. `createSpawnAgentClient` SHALL pass
`AgentRunChatOpts.persona` as `task run --persona <name>` before `--task`
(REQ-cli-225 re-checks the owner), and nothing when unset.

Acceptance Criteria
- `buildSlashCommandBodies()`: `/session start` options are `topic`, `project`, `persona`, the last an optional STRING (`tests/discord.session-persona.test.ts`).
- A team member and a community user with `persona` get exactly `PERSONA_OWNER_ONLY_LINE` ephemerally; no run, no session.
- The owner with an unknown persona or one with an unconfigured model gets that one line ephemerally; no run, no session.
- The owner's pick reaches `runChat` as the persona name and the answer says `Persona: reviewer`; without one, `persona` is unset and there is no such line.
- The spawn client's argv carries `--persona reviewer` before `--task` when set and no `--persona` otherwise.
- Fails on main's sources and passes on the branch.
