---
change: schedule-result-and-ask-posts-name-the-project-never-its-absolute-host-path-a-tampered-unkeyed-audit-chain-reads-chain
artifact: tasks
---

# Tasks

- [x] Reproduce both seeds on `5366fff` with regression tests: the absolute-project schedule posts carry the host path; a tampered unkeyed chain without a key reads `cannot verify keyed rows`.
- [x] Regression tests: two cases in `tests/scheduler.ask-outbox.test.ts` (absolute sibling project that cannot be resolved; `✅` / `❌` / clarify / stuck / daemon-claimed ask posts on an absolute project, prompt keeps the path) and one in `tests/audit.log.test.ts` (unkeyed, mixed and keyed chains without a key); all 3 fail on the base and pass here.
- [x] `scheduleTitle` shows `projectLabel(schedule.project)`; `formatAuditLine` reads BROKEN when `keyAvailable || keyedRows === 0`.
- [x] Deltas modify REQ-discord-353 and REQ-plugins-095 (full text plus a paragraph and an AC bullet each); spec invariants and testing sections; `docs/discord.md` and `docs/DISCORD-GO-LIVE.md`.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.
