---
change: shared-db-open-and-safe-5-audit-append-retry-a-busy-sqlite-lock-every-millisecond-so-other-processes-committing-back-to
artifact: docs
---

# Docs

- `specs/plugins/plugins.spec.md` Invariants: "SAFE-5 appends under
  contention (REQ-plugins-287)".
- `specs/discord/discord.spec.md` Invariants: how `openCorvidinhoDb`
  opens (one transaction under `retryWhileBusy`) and what
  `retryWhileBusy` does.
- `tests/store.busy-lock.test.ts` header explains the back-off and the
  brief-release children.
- No operator doc, CHANGELOG, STATUS or package.json change: nothing to
  configure, and the release PR writes release notes.
