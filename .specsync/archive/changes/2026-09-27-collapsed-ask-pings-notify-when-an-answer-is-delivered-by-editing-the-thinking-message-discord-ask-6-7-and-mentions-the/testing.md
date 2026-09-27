---
change: collapsed-ask-pings-notify-when-an-answer-is-delivered-by-editing-the-thinking-message-discord-ask-6-7-and-mentions-the
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-215` | `tests/discord.collapsed-ping.test.ts` | 17 tests. Formatter: requester → "↑ question for you", owner → "↑ needs you", both on one line, ids trimmed/deduped, `alreadyPinged` removed, nobody left → null. Bridge (fake gateway reply + fake thinking outbound with `editMessage`): collapsed chat clarify (free text and Choose stub) → exactly one fresh post `<@R> ↑ question for you` replying to the edited answer, allowed mentions exactly [R], one line, no components, no mass/role mention, and a reply to it maps to the session; collapsed stuck → one owner-only `<@O> ↑ needs you`; clarify + pending 80% warning → one post pinging R and O; two spend-cap stops in one episode → one owner ping; no mention → no post; fallback reply (no `editMessage`) → only the answer; failed ping post → turn finishes, answer stays; button pick that gets stuck → one owner ping replying to the stub; button pick answered with no mention → no post; `/work` clarify collapsed → one requester ping, no owner notice; `/session start` clarify by the owner with a pending warning → only the #160 owner notice; `/work` at the cap with a warning → exactly one owner post (the notice); `/work` stuck whose notice post fails and rides the collapsed answer → one owner ping; slash fallback → no ping post. On main (formatter import removed) 9 bridge tests fail and the 6 no-extra-post cases pass; 17/17 after. |
| `REQ-discord-215` | `tests/discord.spend.test.ts` | Collapsed chat answer with the 80% warning → one owner ping post replying to it, none on the next answer; the in-flight test counts that ping; collapsed spend-cap stops ping once per episode; `/session start` clarify → the requester ping after the stuck run's owner notice. |
| `REQ-discord-215` | `tests/discord.ask-ping.test.ts`, `tests/discord.ask-ephemeral.test.ts`, `tests/discord.thin-ack.test.ts`, `tests/discord.inflight-replies.test.ts` | Collapsed clarify / stuck / Choose stub answers now expect the one fresh ping post (requester or owner, exact mentions) instead of no post; the thin-ack restatement is the second reply. |

Also run: `bunx tsc --noEmit`, full `bun test` (twice),
`specsync check --require-coverage 100`,
`fledge lanes run verify --non-interactive`.
