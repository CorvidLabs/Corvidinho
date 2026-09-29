# Lesson bundle — schedule-result-and-ask-posts-name-the-project-never-its-absolute-host-path-a-tampered-unkeyed-audit-chain-reads-chain

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Schedule result and ask posts name the project, never its absolute host path; a tampered unkeyed audit chain reads chain BROKEN at #N without an HMAC key
- **Kind**: BugFix
- **Specs**: discord, plugins
- **Paths**: src/scheduler/service.ts, tests/scheduler.ask-outbox.test.ts, src/audit/log.ts, tests/audit.log.test.ts, specs/discord/discord.spec.md, specs/discord/requirements.md, specs/discord/testing.md, specs/plugins/plugins.spec.md, specs/plugins/requirements.md, specs/plugins/testing.md, docs/discord.md, docs/DISCORD-GO-LIVE.md
- **Acceptance**: Every schedule channel post (the result line and every ask post, including the pre-run stuck ask of REQ-discord-353 and a daemon run's ask posted by the bridge's delivery pass) starts with Schedule **<name>** (<id>) on <project name>, the project shown by projectLabel (last segment of an absolute path, a relative name as given) and never the absolute host path; the run row keeps the full error and the model's prompt keeps the stored project; without CORVIDINHO_AUDIT_HMAC_KEY a tampered unkeyed audit row found before any keyed row reads Audit: N entries · chain BROKEN at #n (the same line as with a key) on the bridge start log and /status, while stopping at a keyed row without the key still reads cannot verify keyed rows (CORVIDINHO_AUDIT_HMAC_KEY not set); regression tests fail on main and pass here; no new env var, config key, command, option, table or schema change

## Evidence

- Verification commit: `53f2e5df126fb01632b641ba57f51997aea8660e`
- Base commit: `5366fff96501327ad3bcc30f55105f2c16884b0b`
- Verified by: `specsync check --spec discord --spec plugins`

## From the change's context.md

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

## From the change's design.md

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

## From the change's testing.md

# Testing

With the base's `src/scheduler/service.ts` and `src/audit/log.ts`
(`5366fff`) swapped in, `bun test tests/audit.log.test.ts
tests/scheduler.ask-outbox.test.ts` gives 33 pass and 3 fail: the pre-run
stuck ask's first line is ``Schedule **Nightly** (`sched_…`) on
`/tmp/corvidinho-prerun-abs-…/gone`:``, the result and ask posts on
`/srv/host-only/acme/Widget` carry the absolute path, and the tampered
unkeyed chain reads `Audit: 3 entries · cannot verify keyed rows
(CORVIDINHO_AUDIT_HMAC_KEY not set)`. With the fix (files restored): 36
pass, 0 fail.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-353` (pre-run stuck ask names the project) | `tests/scheduler.ask-outbox.test.ts` | a daemon run on an absolute sibling project `<tmp>/gone` that cannot be resolved spawns no agent, keeps `project resolve failed: project path not found: <tmp>/gone …` on the row with the fixed question; the bridge's tick posts one ask whose first line is ``Schedule **Nightly** (`<id>`) on `gone`:``, quotes `PROJECT_RESOLVE_FAILED_QUESTION`, pings the owner and does not contain the temp dir. |
| `REQ-discord-353` / `REQ-discord-418` / SAFE-6 (result and ask posts) | `tests/scheduler.ask-outbox.test.ts` | on project `/srv/host-only/acme/Widget`: the `✅` post, the `❌` post, a bridge clarify ask, a bridge stuck ask and a daemon-claimed stuck ask posted by the delivery pass all start with the prefix naming `` `Widget` `` and none contains `/srv/host-only`; the model's prompt contains `on project: /srv/host-only/acme/Widget`. |
| `REQ-discord-353` (earlier cases) | `tests/scheduler.ask-outbox.test.ts`, `tests/discord.ask-ping.test.ts`, `tests/discord.spend.test.ts`, `tests/discord.allowed-mentions.test.ts` | every existing assertion on `Schedule **Nightly**` (relative project `proj-a`, shown as given) passes unchanged. |
| `REQ-plugins-095` / `REQ-discord-095` (BROKEN without a key) | `tests/audit.log.test.ts` | three unkeyed rows read `Audit: 3 entries · chain OK (unkeyed — set CORVIDINHO_AUDIT_HMAC_KEY)`; with row 2's actor changed behind the dropped trigger, `verifyAudit(db)` is `{ok:false, count:3, keyedRows:0, keyAvailable:false, brokenAtSeq:2}` and the line is `Audit: 3 entries · chain BROKEN at #2`, the same as `verifyAudit(db, "k")`; an unkeyed prefix before a keyed row tampered at row 1 reads `chain BROKEN at #1`. |
| `REQ-plugins-095` (keyed rows still unverifiable without the key) | `tests/audit.log.test.ts` | an intact unkeyed prefix before a keyed row and a keyed chain, both read without the key, read `cannot verify keyed rows (CORVIDINHO_AUDIT_HMAC_KEY not set)` (`keyedRows: 1, brokenAtSeq: 1` for the keyed chain); the existing keyed tamper, append-only and status-line tests pass unchanged. |

## Automated coverage

- `bunx tsc --noEmit` — passed.
- `bun test` (Bun 1.4.2) — see the change check record.
- `specsync check --require-coverage 100` — passed.
- `hi check` — passed.
- `fledge lanes run verify --non-interactive` — green (see the change check record).

## Where these lessons go

- `specs/discord/context.md`
- `specs/plugins/context.md`
