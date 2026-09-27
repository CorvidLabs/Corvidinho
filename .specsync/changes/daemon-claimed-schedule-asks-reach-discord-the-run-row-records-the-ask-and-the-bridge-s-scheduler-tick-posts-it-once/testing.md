---
change: daemon-claimed-schedule-asks-reach-discord-the-run-row-records-the-ask-and-the-bridge-s-scheduler-tick-posts-it-once
artifact: testing
---

# Testing

Fixture tests only: in-memory and temp-file SQLite, injected agents, a null
gateway through `startBridge`; no live Discord, no network, no token, no git
worktrees.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-347` | `tests/scheduler.ask-outbox.test.ts` | Daemon-wired + bridge-wired schedulers on one DB: a daemon stuck run stores `ask_reason` `stuck`, the question and `ask_posted_at` null and posts nothing; the bridge's next tick posts it once (prefix, "I'm stuck" headline, question, `<@owner>`, `mentionUserIds` [owner]) and records the ping key; two more ticks post nothing. Clarify mentions only the schedule creator. Spend-cap pings the owner with the pending 80% warning and no reply hint; a second one in the episode and one in an episode already pinged elsewhere post without a ping. The same question pings once; of two pending asks only the newest posts. A later clean run, or deleting the schedule, leaves 0 posts. A refused channel: 0 posts, ask still pending. A post resolving `false`, then one throwing (`[scheduler] ask failed: gateway down` logged), then one succeeding: posted once on the third tick with the ping. A bridge-claimed run posts once and never again; two bridge tickers post a pending ask once. A channel-less schedule's ask is never delivered. All 13 tests fail on main's sources (bridge ticks make 0 posts; no ask columns) and pass on the branch. |
| `REQ-discord-347` (schema, SAFE-6) | `tests/scheduler.ask-outbox.test.ts` | `SCHEMA_VERSION` 11; a v10 DB (columns dropped) migrates to v11 keeping its run, which has no pending ask; a GitHub-token-shaped secret in the question is `[redacted:github-token]` at rest and absent from the post; `SCRUB_TARGETS` lists `ask_question` and `rescrubDatabase` re-scrubs a raw one. |
| `REQ-discord-108` | `tests/scheduler.ask-outbox.test.ts`, `tests/scheduler.claim.test.ts` | Two bridge tickers on one DB post a pending ask once (atomic `claimRunAsk`); the existing claim / column-ownership tests still pass. |
| `REQ-cli-098` | `tests/scheduler.ask-outbox.test.ts`, `tests/discord.spend.test.ts` | `startDaemon` on a temp data dir logs `run.needs_human` (`reason` `stuck`) and posts nothing; a `startBridge` on the same data dir (20 ms scheduler poll, null gateway) posts the ask to the owner once (0 replies on main). The existing daemon `spend.warning` / `run.needs_human` (`spend-cap`) test still passes. |
| `REQ-discord-044` / `REQ-discord-098` | `tests/discord.ask-ping.test.ts`, `tests/discord.spend.test.ts` | The bridge-claimed schedule ask suites (ping once per question, clarify → creator, no-owner warning, spend-cap episode, failed post hands back the warning and cap ping) pass unchanged after `postRunAsk` was extracted. |

Pinned schema assertions updated: `tests/scheduler.never-stuck.test.ts`
(`>= 10`), `tests/watch.session-store.durable.test.ts` (`11`).

Full suite: `bun test` green; `bunx tsc --noEmit` clean;
`specsync check --require-coverage 100` 100%; `fledge lanes run verify
--non-interactive` completed.
