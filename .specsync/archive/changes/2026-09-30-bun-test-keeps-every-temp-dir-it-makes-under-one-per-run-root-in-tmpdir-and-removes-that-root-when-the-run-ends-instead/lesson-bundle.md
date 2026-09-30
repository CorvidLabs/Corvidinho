# Lesson bundle — bun-test-keeps-every-temp-dir-it-makes-under-one-per-run-root-in-tmpdir-and-removes-that-root-when-the-run-ends-instead

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Bun test keeps every temp dir it makes under one per-run root in TMPDIR and removes that root when the run ends, instead of leaking ~500 mkdtemp dirs into /tmp per run (verify lane filled the agent box's disk)
- **Kind**: BugFix
- **Specs**: cli
- **Paths**: tests/preload.ts, tests/preload.tmp-cleanup.test.ts, tests/fixtures/preload-tmp-probe.ts, specs/cli/cli.spec.md, specs/cli/testing.md
- **Acceptance**: A full bun test run (and the fledge verify lane that runs it) leaves no new entries in the TMPDIR it started with: every temp dir the suite, its test files (including tmpdir() read at module top level) and the CLIs and shells they spawn without an explicit env make lands under one corvidinho-test-run-* root the preload creates in that TMPDIR, the preload's scratch data dir included; the root is removed when the run ends, also when a test fails (exit 1, failure still reported) and when a test calls process.exit() (exit code kept); cleanup never throws or changes a run's result; no new env var, config key or command

## Evidence

- Verification commit: `c890b3e62cd3f7c3c1364f733bb7f5995f6321dd`
- Base commit: `5093b81f1d8a10582b216c6116d1cfd83db331c7`
- Verified by: `specsync check --spec cli`

## From the change's context.md

# Context

The agent box's disk filled and blocked PR landing: `/tmp` held ~430k
entries / ~26G, almost all `corvidinho-*` dirs from `bun test`
(`corvidinho-test-data-*`, `corvidinho-delegate-proj-*`,
`corvidinho-spend-*`, `corvidinho-ask-*`, `corvidinho-council-*`,
`corvidinho-clean-err-*`, ...). The test files make ~450 `mkdtemp` dirs
under `tmpdir()` and most never remove them; the preload's own scratch data
dir was never removed either. The prove-before-done verify lane
(`fledge lanes run verify`) runs the suite on every Discord / WATCH / daemon
task, so an operator's box fills the same way.

Repro on origin/main 5093b81: full `bun test` with `TMPDIR` set to a fresh
dir leaves 519 entries (41M) in it (77 `corvidinho-team-people-*`, 24
`corvidinho-spend-proj-*`, 23 `corvidinho-ask-proj-*`, ...,
`.corvid-worktrees`, `watch-spawn-*`).

Constraint: a test-infrastructure fix only (no product surface, no new env
var, config key or command, no hi/ criteria). Fixed centrally in the
preload rather than in ~140 test files.

HI: none new; AGENTS.md verify-lane rule (the lane must keep working on the
agent box).

## From the change's design.md

# Design

- `tests/preload.ts` (test harness, not shipped), before anything else:
  - `runRoot = mkdtempSync(join(tmpdir(), "corvidinho-test-run-"))` in the
    temp dir the run started with; set `process.env.TMPDIR`, `TMP`,
    `TEMP` to it. Bun's `node:os` `tmpdir()` reads `TMPDIR` at call
    time (checked with a probe script: set at runtime, the next `tmpdir()`
    and `mkdtempSync` use it), and the preload runs before any test module,
    so top-level `tmpdir()` reads move too.
  - The scratch data dir (`corvidinho-test-data-*`, REQ-cli-262) is made
    inside `runRoot`.
  - Children: the existing `Bun.spawn` / `Bun.spawnSync` wrapper already
    defaults a missing `env` to the current `process.env`, and
    `node:child_process` uses `process.env`, so CLIs and shells a test
    spawns get the new `TMPDIR`. Tests that hand a custom env already pass
    `TMPDIR: tmpdir()` (now the root).
  - Cleanup: a watcher, `/bin/sh -c 'trap "" INT HUP TERM; echo ready;
    read -r _; exec rm -rf -- "$1"' corvidinho-test-reaper <runRoot>`,
    spawned with its stdin a pipe only this process holds (Bun marks it
    close-on-exec, so children a test leaves running do not keep it open),
    `cwd` `/`, stdout read once for `ready` (top-level await, so the traps
    are in place before the first test) and then `unref()`ed. When the
    `bun test` process exits for any reason the kernel closes the pipe,
    `read` returns and the watcher removes the root. `rm -rf` does not
    follow symlinks. A process `exit` handler also removes the root
    synchronously (a test calling `process.exit()`); every error is
    swallowed.
- Why not a preload `afterAll` (the first version of this change), probed on
  Bun 1.4.2: it is not the end of the process. `--rerun-each=2` fires it
  after the last file's first run and then reruns that file;
  `--parallel --no-isolate` fires it after every file a worker runs. Removing
  the root there failed those runs with `ENOENT` on the next `mkdtemp`
  (real files: 1 and 10 failures; main's preload: none). `--bail` and a
  signal skip it and leak the root.
- Why a watcher: `bun test` fires no `exit` / `beforeExit` / `unload`
  event when it finishes, pass or fail, so an in-process hook cannot see the
  real end. The watcher ignores INT/HUP/TERM because Ctrl-C signals the
  terminal's whole process group and `--isolate` SIGTERMs a file's leftover
  children when the file ends; the `ready` handshake closes the window before
  the trap is set. With `--isolate` / `--parallel` each file gets its own
  root and watcher, all removed when the process (worker) exits.
- Not changed: test files, `src/` (`src/store/backup.ts` restore test
  still uses `tmpdir()`, now the root under test), `bunfig.toml`.
- Not covered: killing the run's whole process tree (an aborted verify lane:
  SIGSTOP + SIGKILL to every member) also kills the watcher and leaves that
  run's one root. The preload does not sweep other runs' roots (a concurrent
  run may own them). Bun's own `bun-node-<revision>` shim dir in the OS temp
  dir is Bun's, one per Bun version and reused.

## From the change's testing.md

# Testing

Before = origin/main 5093b81; after = this change. Each run below used a
fresh private `TMPDIR` (or, where said, `TMPDIR` unset with a private empty
`/tmp` mount) and counted the entries left in it after the run.

- Full `bun test`: before 519 entries (41M) left in `TMPDIR`, 2779 pass,
  0 fail; after 0 entries, 2786 pass, 0 fail (7 new cases). With `TMPDIR`
  unset and an empty private `/tmp`: before 520 entries (41M), after only
  Bun's own `bun-node-<rev>` shim dir.
- `tests/preload.tmp-cleanup.test.ts` with main's `tests/preload.ts`
  swapped in: 0 pass, 7 fail (the child's `tmpdir()` is the parent dir
  itself and `corvidinho-test-data-*` plus the probe's dirs stay there).
  With the first version's preload `afterAll` removal: the `--bail`,
  SIGKILL and `--rerun-each` cases fail (root left; rerun `ENOENT`).
  After: 7 pass.
- Real files under other modes (`tests/agent.config.test.ts`,
  `tests/allowlist.default-deny.test.ts`, `tests/allowlist.tilde-path.test.ts`):
  `--rerun-each=2` and `--parallel=2 --no-isolate` failed 1 and 10 tests
  with `ENOENT` under the `afterAll` removal and pass after (as on main);
  `--isolate` and `--parallel=2` pass; every mode leaves `TMPDIR` empty.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-711` | `tests/preload.tmp-cleanup.test.ts` "every temp dir the run makes lands under one corvidinho-test-run-* root in TMPDIR" (probe `tests/fixtures/preload-tmp-probe.ts`) | Child `bun test` with `TMPDIR` = a fresh dir: `tmpdir()` in a test and at module top level, `TMPDIR` / `TMP` / `TEMP` are one `corvidinho-test-run-*` dir directly in it; the data dir, two `mkdtemp` dirs and a `sh -c mktemp -d` spawned without `env` are inside it. Fails before (`tmpdir()` is the parent itself). |
| `REQ-cli-711` | `tests/preload.tmp-cleanup.test.ts` "the root is removed when the run ends: TMPDIR is left empty" | After a passing child run (exit 0) the root is gone and the parent is empty. Fails before (`corvidinho-test-data-*` and the probe's dirs remain). |
| `REQ-cli-711` | `tests/preload.tmp-cleanup.test.ts` "a failing run still removes its root and still reports the failure, also under --bail" | Child exits 1 and prints the failure; parent empty, with and without `--bail`. Fails before, and under `--bail` with the `afterAll` removal. |
| `REQ-cli-711` | `tests/preload.tmp-cleanup.test.ts` "a test that calls process.exit() still removes the root and keeps its exit code" | Child exits 7; parent empty. Fails before. |
| `REQ-cli-711` | `tests/preload.tmp-cleanup.test.ts` "a run whose bun process is SIGKILLed still has its root removed" | Child's bun process SIGKILLed mid-test (exit 137); parent empty. Fails before and with the `afterAll` removal. |
| `REQ-cli-711` | `tests/preload.tmp-cleanup.test.ts` "--rerun-each finds the root on every run and removes it after the last" | `--rerun-each=2`: 2 pass, exit 0, parent empty. Fails before (root left) and with the `afterAll` removal (rerun `ENOENT`). |
| `REQ-cli-711` | `tests/preload.tmp-cleanup.test.ts` "removal stays inside its own root: other runs' roots and symlink targets are left alone" | A pre-existing `corvidinho-test-run-other/keep` and the target dir/file of symlinks the probe left in its root survive; only they remain. |
| `REQ-cli-711` | full `bun test` with a fresh `TMPDIR` | 0 entries left (before: 519 / 41M); suite passes. |
| `REQ-cli-262` | `tests/preload.operator-data-dir.test.ts` | Data dir still the preload's own (now inside the run root), operator dir untouched; unchanged and passing. |

## Where these lessons go

- `specs/cli/context.md`
