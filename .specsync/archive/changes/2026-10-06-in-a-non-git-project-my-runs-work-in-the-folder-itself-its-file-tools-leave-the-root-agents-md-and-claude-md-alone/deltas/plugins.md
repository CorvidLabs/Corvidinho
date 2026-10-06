---
module: plugins
change: in-a-non-git-project-my-runs-work-in-the-folder-itself-its-file-tools-leave-the-root-agents-md-and-claude-md-alone
---

# Delta: plugins (a non-git folder's root AGENTS.md / CLAUDE.md are not changed by the file tools; other people's runs only read there — AGENT-1.b, AGENT-1.a)

## Added

### REQUIREMENT REQ-plugins-110

In a project folder that isn't a git repo, its file tools can't change the
root AGENTS.md or CLAUDE.md; the owner edits those (AGENT-1.b, captured in
this change's PR from Leif's 2026-09-30 decision, round 13 of the 2026-09-28
record). There the AGENT-1 loader reads those files from disk into every
run's prompt (REQ-agent-084), so a file tool that could change them could
plant instructions for later runs.

- When `isGitRepo(cwd)` is false, `files-write`, `files-edit` and
  `files-delete` SHALL refuse (exit 2, `refused (AGENT-1.b): …`, nothing
  written) a path that, where the write would land (`resolveProjectPath`),
  is equal to or under `<realRoot(cwd)>/AGENTS.md` or `/CLAUDE.md`
  (`PROJECT_INSTRUCTION_FILES`), or equal to or under the file a symlink of
  that name leads to, or a regular file that shares the inode of one of them
  (a hard link); `isNonGitRootInstructionPath` in
  `plugins/files/protectedPaths.ts`, checked in `refuseProtected` after the
  SAFE-2 and SpecSync-record rules.
- It SHALL apply to every caller (the owner's runs, the local CLI, `plugins
  run`), with no override. Creating a missing root file is a change too.
- A nested `AGENTS.md` (not at the root), other files, reads, and a git
  project's root copy (where only the committed copy is loaded) SHALL be
  unchanged.

Acceptance Criteria
- `tests/plugins.nongit-project-dir.test.ts`: in a non-git folder, `files-write` of `AGENTS.md`, `./CLAUDE.md`, the absolute root path and `AGENTS.md/inner.md`, and `files-edit` / `files-delete` of both, are refused with `refused (AGENT-1.b)` for the local CLI and the owner, and the files stay as they were.
- Same file: a missing `CLAUDE.md` is not created; with `CLAUDE.md` a symlink to `docs/rules.md`, writing `docs/rules.md` is refused; writing a hard link to `AGENTS.md` is refused; `notes.txt`, `src/app.ts`, `sub/AGENTS.md` and `docs/other.md` are written.
- Same file: in a git project `files-write AGENTS.md` still works.
- With the base sources the refusals fail; the git-project case passes on both.

### REQUIREMENT REQ-plugins-115

Other people's runs only read in a project folder that isn't a git repo
(AGENT-1.a, captured in `hi/agent.md` from Leif's 2026-09-28 interview).
`actingWorkTask(env, cwd)` SHALL be true only when the run carries the
`/work` stamp (`CORVIDINHO_ACTING_WORK_TASK`) and `isGitRepo(cwd)`; `cwd`
is required. `runPlugin` SHALL pass the call's cwd (`opts.cwd`, else the
process cwd), and the agent's catalog and invented-call refusal SHALL pass the
run's cwd (REQ-agent-110), so in a non-git folder a team member's `/work`
run gets the role refusal (`not allowed for your role`, exit 2) for
`files-write`, `files-edit` and the SpecSync change tools, while reads and
review tools are unchanged and in a git worktree the work tools are kept
(IDENTITY-10). The owner and community are unchanged.

Acceptance Criteria
- `tests/plugins.nongit-project-dir.test.ts`: `actingWorkTask` is true for a git repo with the stamp and false for a non-git folder or without the stamp.
- Same file: a team member's `/work` `files-write` / `files-edit` in a non-git folder get the role refusal and the file is unchanged, `files-read` works; in a git repo the write works; the owner's write in the folder works.
- `tests/roles.team.test.ts` (fixture dir now a git repo) keeps team `/work` edits working in a git work tree.
