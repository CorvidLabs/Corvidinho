---
change: schedule-result-and-ask-posts-name-the-project-never-its-absolute-host-path-a-tampered-unkeyed-audit-chain-reads-chain
artifact: testing
---

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
