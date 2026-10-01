---
change: my-local-cli-task-run-may-use-the-allowlisted-shell-and-runners-inside-its-own-worktree-safe-3-a-local-cli-half
artifact: context
---

# Context

Tracked under #83 (SAFE-3 / PLUGIN-1 shell; the M3 "Real dev teammate"
milestone), slice safe3a-cli of the M3/M4 plan
(`/home/user/coord/pr-safe3a-cli.json`). SAFE-3.a is already captured on
main in `hi/safe.md` from Leif's 2026-09-28 interview ("The model may use the
shell, the language runners and Fledge lane/task runs only in my own
interactive runs (chat, /session start, /work, local CLI), only when I
allowlist them, and only inside that talk's own worktree; non-owners, WATCH
and schedules never get them."). Nothing new is captured in this change.

What was missing on main (b84c75f): #324 built the Discord half
(`shellToolsGate`, REQ-agent-503) and refused every run with no role
session, because a local `task run` had no worktree of its own; #338
(SESSION-WORKTREE-1.a, REQ-cli-122) then gave `task run` its own linked
worktree by default, but the gate still refused it with `a local CLI run has
no role session (the CLI half of SAFE-3.a is not built yet)`. So "local CLI"
in SAFE-3.a was not met.

Constraints: specs only through SpecSync; no new env var, flag or config key
(none is needed: the worktree is an in-process value); v1 off-chain;
#232/#233 scope untouched; the parallel must-ask-public (Discord post paths)
and repo-ways-3 (loop.ts gate set, `src/work/pr.ts`, plugins/files) builds
are not touched (`src/plugins/must-ask.ts` is unchanged). Related captured
ids kept: SAFE-21 / SAFE-21.a (the shell and runners start without
credentials, unchanged), SESSION-WORKTREE-1.a. Where SAFE-3.a leaves a
question open, the conservative defaults in
`/home/user/coord/m34-defaults.md` (safe3a-shell rows) are used and listed in
the PR under "Design choices pending Leif".
