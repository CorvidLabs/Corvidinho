---
module: agent
change: in-a-non-git-project-my-runs-work-in-the-folder-itself-its-file-tools-leave-the-root-agents-md-and-claude-md-alone
---

# Delta: agent (the owner's run works in a non-git project folder itself; others only read there — AGENT-1.a)

## Added

### REQUIREMENT REQ-agent-110

In a project that isn't a git repo, the owner's runs work in the project
folder itself, protected files and the verify gate still apply, and other
people's runs only read there (AGENT-1.a, captured in `hi/agent.md` from
Leif's 2026-09-28 interview). A run whose cwd is such a folder (a Discord
talk bound in place, REQ-discord-110, or a local `task run` there) SHALL:

- for the owner (and the local CLI): run its file tools in that folder, with
  SAFE-2 protected paths and (AGENT-1.b, REQ-plugins-110) the root AGENTS.md
  / CLAUDE.md refused; keep the allowlisted shell, language runners and Fledge
  runs out of the catalog with the one SAFE-3.a operator line (the cwd is not
  the session's own talk worktree, REQ-agent-503); and go through the verify
  gate for what it changed (REQ-agent-002 / REQ-agent-185), a failing lane
  failing the run;
- for anyone else: `createTaskExecute` SHALL pass the run's cwd to
  `actingWorkTask` (REQ-plugins-115) both for the catalog
  (`buildOpenAiTools` `workTask`) and for `refusedForRole` (a call to a
  mutating tool not offered), so a team member's `/work` run there is not
  offered `files-write` / `files-edit` and a call to one gets the role
  refusal; in a git worktree it is offered them as before.

No new option, env var or config key.

Acceptance Criteria
- `tests/agent.nongit-project-dir.test.ts`: the owner's run in a non-git folder writes `src/app.ts` there, `fledge.toml` is refused (SAFE-2) and `AGENTS.md` (AGENT-1.b) and stays unchanged, `shell-exec` (allowlisted) is not offered and the SAFE-3.a line names "not in this talk's own worktree", the stub verify lane runs once on the folder and its failure ends the run `failed` and not verified, and no `.corvid-worktrees` is made.
- Same file: a team member's `/work` run there is offered `files-read` but not `files-write` / `files-edit`, its `files-write` call is refused with `not allowed for your role`, the file is unchanged and no verify runs; in a linked worktree of a git project it is offered both.
- With the base sources both fail.
