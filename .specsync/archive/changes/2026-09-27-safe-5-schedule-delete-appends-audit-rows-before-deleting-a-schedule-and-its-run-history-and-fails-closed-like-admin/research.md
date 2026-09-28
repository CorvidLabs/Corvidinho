---
change: safe-5-schedule-delete-appends-audit-rows-before-deleting-a-schedule-and-its-run-history-and-fails-closed-like-admin
artifact: research
---

# Research

- `ScheduleStore.delete` (`src/scheduler/store.ts`) removes the cached
  schedule and runs `DELETE FROM schedule_runs WHERE schedule_id = ?` and
  `DELETE FROM schedules WHERE id = ?`; nothing else deletes schedules, and
  the CLI/daemon has no schedule delete path.
- `/admin` (`command-handlers/admin.ts`) already writes `started` before its
  change and fails closed both when `recordAudit` throws and when it is unset
  ("no audit database is wired to this bridge"), then writes `ok`/`error` best
  effort, and `denied` for refusals.
- The bridge wires `recordAudit` to `appendAudit(db, entry, { key:
  auditKeyFromEnv(env) })` whenever it has a DB; a bridge started with a real
  data dir always has one, so fail closed only bites test harnesses that
  inject stores, or a keyed chain on a process without the key (appendAudit
  throws "audit chain is keyed; appending needs CORVIDINHO_AUDIT_HMAC_KEY").
- `/schedule` has no dispatcher permission floor (list stays open), so the
  handler's `requireAdmin` is the only ADMIN gate a non-owner delete reaches;
  recording `denied` there mirrors `/admin`'s handler re-check.
- No open issue tracks SAFE-5 (#95 closed).
