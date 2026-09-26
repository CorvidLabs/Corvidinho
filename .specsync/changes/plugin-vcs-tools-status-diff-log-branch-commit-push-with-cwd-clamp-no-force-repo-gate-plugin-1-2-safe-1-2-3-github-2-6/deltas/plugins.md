---
module: plugins
change: plugin-vcs-tools-status-diff-log-branch-commit-push-with-cwd-clamp-no-force-repo-gate-plugin-1-2-safe-1-2-3-github-2-6
---

# Delta — plugins (git tools #82)

## Added

### REQUIREMENT REQ-plugins-182

The system SHALL register typed git plugins (PLUGIN-1) from `plugins/git/`
via builtins. Reads `git-status` (porcelain v1 `-z --branch
--untracked-files=all` parsed to JSON: branch, upstream, ahead/behind,
per-entry index/worktree codes, staged / unstaged / untracked / conflicted
lists; untracked files in a new directory are listed individually so they can
be passed to `git-commit`), `git-diff` (worktree, or index with
`--staged`; byte-capped with a `truncated` flag), `git-log` (last N commits,
oneline; default 10, max 100) and `git-branch-list` SHALL declare
`dangerous: false`, `minTier: 0`. Mutators `git-branch-create`, `git-commit`
and `git-push` SHALL declare `dangerous: true`, `minTier: 2` (code) so SAFE-1
denies them non-interactively unless allowlisted (PLUGIN-2).

Every git invocation SHALL use `Bun.spawn` with an argv array (no shell),
stdin closed, `GIT_TERMINAL_PROMPT=0`, repo-locating env (`GIT_DIR`,
`GIT_WORK_TREE`, `GIT_INDEX_FILE`, …) stripped, hooks disabled, and cwd
clamped to the plugin cwd: `GIT_CEILING_DIRECTORIES` stops discovery above
it and the cwd SHALL be the repository / worktree top level (SAFE-3). Unknown
flags SHALL be refused; path args SHALL resolve inside the plugin cwd with the
files-plugin clamp (escapes and symlink escapes refused) and be passed after
`--` as literal pathspecs.

`git-commit` SHALL require a message and stage explicit file paths only
(no directories, no `--all`, no `--amend`), SHALL refuse staging the deletion
of SAFE-2 protected paths (`isProtectedPath`) and any `.env*`, keystore or
`.git` path, SHALL commit only the named paths, and SHALL report the
committed paths as `filesChanged`. `git-branch-create` SHALL validate the name
and never reset an existing branch; when it switches it SHALL NOT overwrite
ignored local files such as `.env*` or keystores (`--no-overwrite-ignore`;
SAFE-2) and SHALL refuse (exit 2) instead, leaving HEAD and the files
unchanged. `git-push` SHALL push only the current
branch to the same-named ref on a configured remote (default `origin`), SHALL
never force (force / force-with-lease / delete / mirror / tags / `+` or `:`
refspec args refused), SHALL require every push URL's OWNER/REPO to pass
`checkRepoGate` (GITHUB-6; allowlist file + env, deny wins), SHALL take
credentials only from env / the credential helper, and SHALL redact URL
credentials and secret-looking tokens from its output.

Acceptance Criteria
- `plugins list` includes git-status, git-diff, git-log, git-branch-list (dangerous=false, minTier 0) and git-branch-create, git-commit, git-push (dangerous=true, minTier 2).
- Mutators are denied non-interactively without an allowlist entry (exit 2).
- git-status JSON reports branch, staged, unstaged and untracked entries from a temp repo, listing each new file in a new directory (which git-commit then accepts); git-diff worktree vs --staged differ and a small --max-bytes truncates.
- git-log returns N oneline commits; git-branch-list marks the current branch; git-branch-create creates and switches, refusing an existing name and option-like names; `--from` a start point that tracks an ignored local .env / keystore is refused (exit 2) and the local files and HEAD are unchanged.
- git-commit without a message or with only a directory is refused; it commits only named paths, reports filesChanged, refuses path escapes, .env, and staging a deleted protected path.
- A plugin cwd that is a subdirectory of a repository (not the top level) is refused; unknown flags are refused.
- Hooks in `.git/hooks` or a repo-local `core.hooksPath` never run on git-commit / git-push; git-status and git-commit work at the top level of a linked worktree (`.git` is a file).
- git-push to a local bare remote is refused when OWNER/REPO is not allowlisted or is denied (exit 3) and succeeds when allowlisted; force/refspec args are refused (exit 2); a non-fast-forward push is rejected without force and the remote ref is unchanged; detached HEAD is refused.
