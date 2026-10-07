---
change: with-only-the-daemon-running-and-no-bridge-a-scheduled-run-s-question-still-reaches-me-by-dm-autonomous-7-a
artifact: testing
---

# Testing

`tests/daemon.owner-dm.test.ts` (12 tests) and `tests/discord.rest-dm.test.ts`
(5 tests). In-memory or temp SQLite, injected agents, a recording DM sender, a
fake Discord REST client (`DiscordRestClient`) and a null gateway for the
bridge; no network, no live Discord. Every `bun test` / verify run used a
private `TMPDIR` (`mktemp -d /home/user/coord/tmp/b.XXXXXX`, removed after).

Fail-on-base proof: with main's (85871fa) `src/` swapped in (and the new
`src/discord/rest-dm.ts` moved away), `bun test tests/daemon.owner-dm.test.ts
tests/discord.rest-dm.test.ts` gave 0 pass, 13 fail: all 12 cases of
`tests/daemon.owner-dm.test.ts` fail (no DM, no `schedule_ask.*` log, no
`ownerDm` on `daemon.started`, no REST call) and `tests/discord.rest-dm.test.ts`
cannot load. Restored: 17 of 17 pass, and the related suites (`daemon`,
`scheduler.ask-outbox`, `scheduler.ask-block`, `docs.operator-facts`) pass.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-707` | `tests/daemon.owner-dm.test.ts` ("a stuck run's question reaches the owner by DM once …") | One DM to the owner: schedule line, stuck headline, quoted question, no `<@`, the daemon note naming `<#channel>`, ≤ 1900 chars; `ask_posted_at` set, `pendingAsks()` empty, the ask still open; `schedule_ask.dm_sent` with `scheduleId` / `runId` / `reason`; later ticks send nothing; a bridge-wired scheduler on the same DB posts and DMs nothing. Fails on base. |
| `REQ-discord-707` | `tests/daemon.owner-dm.test.ts` ("a clarify question of a schedule with no channel …") | Clarify headline and quoted question, no mention, note says `here`; the next due run is skipped (AUTONOMY-6.a) and nothing more is DMed. Fails on base. |
| `REQ-discord-707` | `tests/daemon.owner-dm.test.ts` ("while a bridge runs on the data dir nothing is DMed …") | `bridgeLive` true: no DM, `ask_posted_at` null, one pending ask; a throwing check: no DM; false: DMed on the next tick and taken. Fails on base. |
| `REQ-discord-707` | `tests/daemon.owner-dm.test.ts` ("no bot token …", "no owner configured …") | Nothing taken (`ask_posted_at` null); exactly one `schedule_ask.dm_unavailable` (warn) with `reason` `no-token` (message names `DISCORD_TOKEN`) / `no-owner` over several ticks. Fail on base. |
| `REQ-discord-707` | `tests/daemon.owner-dm.test.ts` ("a DM that does not go out hands the ask back …") | A null and a throwing DM each hand the ask back and log `schedule_ask.dm_failed` (`retryInMinutes` 5); no try within the 5-minute wait; sent once after it (`dm_sent` once). Fails on base. |
| `REQ-discord-707` | `tests/daemon.owner-dm.test.ts` ("a creator or channel the live allowlist refuses …") | With the channel removed from the live allowlist no DM and the ask pending; put back, DMed. Fails on base. |
| `REQ-discord-707` | `tests/daemon.owner-dm.test.ts` ("the question is scrubbed, defanged and quoted …") | A `ghp_`-shaped secret is redacted, `@everyone` (schedule name) and `@here` (question) defanged, the question's lines quoted. Fails on base. |
| `REQ-discord-707` | `tests/daemon.owner-dm.test.ts` ("a spend-cap stop DMs its details once per cap episode …") | First stop: `Only you see these details (SAFE-14.a)`, `In <#channel>:`, the quoted cap question, the note; a second schedule's stop in the same episode: headline only, no details, the note. Fails on base. |
| `REQ-discord-707` | `tests/daemon.owner-dm.test.ts` ("a stop that outlasts a DM in flight hands its ask back …") | `settleAskDelivery(20)` false, `ask_posted_at` back to null; the DM then resolving takes it again. Fails on base. |
| `REQ-discord-707` | `tests/discord.rest-dm.test.ts` (all 5) | Routes `/users/@me/channels` (`recipient_id`) then `/channels/<id>/messages` (defanged content, `allowed_mentions.parse = []`); over-cap content, a non-snowflake user id, responses without an id → null (no call when refused early); a REST error → null with one scrubbed `onError` line; a throwing `onError` never throws; `formatScheduleAskDaemonNote` text with `<#id>` / `here`. Cannot load on base. |
| `REQ-discord-347` | `tests/daemon.owner-dm.test.ts` ("a stuck run's question reaches the owner by DM once …"; the daemon + bridge case) | A DMed ask is not posted by a bridge-wired ticker; once the schedule is due again the bridge posts only the wait note, with the controls. The existing `tests/scheduler.ask-outbox.test.ts` cases (a daemon without `ownerDm` never takes or posts; the bridge posts a pending ask once) still pass. Fails on base. |
| `REQ-cli-707` | `tests/daemon.owner-dm.test.ts` ("a stuck run's question goes to the owner by DM (no gateway) …") | `daemon.started` `ownerDm: "on"`; `run.needs_human`, `schedule_ask.dm_sent`; the fake REST client sees both routes with the owner's id, the question, the note, `allowed_mentions.parse = []`, no components; no log line has the token; a bridge started later posts only the wait note (with Cancel) to the channel and DMs nothing. Fails on base. |
| `REQ-cli-707` | `tests/daemon.owner-dm.test.ts` ("with no bot token the daemon says so once …") | `ownerDm: "no-token"`, no REST call, one `schedule_ask.dm_unavailable` (`no-token`) over two ticks, the ask pending. Fails on base. |
| `REQ-cli-707` | `tests/docs.operator-facts.test.ts` ("the Logs table has a row for every event the daemon logs") | `docs/DAEMON.md` has rows for `schedule_ask.dm_error` and the other new events. |
| `REQ-cli-098` | `tests/daemon.owner-dm.test.ts` (both daemon cases), `tests/scheduler.ask-outbox.test.ts` ("the daemon logs run.needs_human and leaves the ask pending; the bridge's scheduler tick posts it …") | With a token and owner and no bridge the daemon DMs and takes the ask; without a token it stays pending and a bridge posts it once. |

Gates: `specsync change check --commit`, `specsync change audit`,
`specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`,
`bun test`, `fledge lanes run verify --non-interactive`.
