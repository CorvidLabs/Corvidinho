---
change: bun-test-keeps-every-temp-dir-it-makes-under-one-per-run-root-in-tmpdir-and-removes-that-root-when-the-run-ends-instead
artifact: tasks
---

# Tasks

- [x] Reproduce on main (5093b81): full `bun test` with a fresh `TMPDIR` leaves 519 entries / 41M there.
- [x] Probe Bun 1.4.2: `tmpdir()` honours a `TMPDIR` set at runtime in the same process; `bun test` fires no `exit` event at the end (pass or fail) but runs a preload `afterAll` once after the last file; `process.exit()` in a test fires `exit` and skips `afterAll`.
- [x] Regression test `tests/preload.tmp-cleanup.test.ts` + probe `tests/fixtures/preload-tmp-probe.ts` written; all 4 cases fail with main's preload.
- [x] Preload: one `corvidinho-test-run-*` root, `TMPDIR` / `TMP` / `TEMP` pointed at it first, scratch data dir inside it, best-effort removal from `afterAll` and `exit`.
- [x] Each hook alone fails a case (exit only: pass and fail runs leak; afterAll only: `process.exit()` leaks).
- [x] Full `bun test` with a fresh `TMPDIR` passes and leaves 0 entries there.
- [x] Spec: cli files list (new test + probe), Public API line, testing.md entry, delta REQ-cli-711 (Added).
- [x] tsc, bun test, SpecSync checks, `hi check` and `fledge lanes run verify --non-interactive`.
