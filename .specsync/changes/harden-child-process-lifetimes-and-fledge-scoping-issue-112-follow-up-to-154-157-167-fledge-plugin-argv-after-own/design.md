---
change: harden-child-process-lifetimes-and-fledge-scoping-issue-112-follow-up-to-154-157-167-fledge-plugin-argv-after-own
artifact: design
---

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
