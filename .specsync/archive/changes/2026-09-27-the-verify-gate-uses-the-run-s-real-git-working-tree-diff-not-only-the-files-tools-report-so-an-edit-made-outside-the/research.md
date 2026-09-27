---
change: the-verify-gate-uses-the-run-s-real-git-working-tree-diff-not-only-the-files-tools-report-so-an-edit-made-outside-the
artifact: research
---

# Research

- Writers that do not report `filesChanged`: `shell-exec`
  (plugins/shell/commands.ts returns command / cwd / exitCode / output),
  Fledge plugin commands, and anything a delegate worker or an external
  process does in the same checkout. Reporters: files-write, files-edit,
  files-delete, git-commit, delegate / council (worker-reported lists).
- Existing read-only git helpers: `runGit` (plugins/git/exec.ts: argv, no
  shell, hooks off, repo-locating env stripped, `GIT_CEILING_DIRECTORIES`
  clamp, `GIT_OPTIONAL_LOCKS=0`, stdout cap) and `parseStatusPorcelainZ`
  (plugins/git/parse.ts), already reused by src/work/pr.ts. Project-root
  discovery: `findProjectRoot` (src/agent/project-instructions.ts, nearest
  `.git` at or above the cwd), which also turns fsmonitor off.
- `git status --porcelain=v1` paths are always relative to the repository
  root; `--untracked-files=all` lists files inside new directories;
  `--no-renames` keeps one entry per path. A file already ` M` keeps that
  status when edited again, so status alone cannot see the edit: a content
  fingerprint is needed. Linux file timestamps are coarse (jiffy), so a
  stat-only fingerprint can miss a same-size edit right after the snapshot;
  content is hashed (SHA-256) up to 4 MiB.
- `git rev-parse --verify -q HEAD` exits 1 on an unborn HEAD and 128
  outside a repository. The empty tree id comes from
  `git hash-object -t tree /dev/null` (no `-w`), which works for SHA-1 and
  SHA-256 repositories.
- Existing loop tests run with cwd `/tmp` (no `.git` at or above), so
  they keep the tool-reported-only path; tests that use the repo checkout as
  cwd already report files.
