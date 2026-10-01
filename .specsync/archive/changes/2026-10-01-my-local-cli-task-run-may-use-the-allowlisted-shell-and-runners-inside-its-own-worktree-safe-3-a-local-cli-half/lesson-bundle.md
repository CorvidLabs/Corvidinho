# Lesson bundle — my-local-cli-task-run-may-use-the-allowlisted-shell-and-runners-inside-its-own-worktree-safe-3-a-local-cli-half

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: My local CLI task run may use the allowlisted shell and runners inside its own worktree (SAFE-3.a, local CLI half)
- **Kind**: Feature
- **Specs**: cli, agent
- **Paths**: src/agent/shell-gate.ts, src/agent/execute.ts, src/agent/tools.ts, src/cli.ts, tests/cli.safe3a-shell.test.ts, tests/agent.safe3a-gate.test.ts, tests/agent.safe3a-owner-shell.test.ts, specs/agent/agent.spec.md, specs/agent/testing.md, specs/cli/cli.spec.md, specs/cli/testing.md, docs/DISCORD-GO-LIVE.md, docs/discord.md, README.md, STATUS.md
- **Acceptance**: SAFE-3.a (captured on main from Leif's 2026-09-28 interview; local CLI half, #83) holds: a local corvidinho task run that made its own linked worktree (SESSION-WORKTREE-1.a, REQ-cli-122) and has no role session is offered the allowlisted shell-exec, node-exec, python-exec, cargo-exec, fledge-lanes-run and fledge-run at code tier, and they run there, because taskRun passes that worktree's top as createTaskExecute's talkWorktree (in-process, never from the env) and shellToolsGate grants a run with no role session only when it carries no Discord session id and no CORVIDINHO_ACTING_SURFACE stamp and its realpath cwd is exactly that worktree and a linked talk worktree whose git admin dir points back at it (isCliRunWorktree); --here (the checkout), a non-git folder, a repo subdirectory, any other directory, delegate or council workers (depth > 0), WATCH and schedule markers, and a spawn without a role session stay withheld, the model's call is refused as not offered, and one [operator] SAFE-3.a line per run says why (stderr in text mode, a Text event in --json / ndjson), never in the reply; a role session never uses talkWorktree; a granted prod command still raises the must-ask Approve card, and with no bridge running it lapses as a no and the run's output says why; tests/cli.safe3a-shell.test.ts fails on the base sources and passes on the branch; no new env var, flag, config key, table, schema or protocol change

## Evidence

- Verification commit: `c9c7f9d20fab0a9a1dd43fac74c91a65633a6190`
- Base commit: `b84c75fc3e98ce9d51c30ea215f538d53c18ded8`
- Verified by: `specsync check --spec agent --spec cli`

## From the change's context.md

# Context

Tracked under #83 (SAFE-3 / PLUGIN-1 shell; the M3 "Real dev teammate"
milestone), slice safe3a-cli of the M3/M4 plan
(`/home/user/coord/pr-safe3a-cli.json`). SAFE-3.a is already captured on
main in `hi/safe.md` from Leif's 2026-09-28 interview ("The model may use the
shell, the language runners and Fledge lane/task runs only in my own
interactive runs (chat, /session start, /work, local CLI), only when I
allowlist them, and only inside that talk's own worktree; non-owners, WATCH
and schedules never get them."). Nothing new is captured in this change.

What was missing on main (b84c75f): #324 built the Discord half
(`shellToolsGate`, REQ-agent-503) and refused every run with no role
session, because a local `task run` had no worktree of its own; #338
(SESSION-WORKTREE-1.a, REQ-cli-122) then gave `task run` its own linked
worktree by default, but the gate still refused it with `a local CLI run has
no role session (the CLI half of SAFE-3.a is not built yet)`. So "local CLI"
in SAFE-3.a was not met.

Constraints: specs only through SpecSync; no new env var, flag or config key
(none is needed: the worktree is an in-process value); v1 off-chain;
#232/#233 scope untouched; the parallel must-ask-public (Discord post paths)
and repo-ways-3 (loop.ts gate set, `src/work/pr.ts`, plugins/files) builds
are not touched (`src/plugins/must-ask.ts` is unchanged). Related captured
ids kept: SAFE-21 / SAFE-21.a (the shell and runners start without
credentials, unchanged), SESSION-WORKTREE-1.a. Where SAFE-3.a leaves a
question open, the conservative defaults in
`/home/user/coord/m34-defaults.md` (safe3a-shell rows) are used and listed in
the PR under "Design choices pending Leif".

## From the change's design.md

# Design

- **Gate** (`src/agent/shell-gate.ts`): `shellToolsGate` takes an optional
  `talkWorktree`. Order: depth > 0 → WATCH marker → schedule marker (both now
  before the role-session check, same reasons) → no role session ⇒
  `localCliVerdict` → the unchanged role-session rules (stamp, owner role,
  own talk worktree). `localCliVerdict` refuses a Discord session id or any
  stamp (every product spawn sets a role session, so either means a spawn
  without one), refuses a run a tool started (`CORVIDINHO_PROJECT_ROOT`,
  `TOOL_CHILD_ENV`, set in every tool child's env), refuses a missing / blank
  `talkWorktree` (in place:
  `--here`, non-git), refuses unless `isCliRunWorktree(cwd, talkWorktree)`,
  else grants. `isCliRunWorktree` = realpath(cwd) equals realpath(worktree)
  and the shared `isLinkedTalkTop` check (a `worktrees/talk-*` admin dir via
  `talkWorktreeGitDir` whose `gitdir` file points back), the same evidence
  `isOwnTalkWorktree` uses (refactored onto the helper, behaviour unchanged).
- **Why in-process**: `talkWorktree` is an option, not an env key, so a
  spawned child (whose env the parent controls) can never claim one; only
  `taskRun` sets it, from the `CliTaskWorkspace` it just made.
- **Wiring**: `createTaskExecute` gains `talkWorktree?` and passes it to the
  gate on every attempt; `taskRun` passes `ws.dir` to `taskRunIn` only for
  `kind: "worktree"` and `!roleSessionActive(process.env)`; `taskRunIn`
  forwards it. The run's cwd is `ws.cwd` (the start subdirectory inside the
  worktree), so a start in a subdirectory is refused (exact top only, like
  the Discord half).
- **Must-ask**: unchanged. With no bridge, the card is recorded, nobody
  decides it, it lapses at its TTL and the existing refusal text and wait
  line (routed by `setMustAskNotifier` to stderr / Text frames) say why.
- **Role**: no role session ⇒ the local operator (the owner on the box). No
  new owner check: there is no acting identity to check.
- **Docs**: CLI help line, README section, DISCORD-GO-LIVE E.3 / E.6 and tool
  rows, discord.md roles bullet, STATUS remaining-gaps line, spec prose.

## From the change's testing.md

# Testing

Regression tests (fixtures only: temp git projects under the test run's temp
root and the worktree `enterCliTaskWorkspace` makes there, another talk
worktree from `ensureTalkWorkspace`, an injected fake provider, a localhost
fake model for the spawned CLI, a fake passing `fledge` lane, a stand-in
`kubectl` first on PATH, the real card store with a short TTL; no network,
no tokens; every test removes the worktrees and `talk/*` branches it made).

- `tests/cli.safe3a-shell.test.ts` (11 tests, new).
- Adjusted: `tests/agent.safe3a-gate.test.ts`,
  `tests/agent.safe3a-owner-shell.test.ts` (the local-CLI refusal reason).

Fail-on-base proof: in this branch's worktree, the base's (b84c75f)
`src/agent/shell-gate.ts`, `src/agent/execute.ts` and `src/cli.ts` swapped
in: `tests/cli.safe3a-shell.test.ts` cannot load (`isCliRunWorktree` is not
exported) and the two adjusted cases fail on the old reason (3 failures, 15
pass). With `isCliRunWorktree` stubbed to `false` in the base gate, 10 of the
11 new tests fail (every grant, every new refusal reason, the must-ask lapse
through the granted shell, all three real-CLI cases); the role-session guard
passes on the base too. Restored: all 28 tests in the three files pass.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-681` | `tests/cli.safe3a-shell.test.ts` › "granted: a local run at the top of the worktree it made for itself (through a symlink too)" | `shellToolsGate` grants a run with no role session, session id or stamp whose cwd (or a symlink to it) is `talkWorktree`; `isCliRunWorktree` true for both. |
| `REQ-cli-681` | `tests/cli.safe3a-shell.test.ts` › "refused in place: --here (the checkout) and a non-git folder pass no worktree" | No or blank `talkWorktree` in the checkout, a non-git folder or even the worktree: `a local CLI run gets them only in the new worktree it made for itself, not with --here or outside a git repo`. |
| `REQ-cli-681` | `tests/cli.safe3a-shell.test.ts` › "refused: any cwd but the top of that worktree, and a 'worktree' that is not a linked one" | A subdirectory, the main checkout, another talk's worktree, a non-git folder, a missing dir, a main checkout / non-git folder / look-alike named as the worktree and a missing worktree path: `the run is not at the top of the worktree this CLI run made for itself`; `isCliRunWorktree` false. |
| `REQ-cli-681` | `tests/cli.safe3a-shell.test.ts` › "refused even in its own worktree: delegate workers, WATCH, schedules and a spawned child without a role session" | Depth 1 / 2 / junk, a WATCH marker and a `schedule_` session id keep their reasons; a Discord session id or a `chat` / `watch` / `schedule` / `cli` stamp without a role session is refused as a spawn. |
| `REQ-agent-503` | `tests/cli.safe3a-shell.test.ts` › "a role session never uses the CLI worktree: the owner's chat there is not in its own talk worktree" | The owner's chat env with `talkWorktree` set to the CLI worktree: `the run is not in this talk's own worktree`. |
| `REQ-cli-681` | `tests/cli.safe3a-shell.test.ts` › "offered at code tier and it runs in the run's worktree, not the checkout; no SAFE-3.a line" | `createTaskExecute` with `talkWorktree` offers `shell-exec` and `fledge-run`; the marker is in the worktree, not the checkout; no SAFE-3.a line; `unreportedEditTools` `["shell-exec"]`; attempt 2 still offered. |
| `REQ-cli-681` | `tests/cli.safe3a-shell.test.ts` › "--here, a non-git folder and a subdirectory: not offered, the call is refused, one operator line per run" | Neither tool offered over two attempts; both calls refused as not offered; no marker; exactly one `[operator] SAFE-3.a: shell-exec, fledge-run allowlisted but not offered: <why>` line; none in the summaries. |
| `REQ-cli-681` | `tests/cli.safe3a-shell.test.ts` › "a prod command still raises the must-ask card; with no bridge nobody answers, it lapses (no) and the run says why" | One `mustask` destructive card carrying the command; unanswered, the call fails with `no answer on the owner's Approve card … with no bridge running it lapses`; the stand-in `kubectl` records no call; the wait line says the one-time code and that no answer means no. |
| `REQ-cli-681` | `tests/cli.safe3a-shell.test.ts` › "by default the allowlisted shell is offered and runs in the run's own worktree" | The real CLI: the first model request offers `shell-exec`, it runs, the marker is in the kept worktree and not the checkout, no SAFE-3.a line, exit 0. |
| `REQ-cli-681` | `tests/cli.safe3a-shell.test.ts` › "--here (text output): not offered, one SAFE-3.a line on stderr, nothing runs, no worktree" | Not offered; exactly one SAFE-3.a line on stderr, none on stdout; no marker; no worktree or branch. |
| `REQ-cli-681` | `tests/cli.safe3a-shell.test.ts` › "a non-git folder (--json): not offered, one SAFE-3.a Text event, nothing runs" | Not offered; exactly one SAFE-3.a `Text` event; not in the summary; no `workspace`; no marker. |
| `REQ-agent-503` | `tests/agent.safe3a-gate.test.ts` › "refused: delegate and council workers (depth > 0) and a run with no role session outside its own CLI worktree" | Depth refusals unchanged; no role session with a session id and stamp is refused as a spawn; a plain local run with no worktree gets the in-place reason. |
| `REQ-agent-503` | `tests/agent.safe3a-owner-shell.test.ts` › "WATCH, a schedule, a delegate worker and a local CLI run: refused" | WATCH, schedule and worker unchanged; a local CLI run with no worktree of its own is not offered `shell-exec` and gets the in-place line. |

## Where these lessons go

- `specs/cli/context.md`
- `specs/agent/context.md`
