---
change: bun-test-keeps-every-temp-dir-it-makes-under-one-per-run-root-in-tmpdir-and-removes-that-root-when-the-run-ends-instead
artifact: testing
---

# Testing

Before = origin/main 5093b81; after = this change. Each run below used a
fresh private `TMPDIR` and counted the entries left in it after the run.

- Full `bun test`: before 519 entries (41M) left in `TMPDIR`, 2779 pass,
  0 fail; after 0 entries, 2783 pass, 0 fail (4 new cases).
- `tests/preload.tmp-cleanup.test.ts` with main's `tests/preload.ts`
  swapped in: 0 pass, 4 fail (the child's `tmpdir()` is the parent dir
  itself and `corvidinho-test-data-*` plus the probe's dirs stay there).
  With only the `exit` hook: the pass-run and fail-run cases fail. With only
  `afterAll`: the `process.exit()` case fails. With both: 4 pass.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-711` | `tests/preload.tmp-cleanup.test.ts` "every temp dir the run makes lands under one corvidinho-test-run-* root in TMPDIR" (probe `tests/fixtures/preload-tmp-probe.ts`) | Child `bun test` with `TMPDIR` = a fresh dir: `tmpdir()` in a test and at module top level, `TMPDIR` / `TMP` / `TEMP` are one `corvidinho-test-run-*` dir directly in it; the data dir, two `mkdtemp` dirs and a `sh -c mktemp -d` spawned without `env` are inside it. Fails before (`tmpdir()` is the parent itself). |
| `REQ-cli-711` | `tests/preload.tmp-cleanup.test.ts` "the root is removed when the run ends: TMPDIR is left empty" | After a passing child run (exit 0) the root is gone and the parent is empty. Fails before (`corvidinho-test-data-*` and the probe's dirs remain) and with only the `exit` hook. |
| `REQ-cli-711` | `tests/preload.tmp-cleanup.test.ts` "a failing run still removes its root and still reports the failure" | Child exits 1 and prints the failure; parent empty. Fails before and with only the `exit` hook. |
| `REQ-cli-711` | `tests/preload.tmp-cleanup.test.ts` "a test that calls process.exit() still removes the root and keeps its exit code" | Child exits 7; parent empty. Fails before and with only `afterAll`. |
| `REQ-cli-711` | full `bun test` with a fresh `TMPDIR` | 0 entries left (before: 519 / 41M); suite passes. |
| `REQ-cli-262` | `tests/preload.operator-data-dir.test.ts` | Data dir still the preload's own (now inside the run root), operator dir untouched; unchanged and passing. |
