---
module: cli
change: my-local-cli-task-run-may-use-the-allowlisted-shell-and-runners-inside-its-own-worktree-safe-3-a-local-cli-half
---

# Delta: cli (a local task run gets the allowlisted shell, runners and Fledge runs only in its own worktree — SAFE-3.a, local CLI half)

## Added

### REQUIREMENT REQ-cli-681

My local CLI task run may use the allowlisted shell and runners inside its
own worktree (SAFE-3.a, local CLI half; captured in `hi/safe.md` from Leif's
2026-09-28 interview: "The model may use the shell, the language runners and
Fledge lane/task runs only in my own interactive runs (chat, /session start,
/work, local CLI), only when I allowlist them, and only inside that talk's own
worktree; non-owners, WATCH and schedules never get them."; #83). A local
`corvidinho task run` SHALL offer the model the allowlisted `SAFE3A_TOOLS`
(`shell-exec`, `node-exec`, `python-exec`, `cargo-exec`,
`fledge-lanes-run`, `fledge-run`; REQ-agent-501 / REQ-agent-503) only in the
worktree it made for itself (SESSION-WORKTREE-1.a, REQ-cli-122):

- `taskRun` SHALL pass that worktree's top (`ws.dir`) to
  `createTaskExecute` as `talkWorktree` only when `enterCliTaskWorkspace`
  made this run's own worktree (`kind: "worktree"`) and the process has no
  role session (`roleSessionActive` false); it is an in-process value, never
  read from the env. In place (`--here`, a non-git folder, a spawned child)
  it SHALL pass none.
- `shellToolsGate` (REQ-agent-503) SHALL grant a run with no role session
  only when it is not a delegate or council worker (depth 0), carries no
  WATCH or schedule marker, no `CORVIDINHO_DISCORD_SESSION_ID` and no
  `CORVIDINHO_ACTING_SURFACE` stamp (every product spawn sets a role
  session, so either one means a spawn without one), no
  `CORVIDINHO_PROJECT_ROOT` (`TOOL_CHILD_ENV`: the env of every tool child —
  `shell-exec` and the runners, the Fledge core runs and Fledge plugin
  commands — carries it, so a `task run` the model starts from a granted
  shell, a runner or a Fledge run is the model's run, not my own interactive
  one, and its worktree would sit outside the parent's), and its cwd, resolved
  through symlinks, is exactly `talkWorktree` and a linked talk worktree
  whose `worktrees/talk-*` admin dir points back at it
  (`isCliRunWorktree(cwd, worktree)`, exported from
  `src/agent/shell-gate.ts`). The local operator is the owner (no role
  session to resolve); the allowlist (`CORVIDINHO_ALLOWLIST`) and code tier
  still decide.
- `--here` (the checkout), a non-git folder, a start in a repo subdirectory
  (the run's cwd is that subdirectory of its worktree), the main checkout,
  another talk's worktree, a look-alike or missing directory, a worker, WATCH,
  a schedule, a spawn without a role session and a run a tool started SHALL
  stay withheld: the
  tools are left out of the attempt's catalog, a model call is refused as not
  offered, and the run emits one `[operator] SAFE-3.a: <names> allowlisted
  but not offered: <reason>` line per run (stderr in text mode, a `Text`
  event / frame in `--json` / ndjson), never part of the reply. The reasons:
  `a local CLI run gets them only in the new worktree it made for itself, not
  with --here or outside a git repo`; `the run is not at the top of the
  worktree this CLI run made for itself`; `a run with no role session gets
  them only as a local CLI run, and this one carries a Discord session or
  surface stamp`; `a run started from inside a tool (the shell, a runner or a
  Fledge run) never gets them`.
- A role session never uses `talkWorktree` (its own talk worktree rule
  stands, REQ-agent-503).
- A granted call SHALL still go through `runPlugin` (SAFE-1, the must-ask
  gate, SAFE-5 audit) and the tool's own SAFE-3 clamp, SAFE-21 refusals and
  credential-free env. A prod or deploy command raises the must-ask Approve
  card (AUTONOMY-9); with no bridge running nobody answers it, so it lapses
  as a no (SAFE-20), nothing runs, and the run's output carries the wait line
  (`… no answer by <time> means no`) and the refusal (`no answer on the
  owner's Approve card … with no bridge running it lapses`).
- No new env var, flag, config key, table, schema or protocol version.

Acceptance Criteria
- `tests/cli.safe3a-shell.test.ts` gate rows: granted at the top of the run's own worktree (and through a symlink to it); refused in place (no or blank `talkWorktree`), in a subdirectory, the main checkout, another talk's worktree, a non-git folder, a missing dir, a look-alike borrowing the worktree's `.git` file, a main checkout or non-git folder named as the worktree, for depth 1 / 2 / junk, a WATCH marker, a `schedule_` session id, a Discord session id or any stamp without a role session, and a `CORVIDINHO_PROJECT_ROOT` (set or empty); a nested `task run` with the env `runnerChildEnv` or `fledgeCoreChildEnv` gives a tool child, in the worktree it makes from the run's worktree (outside it), is refused as started from inside a tool; the owner's chat (role session) in the CLI worktree is refused whatever `talkWorktree` says.
- Through `createTaskExecute` with `talkWorktree`: `shell-exec` and `fledge-run` are offered at code tier and `shell-exec` runs in the worktree (not the checkout), with no SAFE-3.a line and `unreportedEditTools: ["shell-exec"]`, on attempt 2 too; the checkout, a non-git folder and a subdirectory are not offered either over two attempts, both calls refused as not offered, exactly one SAFE-3.a line, none in the summaries; `kubectl get pods; touch ran.marker` raises one `mustask` destructive card, which nobody answers, so the call fails with the lapse reason, nothing runs and the wait line says no answer means no.
- The real CLI against a localhost fake model: by default `shell-exec` is offered and runs in the kept worktree, not the checkout, exit 0; `--here` (text) prints exactly one SAFE-3.a line on stderr and offers none; a non-git folder (`--json`) has exactly one SAFE-3.a `Text` event and offers none.
- With the base's sources the file cannot load; with `isCliRunWorktree` and `TOOL_CHILD_ENV` stubbed in, 11 of 12 fail (the role-session guard passes there too); with the gate as it was before the tool-child refusal, the two cases holding tool-child rows fail (granted); all pass on the branch.
