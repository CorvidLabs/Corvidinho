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
  - Cleanup `removeRunRoot()`: `rmSync(runRoot, { recursive, force })`,
    one retry, every error swallowed (cleanup never changes a result).
    Registered as a preload `afterAll` (Bun runs it once after the last
    file, on pass and fail) and `process.on("exit")`.
- Why both hooks (probed in a scratch project on Bun 1.4.2): `bun test`
  fires no `exit` / `beforeExit` event when it finishes, pass or fail, so
  an exit handler alone never runs; a test calling `process.exit()` skips
  `afterAll` but fires `exit`.
- Not changed: test files, `src/` (`src/store/backup.ts` restore test
  still uses `tmpdir()`, now the root under test), `bunfig.toml`.
- Not covered: a run killed by a signal or `--bail` (neither hook runs)
  leaves its one `corvidinho-test-run-*` root; the preload does not sweep
  other runs' roots (a concurrent run may own them).
