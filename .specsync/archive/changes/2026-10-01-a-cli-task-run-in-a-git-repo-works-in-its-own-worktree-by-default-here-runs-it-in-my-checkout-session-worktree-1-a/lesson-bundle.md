# Lesson bundle — a-cli-task-run-in-a-git-repo-works-in-its-own-worktree-by-default-here-runs-it-in-my-checkout-session-worktree-1-a

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: A CLI task run in a git repo works in its own worktree by default; --here runs it in my checkout (SESSION-WORKTREE-1.a)
- **Kind**: Feature
- **Specs**: cli, agent, discord, watch, plugins
- **Paths**: README.md, docs/DISCORD-GO-LIVE.md, docs/discord.md, src/agent/shell-gate.ts, src/agent/types.ts, src/autonomous/delegate.ts, src/cli.ts, src/discord/agent-client.ts, src/watch/agent-client.ts, tests/agent.ask.test.ts, tests/agent.cli.test.ts, tests/agent.fallback.test.ts, tests/agent.loop-guards.test.ts, tests/agent.ndjson-spawn.test.ts, tests/agent.persona.test.ts, tests/agent.providers.test.ts, tests/agent.safe3a-gate.test.ts, tests/agent.safe3a-owner-shell.test.ts, tests/agent.spend-ask.test.ts, tests/agent.stall-nudge.test.ts, tests/agent.test-evidence.test.ts, tests/agent.verify-gate.test.ts, tests/autonomous.council.test.ts, tests/autonomous.delegate.test.ts, tests/cli.plugins-run-argv.test.ts, tests/cli.project-path.test.ts, tests/memory.private-view.test.ts, src/worktree/cli-run.ts, tests/cli.task-worktree.test.ts, specs/cli/cli.spec.md, specs/cli/testing.md, specs/agent/agent.spec.md, specs/agent/testing.md, specs/discord/discord.spec.md, specs/discord/testing.md, specs/watch/watch.spec.md, specs/watch/testing.md, specs/plugins/plugins.spec.md, specs/plugins/testing.md
- **Acceptance**: SESSION-WORKTREE-1.a (captured on main from Leif's 2026-09-28 interview, round 9) holds: a local corvidinho task run in a git repo works in its own new linked worktree made from HEAD by ensureTalkWorkspace from the realpath repo top (WORKTREE_BASE_DIR or dirname(repoTop)/.corvid-worktrees, id talk-cli_<uuid prefix>-<digest>, branch talk/cli_...), in the same relative subdirectory; the first event (stderr in text mode, a Text event in --json / ndjson) says it is made from HEAD, that uncommitted and untracked files are not included and nothing is installed there, and that --here runs in this checkout; --here (read only from task run's own args before the first --, never from --task text) runs it in the current checkout; a non-git directory and a child a product surface spawned (role session, WATCH or Discord session, delegate or council worker) stay in place; at run end a clean worktree is removed and its branch deleted only when it has no commits of its own, otherwise what is kept is named on stderr and in the optional additive result.workspace (no protocol bump); a subdir missing in the worktree, an unborn HEAD or any creation failure exits 1 with one scrubbed line and the hint 'pass --here to run in this checkout' and never falls back to the checkout; a SIGINT/SIGTERM while the worktree is made exits 130 and leaves nothing; the Discord, WATCH and delegate/council spawners pass --here; tests/cli.task-worktree.test.ts and the --here assertions in the delegate/council/spawn-client tests fail on the base sources and pass on the branch

## Evidence

- Verification commit: `710d20c6a7316f43dd812ab22f4cd57fca5e7d81`
- Base commit: `9ea40051c5cd6841c201e1210319ee621aa4bde0`
- Verified by: `specsync check --spec agent --spec cli --spec discord --spec plugins --spec watch`

## From the change's context.md

# Context

Tracked under the M2 "Talk anywhere" milestone tracker #122 (slice
cli-worktree of the M3/M4 plan; the SESSION-WORKTREE issue #58 is closed).
Leif decided in the 2026-09-28 interview (round 9) that a CLI `task run` uses
a per-talk worktree by default in a git repo and `--here` opts into the
current checkout; that is captured on main as SESSION-WORKTREE-1.a in
`hi/session.md` ("A CLI task run in a git repo works in its own worktree by
default; --here runs it in my current checkout.", parent SESSION-WORKTREE-1).
Nothing new is captured in this change.

What was wrong on main (9ea4005): `corvidinho task run` always worked in
`process.cwd()`, the user's own checkout, so a local run's edits and branch
state landed in the working tree the user was using, while every Discord,
`/work` and schedule run already had its own worktree (`ensureTalkWorkspace`).

Constraints: specs only through SpecSync; no new env var or config key (the
worktree base is the existing `WORKTREE_BASE_DIR` default); no protocol bump
(the result field is additive); v1 off-chain; #232/#233 scope untouched; the
parallel stop-button-2 and spend-caps-c builds own `bridge.ts` onComponent and
the spend guard, so this change touches the spawn clients' argv only. Where
Leif's text leaves a question open, the conservative defaults in
`/home/user/coord/m34-defaults.md` (cli-worktree rows) are used and listed in
the PR under "Design choices pending Leif".

## From the change's design.md

# Design

- **New module** `src/worktree/cli-run.ts` (owned by the cli spec):
  `enterCliTaskWorkspace({ cwd, here, env, signal })` returns `here`
  (`--here`, `not-git`, `child`) or `worktree` (`cwd`, `dir`, `branch`,
  `repoTop`). Git case: realpath of `git rev-parse --show-toplevel`, the start
  dir's path relative to it, an explicit unborn-HEAD refusal (git ≥ 2.42 would
  otherwise infer `--orphan` and make an empty worktree), then the existing
  `ensureTalkWorkspace({ projectWorkingDir: repoTop, sessionId:
  cli_<uuid> })` — so the base (`WORKTREE_BASE_DIR` or
  `dirname(repoTop)/.corvid-worktrees`), the `talk-<prefix>-<digest>` id,
  `talk/…` branch, stale-state cleanup and the AGENT-15.a verified marker are
  all reused. A missing subdir, a failed create, or an abort discards what was
  made (`removeWorktree` + branch delete only without own commits).
- **Children** (`isSpawnedTaskChild`): `roleSessionActive` (every Discord /
  WATCH spawn sets `CORVIDINHO_ACTING_IS_ADMIN`), a WATCH or Discord session
  id, or delegation depth > 0 stay in place even without `--here` — this
  closes the old-bridge / new-child skew. The spawners also pass `--here`
  (a new bridge with an old child is harmless: the old parser leaves the
  unknown `--here` in `rest`, which `task run` ignores).
- **`--here` parse** (`parseTaskHere`) over `rest.slice(2)` up to the first
  `--`; `parseGlobalFlags` already consumed the `--task` value, so task text
  never reaches it. No global flag.
- **CLI wiring** (`taskRun`): signals are hooked before the worktree is made;
  the start line is a `Text` event (stderr / Text frame / `events`); the body
  moved to `taskRunIn(cwd, …)` with `process.chdir` into the worktree cwd so
  nothing falls back to the checkout; after `runTask` (and before the result
  prints, or in `finally` when the run throws) the process `chdir`s back and
  `finishCliTaskWorkspace` removes a porcelain-clean worktree via
  `parkWorktree` (branch deleted only without own commits) or keeps it; the
  report rides `TaskResult.workspace` and a stderr note.
- **Errors** go through `reportCliError` with `TaskWorkspaceError` (hint
  `CLI_HERE_HINT`, exit 1; cancelled: exit 130).
- **SAFE-3.a**: the gate's local-CLI reason is reworded (it has a worktree
  now, but no role session); the CLI shell half stays later work.

## From the change's testing.md

# Testing

Temp git repos under the test run's temp root only (never this checkout), a
localhost fake model (`startFakeLlm`, a scripted `files-write` turn), a fake
`fledge` whose verify lane prints a passing `bun test` summary, a `git`
wrapper that pauses in `worktree add` for the signal case, and fake
`corvidinho` sh bins that record their argv. Every test removes the
worktrees and branches it made; the real repo's `git worktree list` and
`git branch --list 'talk/cli_*'` show no `talk-cli_*` worktree and no
`talk/cli_*` branch before and after the full suite.

Fail-on-base proof: with the base's (9ea4005) six modified sources swapped in
(`src/cli.ts`, `src/agent/types.ts`, `src/agent/shell-gate.ts`,
`src/discord/agent-client.ts`, `src/watch/agent-client.ts`,
`src/autonomous/delegate.ts`; the new `src/worktree/cli-run.ts` kept so
imports resolve), `bun test tests/cli.task-worktree.test.ts
tests/autonomous.council.test.ts tests/autonomous.delegate.test.ts
tests/agent.ndjson-spawn.test.ts tests/agent.safe3a-gate.test.ts
tests/agent.safe3a-owner-shell.test.ts` gave 73 pass, 7 fail
(`cli.task-worktree` cannot load: no `parseTaskHere`; the delegate, council,
Discord and WATCH argv cases and both SAFE-3.a reason cases fail). With that
import stubbed so the file loads, `tests/cli.task-worktree.test.ts` gave 10
pass, 8 fail on the base: every real-CLI worktree case (edit in the worktree,
text-mode lines, clean-run cleanup and the `--here`-as-text cases, fail-closed
exits, SIGINT during creation), the flag parse and both spawner argv cases;
the 10 that pass are the in-process units of the new module and the
`--here` / old-bridge-child cases, which run in place on the base too.
Restored: 18 of 18 pass, and the six files above 80 of 80.

Review round: seven more cases in `tests/cli.task-worktree.test.ts` (a
failing post-checkout hook, in-process and through the real CLI, leaves
neither the worktree nor the branch `git worktree add` made and reports the
hook's line; SIGINT to the whole process group while a post-checkout hook
waits, as Ctrl-C at a terminal sends it, exits 130 and leaves nothing; a run
that switched its worktree to a branch of its own has that branch named and
kept, a dirty one kept under that name, the talk branch deleted unless it has
commits only on it, and both named when both have them). With the first cut
of `src/worktree/cli-run.ts` (4c20563) swapped in, 6 of them fail (the
talk-branch-only case passes there too); restored, 25 of 25 pass.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-122` | `tests/cli.task-worktree.test.ts` ("--here is read only …") | `--here` counts only among `task run`'s args before `--`; never `--task --here`, `--task=--here`, `-- --here` or `--here=1`. |
| `REQ-cli-122` | `tests/cli.task-worktree.test.ts` ("enterCliTaskWorkspace …") | Worktree from the realpath repo top (start dir via a symlink) under `<repo parent>/.corvid-worktrees` (or `WORKTREE_BASE_DIR`), `talk-cli_<12 hex>-<16 hex>` on `talk/<same>`, same subdir, no uncommitted edit or untracked file; `--here`, non-git and every child env stay in place; untracked subdir and unborn HEAD fail closed with nothing left; an aborted signal is cancelled and makes nothing. |
| `REQ-cli-122` | `tests/cli.task-worktree.test.ts` ("finishCliTaskWorkspace …") | Uncommitted changes keep the worktree and branch with the stderr note; a clean worktree with a commit is removed, its branch kept; a clean one without is removed with its branch; a branch the run made and switched to is the one named (kept with commits or when dirty) and the talk branch goes unless it has commits only on it, then it is named too. |
| `REQ-cli-122` | `tests/cli.task-worktree.test.ts` ("a failing post-checkout hook …", "a failed git worktree add …") | A `git worktree add` that fails after making the branch and worktree (a failing post-checkout hook) exits 1 with the hook's line and the `pass --here` hint, calls no model and leaves neither behind. |
| `REQ-cli-122` | `tests/cli.task-worktree.test.ts` ("Ctrl-C at a terminal …") | SIGINT to the whole process group while a post-checkout hook waits exits 130 with the cancelled line, calls no model and leaves neither the worktree nor the branch. |
| `REQ-cli-122` | `tests/cli.task-worktree.test.ts` ("task run CLI in a git repo …") | The real CLI's edit lands in the worktree, the checkout is unchanged, the first event is the start line, `result.workspace` names the kept worktree (`--json`) and text mode prints the start and kept lines; `--here` edits the checkout and makes nothing; a no-change run leaves nothing; an old-bridge child makes nothing; untracked subdir, a file as base dir and an unborn HEAD exit 1 with the `pass --here` hint and no model call; SIGINT during `worktree add` exits 130 with nothing left. |
| `REQ-discord-014`, `REQ-discord-073` | `tests/agent.ndjson-spawn.test.ts` (Discord), `tests/cli.task-worktree.test.ts` ("Discord and WATCH clients …") | Argv is exactly `task run --here --task <prompt> --output ndjson`. |
| `REQ-watch-006`, `REQ-watch-073` | `tests/agent.ndjson-spawn.test.ts` (WATCH), `tests/cli.task-worktree.test.ts` ("Discord and WATCH clients …") | Argv is exactly `task run --here --task <prompt> --output ndjson`. |
| `REQ-agent-117` | `tests/cli.task-worktree.test.ts` ("delegate and council workers …") | `buildDelegateSpawn` argv is `task run --here --non-interactive --tier <t> --output ndjson --task <text>`. |
| `REQ-plugins-117` | `tests/autonomous.delegate.test.ts` ("runs one worker …") | The worker's argv has `--here` right after `task run`. |
| `REQ-plugins-118` | `tests/autonomous.council.test.ts` ("voices are delegated …") | Every voice's argv has `--here` right after `task run`. |
| `REQ-agent-503` | `tests/agent.safe3a-gate.test.ts`, `tests/agent.safe3a-owner-shell.test.ts` | A run with no role session is refused with `a local CLI run has no role session (the CLI half of SAFE-3.a is not built yet)`. |

## Where these lessons go

- `specs/cli/context.md`
- `specs/agent/context.md`
- `specs/discord/context.md`
- `specs/watch/context.md`
- `specs/plugins/context.md`
