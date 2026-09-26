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
| `REQ-discord-098` | `tests/discord.spend.test.ts` "a run resumed by a button pick that stops at the cap …" | after merging #198 (button asks), the reply to a button-pick run at the cap is free text with no components, pings the owner, carries a warning recorded meanwhile, and leaves no pending ask. |
| `REQ-discord-098` | `tests/discord.spend.test.ts` "collapsed answer (DISCORD-ASK-6/7) …" — "the 80% warning and the owner mention ride the edit …" | after merging #204, the thinking message is edited into the answer with the warning line and `mentionUserIds` `[owner]`, no separate reply, and the next answer carries no warning. |
| `REQ-discord-098` | `tests/discord.spend.test.ts` "a spend-cap stop collapses to plain text …" | collapsed spend-cap ask: owner pinged on the first, not the second, no components, no reply hint, no pending ask. |
| `REQ-discord-098` | `tests/discord.spend.test.ts` "collapsed edit fails → …" | edit fails → fallback reply carries the ping and the warning; edit and reply both fail → the next collapsed answer carries both (claims handed back). Fails when the finally-release or the warning on the edit is removed. |
| `REQ-discord-098` | `tests/discord.spend.test.ts` "a button pick whose run stops at the cap collapses the stub …" | the Choose stub is edited into the plain-text spend-cap ask (components cleared) with the owner pinged; no pending ask. |
| `REQ-discord-098` | `tests/discord.spend.test.ts` "chat: a spend-cap reply that failed to post …" | first reply not posted; the second reply pings the owner in the same episode. |
| `REQ-discord-098` | `tests/discord.spend.test.ts` "schedule: a spend-cap post that failed …" | post resolves `false`: no ping key stored; next tick's post pings the owner. |
| `REQ-discord-098` | `tests/discord.spend.test.ts` "a spend-cap stop is not the pending ask …" | no `pendingAsk` after a cap stop; `ok` runs the agent (ask again, no mention); a substantive reply's prompt has no "Prior clarifying question" or cap text. |
| `REQ-discord-098` | `tests/discord.spend.test.ts` "a spend-cap ask persisted as pending by an earlier build …" | a stored spend-cap `pending_ask` loads as null; a stored clarify ask loads unchanged. |
| `REQ-discord-098` | `tests/discord.spend.test.ts` (existing spend-cap / warning / `replyWithOwnerNotice` tests), `tests/discord.ask-ping.test.ts`, `tests/discord.thin-ack.test.ts` | unchanged behaviour: once-per-episode ping, fresh-post notice, append fallback, AUTONOMY-4..6 thin-ack/cancel for clarify and stuck asks. |

Full suite: `bunx tsc --noEmit`, `bun test`, `specsync check
--require-coverage 100`, `specsync change audit`, `fledge lanes run verify
--non-interactive`.
