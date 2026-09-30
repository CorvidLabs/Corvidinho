---
module: cli
change: a-cli-task-run-in-a-git-repo-works-in-its-own-worktree-by-default-here-runs-it-in-my-checkout-session-worktree-1-a
---

# Delta: cli (a local task run in a git repo works in its own worktree; --here runs it in the checkout — SESSION-WORKTREE-1.a)

## Added

### REQUIREMENT REQ-cli-122

A CLI task run in a git repo works in its own worktree by default; --here
runs it in my current checkout (SESSION-WORKTREE-1.a, captured in
`hi/session.md` from Leif's 2026-09-28 interview, round 9; parent
SESSION-WORKTREE-1). `corvidinho task run` SHALL choose where it works with
`enterCliTaskWorkspace` (`src/worktree/cli-run.ts`) before it reads the
project's config or calls a model:

- **In place** when `--here` is given; when the start directory is not in a
  git work tree (`isGitRepo`; AGENT-1.a: the project folder itself); and in a
  child a product surface spawned, which already runs in the cwd its parent
  chose and SHALL never make a nested worktree, even from a parent that does
  not pass `--here` (`isSpawnedTaskChild`: a role session —
  `CORVIDINHO_ACTING_IS_ADMIN` present, as every Discord chat, `/session`,
  `/work`, schedule and WATCH spawn sets it — a non-empty
  `CORVIDINHO_WATCH_SESSION_ID` or `CORVIDINHO_DISCORD_SESSION_ID`, or a
  delegation depth above 0).
- **Otherwise in its own new linked worktree**, made by `ensureTalkWorkspace`
  (plain `git worktree add -b` from `HEAD`) from the repo's top level, the
  realpath of `git rev-parse --show-toplevel` (never the start directory's
  parent), with its defaults: under `WORKTREE_BASE_DIR`, else
  `dirname(repoTop)/.corvid-worktrees`; id `talk-cli_<uuid prefix>-<digest>`
  and branch `talk/cli_…` from a fresh `cli_<random uuid>` talk id. The run
  SHALL work (and `process.chdir`) in the same subdirectory relative to the
  repo top that it was started in. Nothing SHALL be copied into it (the
  checkout's uncommitted edits and untracked files, a local `.env`,
  `node_modules`) and nothing SHALL be installed there; the env is still the
  one the process started with. Its first event SHALL be the start line
  `Working in a new worktree <dir> (branch <branch>) made from HEAD:
  uncommitted and untracked files in this checkout are not included and
  nothing is installed there. Pass --here to run in this checkout.` (a
  `Text` event: stderr in text mode, a `Text` frame in ndjson, in `events`
  for `--json`).

`--here` SHALL be read only from `task run`'s own arguments before the first
`--` (`parseTaskHere` over `rest` after `task run`, which never holds the
`--task` value), so `--task --here`, `--task=--here` or `-- --here` never turn
it on, and it is no global flag of any other command.

The worktree SHALL fail closed: when it cannot be made (an unborn `HEAD` —
refused before `git worktree add`, which would otherwise make an empty orphan
worktree —, a git error, an unusable base dir) or the start subdirectory is
missing in it (untracked, ignored or uncommitted), the run SHALL call no
model, remove what it made (the worktree, and its branch when that has no
commits of its own), and exit 1 through `reportCliError` with one scrubbed
line (`task run could not make its worktree: <git's fatal line>` / `task
run's worktree has no <subdir>: …`) and the hint `pass --here to run in this
checkout` (`--json`: `{ ok: false, error }` on stdout); it SHALL never fall
back to the checkout. SIGINT / SIGTERM are hooked before the worktree is
made (REQ-cli-244): a signal before or while it is made SHALL give exit 130
with `corvidinho: cancelled while making the task worktree`, no model call
and nothing left behind.

When the run ends (done, failed, blocked or cancelled, or the run throws),
the process SHALL `chdir` back and `finishCliTaskWorkspace` SHALL remove the
worktree only when `git status --porcelain` there is empty, and delete its
branch only when it has no commits of its own (`parkWorktree` /
`branchHasOwnCommits`); a worktree with uncommitted changes, or one git
cannot read, SHALL be kept with its branch, never force-removed. What is kept
SHALL be named on stderr in text mode (`Kept worktree <dir> (branch <b>): it
has uncommitted changes.` / `Removed worktree <dir>; kept branch <b>: it has
commits of its own.`) and, for every run that used its own worktree, on the
optional additive `TaskResult.workspace` `{ dir, branch, kept, branchKept }`
(`--json` and the NDJSON `result` frame; `CORVIDINHO_PROTOCOL_VERSION`
unchanged). A run in place has no `workspace`. No new env var, config key,
table or schema change.

Acceptance Criteria
- `parseTaskHere` is true for `--here` among `task run`'s args and false after `--`, for `--here=1`, and for `--task --here` / `--task=--here` read through `parseGlobalFlags`.
- In-process, a start directory reached through a symlink into `repo/sub` gets a worktree under `<repo parent>/.corvid-worktrees` named `talk-cli_<12 hex>-<16 hex>` on branch `talk/<same>`, works in its `sub`, and has neither the checkout's uncommitted edit nor its untracked file; `WORKTREE_BASE_DIR` moves the base; finishing it clean removes the worktree and the branch.
- `--here`, a non-git dir and each child env (`CORVIDINHO_ACTING_IS_ADMIN` 0 or 1, a WATCH or Discord session id, delegation depth 1) stay in place and make nothing; an empty depth is not a child.
- An untracked start subdir and an unborn HEAD fail closed with no worktree or branch left; an aborted signal before creation is `cancelled` and makes nothing.
- Uncommitted changes keep the worktree and branch (`kept: true, branchKept: true`, the stderr note); a clean worktree with a commit is removed and its branch kept (`kept: false, branchKept: true`).
- The real CLI in `repo/sub` with a fake model that writes `note.txt`: `--json` exit 0, `state` `done`, the note is in the worktree's `sub`, the checkout is unchanged (only its own untracked file), the first event is the start line, `result.workspace` names the kept worktree; text mode prints the start line and the kept line on stderr.
- `--here` writes the note in the checkout, has no `workspace`, and makes no worktree, branch or base dir.
- A run that changes nothing (`--task --here` and `-- --here`, ndjson) ends `done` with `workspace.kept` and `branchKept` false and nothing left.
- An old-bridge child (`CORVIDINHO_ACTING_IS_ADMIN=0`, no `--here`) makes no worktree.
- An untracked start subdir, a file as `WORKTREE_BASE_DIR` (`--json`: the error object and the hint on stderr) and an unborn HEAD exit 1 with the `pass --here` hint and no model call.
- SIGINT while `git worktree add` runs exits 130 with the cancelled line, no model call, and no worktree or branch left.
