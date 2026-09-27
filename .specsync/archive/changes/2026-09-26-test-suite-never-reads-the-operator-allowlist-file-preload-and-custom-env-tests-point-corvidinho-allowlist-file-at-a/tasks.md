---
change: test-suite-never-reads-the-operator-allowlist-file-preload-and-custom-env-tests-point-corvidinho-allowlist-file-at-a
artifact: tasks
---

# Tasks

- [x] Reproduce: operator file admitting corvidlabs gives 2 failures via `CORVIDINHO_ALLOWLIST_FILE` and 3 via a temp HOME file; 2 api.github.com requests with a token set.
- [x] Preload always points `CORVIDINHO_ALLOWLIST_FILE` at a missing file (HOME untouched).
- [x] Review/write/deny.cli GitHub gate tests and six custom-env `startBridge` calls pass an explicit missing file.
- [x] deny.cli "reaches auth/API layer" never forwards a token; asserts the missing-token exit.
- [x] Malformed/unreadable allowlist file case at the plugin gate.
- [x] REQ-plugins-253 wording (Modified delta).
- [x] tsc, full test suite (plain, with the operator file both ways, with a token behind a logging proxy), SpecSync checks and the verify lane.
