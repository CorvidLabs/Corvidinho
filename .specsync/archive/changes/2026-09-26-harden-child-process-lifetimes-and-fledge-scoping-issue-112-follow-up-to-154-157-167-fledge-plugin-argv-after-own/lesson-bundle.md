# Lesson bundle — harden-child-process-lifetimes-and-fledge-scoping-issue-112-follow-up-to-154-157-167-fledge-plugin-argv-after-own

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Harden child process lifetimes and Fledge scoping (issue #112 follow-up to #154, #157, #167): fledge plugin argv after --, own process group plus tree kill on timeout or abort for Fledge runs, delegate workers and schedule runs, daemon shutdown kills abandoned runs, Fledge commands scoped to the project root they were discovered for
- **Kind**: BugFix
- **Specs**: plugins, agent, discord, cli
- **Paths**: plugins/fledge, src/plugins/proc-group.ts, src/plugins/registry.ts, src/autonomous/delegate.ts, src/discord/agent-client.ts, src/scheduler, src/daemon/daemon.ts, tests
- **Acceptance**: fledge-<command> runs fledge plugins run <command> -- <argv> so option-looking argv (--help, --json, --ni) reach the plugin verbatim; Fledge runs, delegate workers and spawned schedule/chat runs start in their own process group and a timeout or abort stops the whole tree (group plus /proc descendants) so a grandchild never outlives the limit; a lead killed by SIGINT/SIGTERM/SIGHUP with no other handler, or exiting, stops its tracked children first; daemon shutdown after the grace kills abandoned runs' process trees, not just records them failed; unused ScheduleStore.markRunStarted is removed; Fledge commands are bound to the project root they were discovered for, loading another root rebinds or removes them, and a command never runs a different root's plugin; SAFE-1 and ROLES-CHAT gates unchanged; fixture tests prove each regression with no network

## Evidence

- Verification commit: `dcbd50a086165a937a53a027ac006b019956c1b9`
- Base commit: `c69e0e2fefdf11d506f55c528035d422973e4f1a`
- Verified by: `specsync check --spec agent --spec cli --spec discord --spec plugins`

## From the change's context.md

# Context

Reviews of three merged PRs found child-process and scoping gaps (bug-fix, no
new feature; Part of #112):

- #154 (Fledge plugins as tools): `fledge plugins run <command> <argv...>`
  let model argv such as `--help` / `--json` / `--ni` be parsed by fledge
  itself (clap reads options before the first positional). A timeout killed
  only the fledge pid, so native plugins and anything they backgrounded kept
  running. Registration was global by name, so in a long-running process a
  command discovered for project A ran in project B under A's origin / tier.
- #157 (daemon): runs abandoned after the shutdown grace were recorded failed
  but their `task run` child (and its tools) kept working.
  `ScheduleStore.markRunStarted` had no production caller left after
  `claimRun`.
- #167 (delegate): a timeout / abort sent SIGTERM then SIGKILL to the worker
  pid only; its plugins and depth-2 workers outlived the limit.

Captured HI this rests on: AGENT-3 (interrupt actually stops), FLEDGE-4 /
PLUGIN-2 / PLUGIN-3 (registered for the project; declared danger and tier
enforced), SAFE-1 (dangerous consent), CLI-8 / AUTONOMOUS-4 (daemon). No new
HI, env var, slash command or product surface. SAFE-1 and ROLES-CHAT gates are
unchanged.

Constraints: Linux only (the `/proc` walk is fine), Bun 1.4.2 (`detached:
true` = setsid), many parallel workers (new logic lives in a new module,
small hooks in hot files).

## From the change's design.md

# Design

New module `src/plugins/proc-group.ts` (plugins spec, no deps):

- `readProcTable()` / `parseProcStat()`: `/proc/<pid>/stat` → pid, ppid,
  pgid, starttime.
- `collectProcessTree(root, { known, rootJustExited })`: fixpoint over the
  table — parents are tree members (root only while it is our child or a
  known start time matches), groups are those led by a member plus the root's
  group while trusted (root ours, a validated known member still in it, or a
  snapshot taken as the root exited). Never this process or pid 1.
- `signalProcessTree(root, sig)` (graceful, returns members as a snapshot) and
  `killProcessTree(root, { known })` (SIGSTOP rounds until stable, then
  SIGKILL every member and every member-led / root group, never our own
  group).
- `trackChildProcess(pid, known?)`: exit hook + prepended SIGINT/SIGTERM/SIGHUP
  hook that acts only when it is the sole listener (then kills tracked trees
  and re-raises); hooks removed when nothing is tracked. A signal the process
  started with ignored (`SigIgn` in `/proc/self/status`, read once at load:
  `nohup`'s SIGHUP, a background job's SIGINT) is never hooked, because a
  listener replaces SIG_IGN and removing it leaves SIG_DFL. `known` returns
  the caller's exit snapshot, so the hooks still reach what an exited child
  left in its group.

Hooks in existing files (small):

- `plugins/fledge/spawn.ts`: `detached: true`, track, timeout/abort →
  `killProcessTree` (with a group snapshot taken at leader exit while pipes
  are still open), new `signal` / `aborted`.
- `plugins/fledge/commands.ts`: `fledgeRunArgv` adds `--`; abort → exit 130;
  `fledgePluginCommand(..., projectRoot)` refuses another cwd (exit 2).
- `plugins/fledge/index.ts`: `bound` map name → { root, command }; a load
  rebinds same-named commands to its root, removes other roots' leftovers,
  cache valid only while all bindings are for that root.
- `src/plugins/registry.ts`: `unregister(name, command)` (identity-checked).
- `src/autonomous/delegate.ts`: `detached: true`, track; timeout/abort →
  SIGTERM to the tree, SIGKILL sweep after the grace or as soon as the worker
  exits; a group snapshot at worker exit feeds later stops (abort during the
  drain, lead exit); old worker-pid-only exit hook removed.
- `src/discord/agent-client.ts`: `detached: true`, track, optional `signal`
  → kill tree, using a group snapshot taken as the agent exited (as in
  `spawnCapped`) so a leftover holding the output pipe is reached.
- `src/scheduler/service.ts`: per-run `AbortController`; `abandonInFlight`
  aborts it. `src/scheduler/store.ts`: `markRunStarted` removed, `startRun`
  folded into `claimRun`.
- `src/daemon/daemon.ts`: doc comment only (behaviour flows via the scheduler).

Alternatives rejected: no detach + `/proc` walk only (cannot reach orphans in
the child's group once it exits); an internal env var to skip nested
detaching (invented surface); cgroups (not available to an unprivileged
Bun process).

## From the change's testing.md

# Testing

New / changed tests (fixtures only, no network, no tokens):

- `tests/proc-group.test.ts`: stat parsing; synthetic tree walk (descendants,
  orphans in root group, recycled pids, never self / pid 1); real `sh` tree
  with same-group and `setsid` grandchildren killed; SIGTERM snapshot reaches
  an orphaned TERM-proof grandchild; tracked tree killed on parent exit and on
  unhandled SIGTERM (parent dies by SIGTERM); a parent's own SIGTERM or
  first-registered `once` SIGINT handler keeps its grace; hooks removed;
  unhandled SIGHUP kills the tree and the parent; a parent started under
  `trap '' HUP` survives SIGHUP while tracking and after untracking (still
  ignored in `SigIgn`); `SigIgn` mask parsing; a tracked exit snapshot lets
  parent exit kill what an exited child left in its group.
- `tests/agent-client.tree.test.ts`: fake agent bin that backgrounds `sleep`
  and exits; an abort after the agent exited kills the leftover holding the
  output pipe and `runChat` returns.
- `tests/fledge.hardening.test.ts`: `--` in argv; `--help/--json/--ni/--`
  reach the plugin (fake mimics fledge 1.8 help-eating); timeout kills
  same-group + `setsid` grandchildren and an orphan left holding the pipe;
  abort → 130 and tree killed; pre-aborted → nothing runs; two-root rebinding
  (origin + minTier follow the root, leftovers removed, other cwd refused and
  nothing run, reload rebinds); same plugin in two roots; failed discovery
  clears other roots; forced reload picks up an upgrade.
- `tests/autonomous.delegate.test.ts`: timeout and lead abort kill the
  worker's same-group and `setsid` grandchildren; a lead abort during the
  pipe drain after the worker exited kills its leftover grandchild.
- `tests/scheduler.claim.test.ts`: `abandonInFlight` aborts the run's signal;
  failure counting uses `claimRun` (markRunStarted removed).
- `tests/daemon.test.ts`: real spawn client + fake `sh` bin; stop after the
  grace kills the run, its same-group and `setsid` grandchildren.
- `tests/fledge.plugins.test.ts` / `tests/fledge.cli.test.ts`: fakes consume
  one `--` like fledge; `tests/store.scrub.test.ts` uses `claimRun`.

Each new regression test was run against the pre-fix code and failed.
Commands: `bunx tsc --noEmit`, `bun test`, `specsync check --require-coverage
100`, `specsync change audit`, `fledge lanes run verify --non-interactive`.

## Where these lessons go

- `specs/plugins/context.md`
- `specs/agent/context.md`
- `specs/discord/context.md`
- `specs/cli/context.md`
