---
change: work-and-session-start-answer-an-ask-whose-choices-fit-a-short-list-with-the-chat-s-choose-stub-and-ephemeral-pick-free
artifact: testing
---

# Testing

Fixture tests only: `startBridge` with a null gateway, in-memory thinking
outbound, injected agents and fake slash / component interactions; no live
Discord, no network, no token.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-044` | `tests/discord.slash-choose-ask.test.ts` | `/work` clarify ask with options: task `blocked`; the collapsed answer has the Choose hint and requester mention, no question / option / reply hint, components = one Choose button; deferred reply deleted; one `↑ question for you` ping; pending ask = the ask with options, `stubMessageId` = answer id; Choose press → ephemeral question + pick buttons; pick → second run, same session, `resume: true`, `humanText` `Postgres`, prior question in the prompt, pending cleared, answer edited into the stub. `/session start` with a numbered list: stub, parsed options `Postgres` / `SQLite`, pick resumes the same session. Thin reply to the stub restates it with the Choose button (agent not run); a substantive reply runs the same session and the button ask stays. Stuck `/work` with options: `failed`, stub pings nobody, the owner notice is the one post; with the notice post failing, the re-edited stub carries the notice and keeps the Choose button. No `editMessage`: the deferred reply carries the stub + button and its id `reply_1` is `stubMessageId` and maps to the session. No listable options: free text, no button, options undefined. All 6 bridge tests for listable options fail on the base sources (no Choose stub; options dropped) and pass on the branch; with only the `spend-post.ts` re-edit reverted the notice test fails. |
| `REQ-discord-044` / `REQ-discord-045` | `tests/discord.slash-choose-ask.test.ts` (`buttonAskFor`) | Structured options → pending with those options, stub without the options, one Choose button; a numbered list is parsed; a free-form question and a `spend-cap` ask (even with options) → null. |
| `REQ-discord-044` | `tests/discord.slash-pending-ask.test.ts` | The free-text slash asks (no options; a single option) keep a free-text pending ask; thin reply restates, cancel clears, substantive reply resumes; stuck, spend-cap, other-user, finished-run and no-`editMessage` tests pass unchanged. |
| `REQ-discord-045` / `REQ-discord-215` / `REQ-discord-098` | `tests/discord.ask-ephemeral.test.ts`, `tests/discord.collapsed-ping.test.ts`, `tests/discord.spend.test.ts`, `tests/discord.slash-ask7.test.ts` | Chat Choose stub / pick, collapsed pings, spend-cap slash notices and ASK-7 slash collapse pass unchanged. |

Full suite: `bun test` green; `bunx tsc --noEmit` clean;
`specsync check --require-coverage 100` 100%; `fledge lanes run verify
--non-interactive` completed.
