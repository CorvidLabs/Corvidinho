---
change: task-run-reads-the-project-s-own-agents-md-and-claude-md-from-the-project-root-into-the-llm-system-prompt-as-labelled
artifact: research
---

# Research

- `src/agent/execute.ts` built two fixed system prompts (read tier and tool
  loop) with no project input; `cwd` was already passed in from `task run`.
- Discord and WATCH spawn `task run` with the session worktree as `cwd`
  (`src/discord/agent-client.ts`, `src/watch/agent-client.ts`), so the
  loader covers bridge runs with no bridge change.
- Merlin `system_prompt.rs` / `conventions.rs` put project instruction
  files into the prompt; corvid-agent missed its own repo rules (ca#1424).
- Common layout: `CLAUDE.md` is a symlink to `AGENTS.md` (this repo's
  `hi/CLAUDE.md`), hence the duplicate handling.
