---
change: docs-operator-docs-match-the-code-help-and-the-go-live-checklist-say-empty-discord-user-role-allowlists-admit-anyone-in
artifact: tasks
---

# Tasks

- [x] Regression checks in `tests/docs.operator-facts.test.ts` (6 of 29 fail with the base's `src/cli.ts`, `src/discord/config.ts` and `docs/DAEMON.md`; each of the two code files alone fails the two user/role checks).
- [x] `src/cli.ts` `--help`: channel row + users/roles row; header says default-deny.
- [x] `src/discord/config.ts` `goLiveChecklist()` item 3 reworded.
- [x] `docs/DAEMON.md`: `daemon.start_failed` and `spend.warning` rows; the Configuration allowlist row says what empty lists do for schedules.
- [x] Specs: `specs/cli/testing.md`, `specs/discord/testing.md`; deltas REQ-cli-005, REQ-cli-108, REQ-discord-005 (Modified).
- [x] SpecSync approve / check / audit / coverage, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.
