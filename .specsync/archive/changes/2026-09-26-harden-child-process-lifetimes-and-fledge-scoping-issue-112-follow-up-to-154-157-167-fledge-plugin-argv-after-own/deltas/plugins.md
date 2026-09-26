---
module: plugins
change: harden-child-process-lifetimes-and-fledge-scoping-issue-112-follow-up-to-154-157-167-fledge-plugin-argv-after-own
---

# Delta — plugins (child process trees, Fledge argv and project scope; #112 follow-up)

## Added

### REQUIREMENT REQ-plugins-154

A bounded child process SHALL NOT outlive its limit (AGENT-3).
`src/plugins/proc-group.ts` SHALL provide the Linux process-tree stop used by
Fledge runs, delegate workers and spawned schedule/chat runs, which SHALL be
spawned with `detached: true` (their own session and process group).
Stopping a child SHALL signal every process group led by a member of its
tree, including the child's own group after the child exited, and every
descendant found by walking `/proc` parent links, so a grandchild that moved
to its own group or session is reached while its parent lives. A hard kill
SHALL freeze the tree with SIGSTOP, re-read `/proc` until no new member
appears, then SIGKILL. A graceful stop MAY first send SIGTERM and return the
members it saw, so a later hard kill still reaches grandchildren orphaned
meanwhile. Pid reuse SHALL be guarded: the root pid is used only while it is
still this process's child or matches a remembered start time, and a group
whose leader exited only through a remembered member still in it or a
snapshot taken as the leader exited. This process, its own process group and
pid 1 SHALL never be signalled, and the helpers SHALL never throw.

A tracked child SHALL be stopped with its tree when this process exits, and
when SIGINT, SIGTERM or SIGHUP arrives while no other listener handles that
signal; the signal SHALL then be re-raised with its default action. The hook
SHALL run before other listeners and count them, so a process that handles
the signal itself (the bridge's `once` handler, the daemon's grace) keeps its
own shutdown, and the exit hook stops what is left. A signal this process
started with ignored (the `SigIgn` mask in `/proc/self/status` at load, for
example SIGHUP under `nohup` or SIGINT in a background job) SHALL NOT be
hooked, so it stays ignored while a child is tracked and after the last one
is untracked. A caller MAY give the tracker its latest snapshot of the tree
(taken as the child exited); the exit and signal hooks SHALL use it, so what
the child left in its group is still stopped after the child is gone.
Signal and exit hooks SHALL be removed once no child is tracked.

Acceptance Criteria
- Real `sh` trees: a hard kill stops the child, a same-group grandchild and a `setsid` grandchild.
- A SIGTERM-ignoring grandchild orphaned by the child's exit is killed by a later hard kill given the SIGTERM snapshot.
- Synthetic `/proc` tables: descendants in any group and orphans in the root's group are members; unrelated processes, a recycled root pid (not our child), a recycled known pid (start time differs), this process and pid 1 are not.
- A parent that exits, or dies of SIGTERM with no other handler (exit by SIGTERM), leaves no tracked tree behind; a parent with its own SIGTERM or `once` SIGINT handler registered first keeps its grace and its tree dies at exit.
- Untracking the last child removes the signal hooks.
- A parent with no other handler dies by SIGHUP after its tracked tree is killed; a parent started with SIGHUP ignored survives SIGHUP while a child is tracked and after it is untracked (SIGHUP still ignored in its `SigIgn`), and SIGTERM still stops its tree.
- `SigIgn` parsing maps bit n-1 to signal n (SIGHUP, SIGINT, SIGTERM) and treats a missing mask as none.
- A parent tracking a child with its exit snapshot kills the grandchild that child left in its group when the parent exits.

## Modified

### REQUIREMENT REQ-plugins-112

The system SHALL discover the Fledge plugins registered for a project through
the local fledge CLI (FLEDGE-4 / PLUGIN-3): it SHALL run
`fledge --non-interactive plugins list --json` (required) and
`fledge --non-interactive plugins audit --json` (capabilities, best effort) as
argv arrays with cwd set to the project root, stdin closed, a timeout and a
capped output size, never through a shell. Fledge output SHALL be treated as
data: command names SHALL match `^[A-Za-z0-9][A-Za-z0-9_-]{0,56}$` or be
skipped with a warning, and free text SHALL be cleaned of control characters
and length-capped. Each valid Fledge command SHALL register as the typed
plugin `fledge-<command>` with `dangerous: true` (fledge manifests declare no
danger or tier and native plugins run unsandboxed, so SAFE-1 consent applies)
and `minTier` 2 (code) for native or capability-unknown plugins, or 1 (tool)
for a wasm-sandboxed plugin without the `exec` capability (PLUGIN-2). The
command description SHALL stay small and SHALL NOT include the plugin source
path (FLEDGE-5). A name already registered by a builtin or another plugin
SHALL be skipped with a reason. A missing fledge binary, non-zero exit,
unexpected JSON, oversized output or timeout SHALL degrade to zero Fledge
commands with a reason and SHALL NOT affect builtins.

Each registered Fledge command SHALL be bound to the project root (resolved
cwd) it was discovered for. Loading another root SHALL rebind same-named
Fledge commands to that root's plugin (origin, tier and danger from it) and
SHALL remove Fledge commands that root does not offer, including when its
discovery fails; a cached load SHALL be reused only while every Fledge
command in the registry is still bound to that root; a forced reload SHALL
pick up a changed plugin version. A bound command called with any other cwd
SHALL be refused with exit 2 without starting fledge, so a long-running
process never runs one project's plugin under another project's name.

Acceptance Criteria
- Fake fledge fixture: list + audit rows register `fledge-hello`, `fledge-bye`, `fledge-tz`, `fledge-runner`, all dangerous; native → minTier 2, wasm without exec → 1, wasm with exec → 2, audit unavailable → 2.
- Invalid or overlong command names are skipped with a warning; duplicate names across plugins are skipped with a reason.
- Missing fledge, exit 3, bad JSON and a 200 ms timeout each return ok=false with a reason and leave the builtin list unchanged.
- The description names the plugin, version, trust tier and sandbox and never the source path.
- Two roots with different plugins behind `fledge-hello`: after loading the second, origin and minTier come from its plugin, the first root's other commands are gone, a call from the first root's cwd is refused with exit 2 and runs nothing, and loading the first root again rebinds it.
- A root whose discovery fails leaves no other root's Fledge command registered; builtins stay.

### REQUIREMENT REQ-plugins-113

Running `fledge-<command>` SHALL execute
`fledge --non-interactive plugins run <command> -- <argv...>` as an argv array
(no shell interpolation) with cwd pinned to the bound project root, stdin
closed, and a child env that drops `CORVIDINHO_*`,
`DISCORD_*`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` and `OPENROUTER_API_KEY`,
keeps the rest (including GitHub tokens for GitHub-backed Fledge plugins), and
sets `FLEDGE_NON_INTERACTIVE=1` and `CORVIDINHO_PROJECT_ROOT`. The `--` SHALL
end fledge's own options so model-supplied argv such as `--help`, `--json`
or `--ni` reach the plugin verbatim (fledge 1.8 passes everything after one
`--` to the plugin). Output SHALL be
secret-scrubbed with `scrubSecrets` (SAFE-6) and capped per stream; a run
SHALL time out (default 120 s) and be killed with exit 124; the calling run's
abort signal (AGENT-3) SHALL stop it with exit 130 (`aborted`), and an
already-aborted call SHALL not start fledge. Fledge SHALL run in its own
process group and a timeout or abort SHALL stop its whole process tree
(REQ-plugins-154), including a grandchild left holding the output pipes after
the plugin exited. A non-zero exit
SHALL be a failed result carrying that exit code; a binary that cannot start
SHALL fail with exit 127 instead of throwing. SAFE-1 SHALL deny the command in
non-interactive mode unless `fledge-<command>` is allowlisted, and SAFE-5
audit rows SHALL be recorded as for any dangerous plugin.

Acceptance Criteria
- Non-interactive without allowlist → exit 2 with SAFE-1; allowlisted → argv is `plugins run hello -- <argv...>` and the fake plugin sees each argv item verbatim (spaces, `$(…)`, `;` not interpreted), cwd = project root.
- `--help`, `--json`, `--ni` and a literal `--` as argv reach the plugin in order, and fledge's own help is never printed.
- The child env lacks Discord / Corvidinho LLM / audit keys, keeps `GITHUB_TOKEN`, and has `FLEDGE_NON_INTERACTIVE=1`.
- Exit 7 → ok=false exitCode 7; sleep past a 200 ms timeout → exitCode 124; missing binary → 127.
- A timeout kills a same-group and a `setsid` grandchild, and a background grandchild left after the plugin exited; an abort returns exit 130 with `aborted` and kills the tree.
- A `ghp_…` token in plugin output is redacted and output past the cap is truncated with a marker.
