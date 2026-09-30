---
change: bun-test-keeps-every-temp-dir-it-makes-under-one-per-run-root-in-tmpdir-and-removes-that-root-when-the-run-ends-instead
artifact: design
---

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
