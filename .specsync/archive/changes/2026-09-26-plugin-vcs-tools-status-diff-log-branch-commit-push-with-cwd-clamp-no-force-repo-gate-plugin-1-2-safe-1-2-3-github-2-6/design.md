---
change: plugin-vcs-tools-status-diff-log-branch-commit-push-with-cwd-clamp-no-force-repo-gate-plugin-1-2-safe-1-2-3-github-2-6
artifact: design
---

# Design

In-process Bun plugins under `plugins/git/` (same host as files/search):

- `exec.ts` — `runGit(root, argv)` spawns `git -c core.hooksPath=/dev/null
  …` with `Bun.spawn` (argv array, no shell), `stdin: "ignore"`, a timeout,
  and an optional stdout byte cap that stops reading and kills the process.
  `gitEnv` copies the process env minus repo-locating / external-diff vars
  and sets `GIT_TERMINAL_PROMPT=0`, `GCM_INTERACTIVE=never`,
  `GIT_EDITOR=true`, `GIT_LITERAL_PATHSPECS=1`, `GIT_OPTIONAL_LOCKS=0` and
  `GIT_CEILING_DIRECTORIES=<parent of cwd>` so discovery cannot climb above
  the plugin cwd. `gitRoot(cwd)` requires `rev-parse --show-toplevel` to equal
  the realpath of the cwd. `scrubGitOutput` redacts URL userinfo and reuses
  SAFE-6 `scrubSecrets`.
- `parse.ts` — pure parsers: porcelain v1 `-z --branch`, `diff --name-status
  -z`, `push --porcelain`, and `repoSlugFromRemoteUrl` (https / ssh / scp-like
  / file / local path → last two path segments, `.git` stripped).
- `commands.ts` — seven commands with a strict flag parser (unknown flags
  refused, `--` ends options). Path args go through `resolveProjectPath` for
  the escape check and are passed lexically after `--`.
- Hooks are disabled for every git run: an agent-written hook file must not
  turn a commit/push into host code execution (SAFE-3); verification stays in
  the fledge verify lane.
- `git-commit`: `git add -- <paths>` then `git commit --only -m <msg> --
  <paths>` so unrelated staged entries are not swept in. Ignored paths are
  pre-checked with `check-ignore` so nothing is half-staged.
- `git-push`: `git push --porcelain --set-upstream --no-follow-tags
  --recurse-submodules=no <remote> refs/heads/<b>:refs/heads/<b>`. Remote must
  be a configured remote name (never a URL). Every `get-url --push --all` URL
  is gated through `checkRepoGate(slug, loadAllowlist())` (file + env, deny
  wins).
- Registered via `loadGitPlugins` in `src/plugins/builtins.ts`.
