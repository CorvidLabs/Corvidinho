# Lesson bundle — plugin-vcs-tools-status-diff-log-branch-commit-push-with-cwd-clamp-no-force-repo-gate-plugin-1-2-safe-1-2-3-github-2-6

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: PLUGIN vcs tools: status diff log branch commit push with cwd clamp, no force, repo gate (PLUGIN-1/2 SAFE-1/2/3 GITHUB-2/6 issue 82)
- **Kind**: Feature
- **Specs**: plugins
- **Paths**: plugins/git/index.ts, plugins/git/commands.ts, plugins/git/exec.ts, plugins/git/parse.ts, src/plugins/builtins.ts, tests/git.plugins.test.ts, specs/plugins/
- **Acceptance**: Typed git plugins registered via builtins (PLUGIN-1): git-status (porcelain v1 parsed to JSON), git-diff (worktree or --staged, size-capped), git-log (N oneline), git-branch-list are dangerous=false minTier 0; git-branch-create, git-commit, git-push are dangerous=true minTier 2 and SAFE-1 denied non-interactive unless allowlisted (PLUGIN-2). Every git run uses argv arrays with cwd clamped to the plugin cwd (repo discovery ceiling, must be the worktree root; path args clamped, symlink escapes refused; SAFE-3), GIT_TERMINAL_PROMPT=0, strict flag parsing (unknown flags refused). git-commit requires a message, stages explicit file paths only, refuses staging deletes of SAFE-2 protected paths and .env*/keystore/.git paths, never amends, reports filesChanged. git-push pushes the current branch only, never force (force/delete/mirror/refspec args refused), requires the remote OWNER/REPO to pass checkRepoGate (GITHUB-6), takes credentials only from env/credential helper and redacts URL credentials. Fixture tests with temp git repos and a local bare remote pass without network or live tokens.

## Evidence

- Verification commit: `c66d101a18903b8e5413dc1a7efb826d8053e75a`
- Base commit: `a49987d653499f40af938f26961c98e017c7777b`
- Verified by: `specsync check --spec plugins`

## From the change's context.md

# Context

Issue #82 (P1, M3 "Real dev teammate", build step 4 of tracker #123): going
from issue to PR needs typed git tools instead of improvised shell. HI
already captures PLUGIN-1 (git is one of the plugin families), PLUGIN-2,
SAFE-1/2/3 and GITHUB-2/6. The issue's only new criterion, SAFE-22 ("never
force-push, rewrite pushed history, or commit straight to a default branch"),
is DRAFT pending Leif — it is not acceptance criteria here. We only avoid
exposing force / amend / rebase; the explicit default-branch policy waits for
HI capture.

Builds on #81 (files/search plugins): reuse `resolveProjectPath` (cwd clamp +
symlink escape refuse) and `isProtectedPath` (SAFE-2). Reuse
`checkRepoGate` (GITHUB-6) from the GitHub plugins for the push remote.
`runPlugin` already audits dangerous runs (SAFE-5) and fails closed.

## From the change's design.md

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

## From the change's testing.md

# Testing

## Local gates

- `bun test` (incl. `tests/git.plugins.test.ts`), `bunx tsc --noEmit`
- `specsync check --require-coverage 100`
- `fledge lanes run verify --non-interactive`

Fixtures: every repo is `git init` inside `mkdtempSync`; the push remote is
a local bare repo at `<tmp>/acme/widget.git`; git config is isolated with
`GIT_CONFIG_GLOBAL` / `GIT_CONFIG_NOSYSTEM`; the repo gate reads
`CORVIDINHO_GITHUB_ALLOW_REPOS` / `DENY_REPOS` and a temp
`CORVIDINHO_ALLOWLIST_FILE`. No network, no live tokens; the only linked
worktree is one `git worktree add` inside the temp base. Hook fixtures touch
marker files under the temp base. Dangerous runs are audited into the
preload-isolated data dir.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-plugins-182 | list markings (dangerous/minTier); non-interactive deny; status/diff/log/branch-list JSON on a temp repo; untracked files in a new directory listed individually and committed; diff cap; branch-create + refusals; branch-create `--from` a commit tracking an ignored `.env` / `keystore.json` refused (exit 2) with local files and HEAD unchanged; commit explicit paths + filesChanged + refusals (message, directory, escape, .env, protected delete, amend); `.git/hooks` and repo-local `core.hooksPath` hooks never run on commit / push (control: plain git runs them); status + commit in a linked worktree; subdirectory cwd refused; push gate deny/allow, force/refspec refusal, non-fast-forward rejected with remote unchanged, detached HEAD refused; parser unit tests incl. credential redaction |

## Where these lessons go

- `specs/plugins/context.md`
