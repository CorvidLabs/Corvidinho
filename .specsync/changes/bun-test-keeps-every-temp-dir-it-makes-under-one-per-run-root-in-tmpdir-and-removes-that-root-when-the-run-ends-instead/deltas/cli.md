---
module: cli
change: bun-test-keeps-every-temp-dir-it-makes-under-one-per-run-root-in-tmpdir-and-removes-that-root-when-the-run-ends-instead
---

# Delta — cli (bun test removes the temp dirs it makes)

## Added

### REQUIREMENT REQ-cli-711

A `bun test` run SHALL NOT leave the temp dirs it makes in the OS temp dir.
The bun test preload (`tests/preload.ts`, loaded by `bunfig.toml`) SHALL
create one per-run root, `corvidinho-test-run-*`, in the temp dir the run
started with, and SHALL point `TMPDIR`, `TMP` and `TEMP` at it before any
test module loads, so every later `tmpdir()` / `mkdtemp` in the suite (also
one read at a test file's top level) and in a CLI or shell a test spawns with
no explicit `env` lands under it; the preload's scratch data dir
(REQ-cli-262) SHALL live inside it. The preload SHALL remove the root
recursively when the run ends: after the last test file (pass or fail) and,
when a test calls `process.exit()`, on process exit. Removal SHALL be
best-effort and never throw, so it never changes a run's exit code or hides a
test failure. No new env var, config key or command.

Acceptance Criteria
- A child `bun test` started with `TMPDIR` set to a fresh dir reports `tmpdir()` (read inside a test and at module top level), `TMPDIR`, `TMP` and `TEMP` as one `corvidinho-test-run-*` dir directly inside it; its data dir, its `mkdtemp` dirs and a shell's `mktemp -d` spawned with no explicit `env` are all inside that root.
- After that child exits the root is gone and the fresh `TMPDIR` is empty: when its tests pass (exit 0), when a test fails (exit 1, the failure still printed) and when a test calls `process.exit(7)` (exit 7).
- A full `bun test` run with a fresh `TMPDIR` passes and leaves that dir empty.
