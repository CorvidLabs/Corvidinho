---
change: safe-8-review-follow-up-for-pr-160-issue-98-a-post-that-did-not-go-out-hands-back-the-80-spend-warning-and-the-spend
artifact: testing
---

# Testing

Fixtures only: in-memory SQLite, a fake gateway (optionally failing posts),
fake slash interactions whose `editReply` throws, an in-memory
`ScheduleStore` with a failing outbound. No network, no real Discord.
Every new test below failed on the previous code (10 failures) and passes
now.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-098` | `tests/agent.spend-ask.test.ts` "80% at T0 → 72% → 96% …" | a warning recorded at 80% is not taken at 72% (`takeWarning` null), `noteWarning` stays null at 96% (same crossing), the next take delivers `{ 4.8M of 5M, 96% }` once, and only one `warn` row exists. |
| `REQ-agent-098` | `tests/agent.spend-ask.test.ts` "a warning recorded by another run is claimed once …" | claim once, release, re-take; a post while spend is back at 46% leaves the new warning pending (`n: 1`). |
| `REQ-agent-098` | `tests/agent.spend-ask.test.ts` "claimCapPing: once per cap episode …" and "claimCapPing: a released claim …" | one claim per episode, re-armed under 70% / after 24 h; a released claim lets the next claim in the same episode succeed. |
| `REQ-discord-098` | `tests/discord.spend.test.ts` "/work whose final reply fails (expired token) …" | `editReply` throws; the fresh channel post still pings the owner with the spend-cap line and the pending warning, and `onSlash` rejects with the reply error. |
| `REQ-discord-098` | `tests/discord.spend.test.ts` "/session start whose reply and notice both fail …" | reply throws and the gateway post fails; the next chat reply pings the owner (`SPEND_CAP_HEADLINE <@owner>`) and carries the warning. |
| `REQ-discord-098` | `tests/discord.spend.test.ts` "chat: a spend-cap reply that failed to post …" | first reply not posted; the second reply pings the owner in the same episode. |
| `REQ-discord-098` | `tests/discord.spend.test.ts` "schedule: a spend-cap post that failed …" | post resolves `false`: no ping key stored; next tick's post pings the owner. |
| `REQ-discord-098` | `tests/discord.spend.test.ts` "a spend-cap stop is not the pending ask …" | no `pendingAsk` after a cap stop; `ok` runs the agent (ask again, no mention); a substantive reply's prompt has no "Prior clarifying question" or cap text. |
| `REQ-discord-098` | `tests/discord.spend.test.ts` "a spend-cap ask persisted as pending by an earlier build …" | a stored spend-cap `pending_ask` loads as null; a stored clarify ask loads unchanged. |
| `REQ-discord-098` | `tests/discord.spend.test.ts` (existing spend-cap / warning / `replyWithOwnerNotice` tests), `tests/discord.ask-ping.test.ts`, `tests/discord.thin-ack.test.ts` | unchanged behaviour: once-per-episode ping, fresh-post notice, append fallback, AUTONOMY-4..6 thin-ack/cancel for clarify and stuck asks. |

Full suite: `bunx tsc --noEmit`, `bun test`, `specsync check
--require-coverage 100`, `specsync change audit`, `fledge lanes run verify
--non-interactive`.
