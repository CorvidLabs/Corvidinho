---
change: schedule-result-and-ask-posts-name-the-project-never-its-absolute-host-path-a-tampered-unkeyed-audit-chain-reads-chain
artifact: design
---

# Design

Scheduler (`src/scheduler/service.ts`):

- `scheduleTitle` shows `projectLabel(schedule.project) ?? ""` — the helper
  `/schedule list` and `/session list` already use for non-ADMIN members
  (`src/discord/list-scope.ts`): an absolute path becomes its last segment, a
  relative name is kept as given, an empty or bare `/` project shows empty
  (as an empty project did before). `scheduleTitle` is the only place a
  schedule post names the project (the `✅` / `❌` post and `postRunAsk`'s
  `formatAskReply` prefix, used by both the in-process ask post and the
  delivery pass), so one change covers every schedule post.
- The label is used for everyone, the owner included: a channel post is read
  by the whole channel, so there is no per-viewer ADMIN view here (the owner
  still sees the full path in `/schedule list`).
- The model prompt (`Scheduled work "<name>" on project: <stored project>`)
  and the run row's `project resolve failed: …` error are unchanged.
- `service.ts` already imports `src/discord/permissions.ts`; `list-scope.ts`
  imports only that and a type, so no import cycle is added.

Audit (`src/audit/log.ts`):

- `formatAuditLine` reads `chain BROKEN at #N` when `v.keyAvailable ||
  v.keyedRows === 0`, else `cannot verify keyed rows (…)`. `verifyAudit`
  counts rows incrementally and returns at the first failure, so without a
  key `keyedRows` is 0 exactly when the break came before any keyed row (a
  SHA-256 link it could check), and at least 1 only on the
  keyed-row-without-key early return. `verifyAudit` and `AuditVerify` are
  unchanged, so `ok: false` stays fail-closed for every caller.
