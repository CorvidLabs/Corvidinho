---
change: bun-test-keeps-every-temp-dir-it-makes-under-one-per-run-root-in-tmpdir-and-removes-that-root-when-the-run-ends-instead
artifact: tasks
---

# Tasks

- [x] Reproduce on main (5093b81): full `bun test` with a fresh `TMPDIR` leaves 519 entries / 41M there.
- [x] Probe Bun 1.4.2: `tmpdir()` honours a `TMPDIR` set at runtime in the same process; `bun test` fires no `exit` / `beforeExit` / `unload` event at the end (pass or fail); a preload `afterAll` fires before the end under `--rerun-each` and `--parallel --no-isolate`; `--isolate` SIGTERMs a file's leftover children.
- [x] Regression test `tests/preload.tmp-cleanup.test.ts` + probe `tests/fixtures/preload-tmp-probe.ts` written; all 7 cases fail with main's preload.
- [x] Preload: one `corvidinho-test-run-*` root, `TMPDIR` / `TMP` / `TEMP` pointed at it first, scratch data dir inside it.
- [x] Review fix: replace the preload `afterAll` removal (failed `--rerun-each` / `--parallel --no-isolate` runs with ENOENT; leaked on `--bail` and signals) with a pipe-EOF watcher plus the `exit` hook; the `--bail`, SIGKILL and `--rerun-each` cases fail on the `afterAll` version.
- [x] Full `bun test` with a fresh `TMPDIR` passes and leaves 0 entries there; with `TMPDIR` unset and a private empty `/tmp`, nothing but Bun's own `bun-node-<rev>` dir (main: 520 entries / 41M).
- [x] Spec: cli files list (new test + probe), Public API line, testing.md entry, delta REQ-cli-711 (Added).
- [x] tsc, bun test, SpecSync checks, `hi check` and `fledge lanes run verify --non-interactive`.
