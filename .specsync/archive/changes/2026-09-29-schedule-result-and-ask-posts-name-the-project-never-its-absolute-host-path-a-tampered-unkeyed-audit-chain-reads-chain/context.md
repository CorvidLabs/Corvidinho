---
change: schedule-result-and-ask-posts-name-the-project-never-its-absolute-host-path-a-tampered-unkeyed-audit-chain-reads-chain
artifact: context
---

# Context

Two W12 bug-sweep seeds, confirmed in Leif's 2026-09-28 interview (Wave 0:
no new criteria; kind bug-fix; fail-on-main tests for each):

- `schedule-post-shows-absolute-project-path` (minor). `scheduleTitle` in
  `src/scheduler/service.ts` printed the stored `schedule.project` verbatim:
  ``Schedule **name** (`id`) on `<project>` ``. It prefixes every `✅` / `❌`
  result post and every schedule ask post. `/schedule create` stores the raw
  `project` option, and `resolveProjectDir` accepts an absolute path inside
  the default root or next to it, so the stored project can be an absolute
  host path. The create reply is ephemeral; the channel posts are where the
  path went public. REQ-discord-353 already said the pre-run stuck ask posts
  "without the host path", and its test passed only because it used a
  relative project (`missing-proj`). REQ-discord-418 already keeps absolute
  paths out of `/schedule list` for non-ADMIN users via `projectLabel`.
- `audit-line-hides-tampered-unkeyed-chain` (minor). With no
  `CORVIDINHO_AUDIT_HMAC_KEY`, a hash or `prev_hash` mismatch on an unkeyed
  row returned `keyAvailable: false`, and `formatAuditLine` picked its text
  only by `keyAvailable`, so every break without a key read
  `cannot verify keyed rows (CORVIDINHO_AUDIT_HMAC_KEY not set)` even when
  the chain had no keyed row at all. That line is the bridge start log and
  the `/status` line. REQ-discord-095 lists `BROKEN at #n` and REQ-plugins-095
  says verify reports the first tampered row.

Constraints: bug fix only; no new env var, config key, command, option,
table, schema version or package bump; no CHANGELOG/STATUS edit; #232/#233
scope untouched; no hi capture (no new criteria).
