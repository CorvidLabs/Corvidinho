---
change: harden-child-process-lifetimes-and-fledge-scoping-issue-112-follow-up-to-154-157-167-fledge-plugin-argv-after-own
artifact: docs
---

# Docs

- Module docs updated in `plugins/fledge/{commands,spawn,index}.ts`,
  `src/autonomous/delegate.ts`, `src/discord/agent-client.ts`,
  `src/daemon/daemon.ts`; new module doc in `src/plugins/proc-group.ts`.
- `specs/plugins/plugins.spec.md`: files, Public API, invariants, error cases,
  `/proc` dependency. `specs/discord/discord.spec.md`: abandoned runs are
  killed through `AgentRunChatOpts.signal`.
- No README / CHANGELOG / STATUS / package version change (release PRs own
  those). `docs/DAEMON.md` needs no change (systemd `KillMode` default still
  cleans the cgroup; the daemon now also kills stragglers itself).
