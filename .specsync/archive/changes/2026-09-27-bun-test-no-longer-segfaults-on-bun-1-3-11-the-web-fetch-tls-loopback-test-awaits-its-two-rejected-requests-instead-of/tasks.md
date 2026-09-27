---
change: bun-test-no-longer-segfaults-on-bun-1-3-11-the-web-fetch-tls-loopback-test-awaits-its-two-rejected-requests-instead-of
artifact: tasks
---

# Tasks

- [x] Reproduce the suite crash on Bun 1.3.11 and capture core dumps (same fault site in every capture)
- [x] Find the trigger: `expect(promise).rejects` in the TLS test re-enters the event loop inside a TLS socket callback
- [x] Reproduce it on the unmodified file: `bun test --rerun-each 40 tests/web.transport.test.ts` crashes 10/10
- [x] Check Bun 1.4.2 (CI pin): no crash
- [x] In `tests/web.transport.test.ts`, replace the two TLS `.rejects.toThrow()` calls with a plain awaited capture plus `toBeInstanceOf(Error)`
- [x] Prove: `--rerun-each 40` 0/20 crashes; full `bun test` with no crashes
- [x] `specsync check --require-coverage 100`, `specsync change audit`, `bunx tsc --noEmit`, `fledge lanes run verify --non-interactive` green
