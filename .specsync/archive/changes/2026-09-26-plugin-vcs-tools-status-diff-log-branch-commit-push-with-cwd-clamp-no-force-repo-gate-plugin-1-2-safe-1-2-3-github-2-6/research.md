---
change: plugin-vcs-tools-status-diff-log-branch-commit-push-with-cwd-clamp-no-force-repo-gate-plugin-1-2-safe-1-2-3-github-2-6
artifact: research
---

# Research

- Issue #82 "steal from" Merlin `plugins/fledge-plugin-git` (typed git
  commands with mutators marked dangerous) and corvid-agent
  `skills/git/SKILL.md` / `server/lib/worktree.ts` (branch-per-task). Merlin
  is not reachable from this session, so shapes follow the in-repo
  files/search plugins (#81) and GitHub plugins instead.
- `git status --porcelain=v1 -z --branch`: paths are repo-root relative; a
  rename/copy record is followed by its source path as the next NUL field.
  Header forms: `## No commits yet on <b>`, `## HEAD (no branch)`,
  `## <b>...<up> [ahead N, behind M]`, `[gone]`.
- `GIT_CEILING_DIRECTORIES=<parent>` means only the cwd itself is examined
  for a repository (the ceiling is never entered).
- `git commit --only -- <paths>` commits the working-tree state of the named
  paths and ignores other staged entries; deleted tracked paths match via the
  HEAD overlay after `git add` stages the removal.
- `git remote get-url --push --all` expands `insteadOf` / `pushInsteadOf`.
- `git push --porcelain` flags: ` ` fast-forward, `*` new, `=` up to date,
  `!` rejected, `+` forced, `-` deleted.
