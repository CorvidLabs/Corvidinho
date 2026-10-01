---
change: my-local-cli-task-run-may-use-the-allowlisted-shell-and-runners-inside-its-own-worktree-safe-3-a-local-cli-half
artifact: requirements
---

# Requirements

- SAFE-3.a (captured, `hi/safe.md`, Leif 2026-09-28): "The model may use the
  shell, the language runners and Fledge lane/task runs only in my own
  interactive runs (chat, /session start, /work, local CLI), only when I
  allowlist them, and only inside that talk's own worktree; non-owners, WATCH
  and schedules never get them." This change builds its local CLI half.
- Kept: SAFE-1 / CLI-3 (the allowlist offers a dangerous tool), AGENT-5 (the
  tier still filters: code tier), SAFE-3 (the clamp), SAFE-21 / SAFE-21.a
  (foot-gun refusals; no GitHub or git credentials in the shell and runners),
  AUTONOMY-9 / SAFE-20 (a prod command waits for the Approve card; no answer
  is a no), SAFE-5 (audit), SESSION-WORKTREE-1.a / REQ-cli-122 (the run's own
  worktree, `--here` in place), DISCORD-SCHEDULE-1.a (schedules never get the
  shell), the #324 stamp semantics (REQ-discord-735 / REQ-watch-735).
- Added: REQ-cli-681 (the local CLI half: `taskRun` passes `talkWorktree`;
  the gate's no-role-session rules; refusal lines; the must-ask lapse).
- Modified: REQ-agent-503 (`shellToolsGate({ env, cwd, talkWorktree? })`, the
  role-session bullet becomes the local CLI half, WATCH / schedule markers
  checked first, the new reasons; acceptance criteria).
- No new env var, config key, flag, slash command, table, schema version or
  protocol version.
