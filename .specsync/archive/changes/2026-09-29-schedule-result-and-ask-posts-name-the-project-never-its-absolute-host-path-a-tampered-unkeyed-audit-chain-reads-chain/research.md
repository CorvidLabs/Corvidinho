---
change: schedule-result-and-ask-posts-name-the-project-never-its-absolute-host-path-a-tampered-unkeyed-audit-chain-reads-chain
artifact: research
---

# Research

- Every place a schedule post names the project: `grep -n scheduleTitle
  src/scheduler/service.ts` — the `✅` / `❌` post in `runOne` and the
  `prefix` of `postRunAsk`, which both `postOwnRunAsk` (in-process) and the
  delivery pass use. No other scheduler or bridge post prints
  `schedule.project` (`grep -rn '\.project\b' src/discord src/scheduler
  src/daemon`); `/schedule create`'s reply is ephemeral to the owner.
- `projectLabel` (`src/discord/list-scope.ts`) is the REQ-discord-418 helper
  already used by `/schedule list` and `/session list` for non-ADMIN
  members; reusing it keeps one definition of "project name".
- `resolveProjectDir` accepts an absolute path inside the default root or a
  sibling of it, so an absolute stored project is reachable today (the seed
  repro: `${base}/gone` next to `${base}/root`).
- Audit: `verifyAudit` returns early with `keyAvailable: false` at the first
  keyed row when no key is set (`keyedRows >= 1` there); every other failure
  without a key is a hash/`prev_hash` mismatch on an unkeyed row before any
  keyed row (a downgrade needs `keyedRows > 0`, which without a key already
  returned), so `keyedRows === 0` identifies it. `formatAuditLine` has one
  caller, the bridge's `auditLine` (`src/discord/bridge.ts`), which feeds the
  start log, `/status` and `/admin config show`.
