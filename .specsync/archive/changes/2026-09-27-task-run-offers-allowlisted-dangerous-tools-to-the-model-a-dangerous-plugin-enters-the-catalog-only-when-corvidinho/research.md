---
change: task-run-offers-allowlisted-dangerous-tools-to-the-model-a-dangerous-plugin-enters-the-catalog-only-when-corvidinho
artifact: research
---

# Research

- Only reads of `includeDangerous` on main: src/agent/tools.ts and
  src/agent/execute.ts; no product caller sets it (src/cli.ts:504,
  src/discord/agent-client.ts and src/watch/agent-client.ts spawn `task run`).
- Dangerous builtins (`plugins list --json`): web-fetch, danger-ping,
  discord-post-message, github-issue-create / -comment, github-pr-create /
  -review, memory-forget / -override (minTier 1); files-delete, git-commit,
  git-push, git-branch-create, shell-exec, node/python/cargo-exec (minTier 2);
  every `fledge-*` command (minTier 2 native, 1 wasm without exec). Every
  dangerous plugin is mutating (`isMutatingPlugin`), so ROLES-CHAT-2 already
  keeps all of them from non-ADMIN sessions.
- Acting env: Discord spawns set `CORVIDINHO_ACTING_IS_ADMIN` to 1 only for
  the owner; WATCH sets 0; the scheduler passes `actingIsAdmin: false`;
  council voices 0 with an empty allowlist; a delegate worker of a role
  session 0, of a local run none (local CLI = ADMIN).
- SAFE-4 holds for model-called memory-forget / -override: phase 2 checks the
  token against `CORVIDINHO_ACTING_CONFIRM_TOKENS`, which the bridge fills
  only from the human's own message.
- Files reported by tools: files-write / -edit / -delete, git-commit,
  delegate / council. Not reported: shell-exec, the runners, Fledge commands
  (plugins/fledge/commands.ts returns stdout). In a git work tree the real
  diff (REQ-agent-085) covers them; in a non-git project nothing did.
