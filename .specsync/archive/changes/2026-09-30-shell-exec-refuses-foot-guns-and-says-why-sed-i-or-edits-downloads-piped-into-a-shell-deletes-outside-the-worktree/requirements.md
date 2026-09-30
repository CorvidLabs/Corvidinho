---
change: shell-exec-refuses-foot-guns-and-says-why-sed-i-or-edits-downloads-piped-into-a-shell-deletes-outside-the-worktree
artifact: requirements
---

# Requirements

Captured HI met (no criteria invented beyond the confirmed text):

- **SAFE-21** (hi/safe.md, captured on main from the 2026-09-28 interview,
  round 3): "The shell refuses foot-guns (sed -i or > edits, piping
  downloads into a shell, deleting outside the worktree, reading secrets)
  and says why." → `firstFootgun` refuses four families before spawn, each
  with `shell-exec refused (SAFE-21): <why>; <what to do instead>`
  (REQ-plugins-494).
- **SAFE-21.a** (captured in this change with `hi` from round 13): "The
  shell and language runners start without my GitHub or git credentials, so
  pushes, PRs and merges only happen through the checked GitHub tools." →
  `runnerChildEnv` / `withoutGitCredentials` for `shell-exec` and the
  node / python / cargo runners, plus the SAFE-21 secret family refusing
  commands that would point git or gh back at credentials (REQ-plugins-495,
  REQ-plugins-494).
- **SAFE-3** (captured): "Shell commands cannot `cd` their way out of the
  project root to run elsewhere on my machine." → `env -C` / `--chdir` /
  `sudo -D` checked like `cd`, symlink-aware `cd` / `pushd` / `env -C`
  targets, `ln` targets that lead out refused, unreadable wrapper strings
  refused (REQ-plugins-495).
- **SAFE-6**: shell output is secret-scrubbed.
- **AGENT-3 / AGENT-12** (existing): the shell now stops with the calling
  run's abort and a timeout, like the runners.

Canonical requirements (see deltas): **REQ-plugins-494** (Added: SAFE-21
families, reasons, script coverage), **REQ-plugins-495** (Added: SAFE-21.a
credential-free env for the shell and runners, bounded and scrubbed shell
spawn, `env -C` / symlink / `ln` clamp checks), **REQ-plugins-087**
(Modified: the clamp runs after SAFE-21; end-to-end wording),
**REQ-plugins-313** (Modified: the runners' env is credential-free and
shared with `shell-exec`), **REQ-agent-085** (Modified: the shell-edit
fixture writes through `tee`, since SAFE-21 refuses `>`).

Conservative defaults used where the captured text leaves a design question
(listed as pending Leif in the PR): what counts as a secret (isSecretPath
plus the host credential stores and Corvidinho's config dir, credential env
vars, `gh auth token`, `git credential`, the ssh family); every output
redirection to a file refused, not only edits of project files; interpreters
reading a download from standard input count as "a shell"; `mv` destinations
and forced `ln` destinations count as deletes; `git worktree prune` always
refused.
