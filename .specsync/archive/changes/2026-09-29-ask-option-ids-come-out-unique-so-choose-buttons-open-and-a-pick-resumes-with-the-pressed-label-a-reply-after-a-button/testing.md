---
change: ask-option-ids-come-out-unique-so-choose-buttons-open-and-a-pick-resumes-with-the-pressed-label-a-reply-after-a-button
artifact: testing
---

# Testing

Regression tests (fixtures only, no live Discord or network):

- `tests/discord.ask-buttons.test.ts` › "ask option ids are unique
  (DISCORD-ASK-1/3 / REQ-agent-045)" — 6 unit cases on
  `normalizeAskOptions`, `askFromToolArguments`, `buildChoiceComponents`
  and `findOptionLabel`.
- `tests/discord.ask-ephemeral.test.ts` › "ask option ids and expired button
  asks (DISCORD-ASK-1/3/5)" — 5 cases through `startBridge` with a scripted
  agent and the null gateway (the existing harness).

Fail-on-base proof: with `src/agent/ask-options.ts` and
`src/discord/bridge.ts` swapped back to `origin/main` (`0f2e2c2`) and the
new tests kept, 8 of the 11 new tests fail (4 unit, 4 bridge); the 3 that
pass there are guards for behaviour this change keeps (a dropped empty
option holds no id; already-unique asks normalize byte-identically; cancel
after expiry keeps its ack). With the change: all 11 pass, and the 136 tests
of the ask suites (`tests/discord.ask-*.test.ts`, `tests/agent.ask.test.ts`,
`tests/discord.slash-*ask*.test.ts`, `tests/scheduler.ask-outbox.test.ts`)
pass.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-045` | `tests/discord.ask-buttons.test.ts` › "a repeated explicit id takes the first unused position number" | `[{x,Keep},{x,Drop}]` → ids `x`, `1` (labels kept); `[{x},{x},{1}]` → `x`, `1`, `2`. |
| `REQ-agent-045` | `tests/discord.ask-buttons.test.ts` › "a position fallback that equals an earlier id is moved on" | `[{2,A},{✅,B}]` → `2`, `1`; `["Yes",{1,No}]` → `1`, `2`. |
| `REQ-agent-045` | `tests/discord.ask-buttons.test.ts` › "ids that are equal once cut to 32 chars stay apart" | Two slugs sharing their first 32 chars → `option_use_postgres_for_the_main`, `1`. |
| `REQ-agent-045` | `tests/discord.ask-buttons.test.ts` › "a dropped empty option does not hold its id" | `[{a,"  "},{a,A},{b,B}]` → `a`, `b`. |
| `REQ-agent-045` | `tests/discord.ask-buttons.test.ts` › "already-unique options normalize byte-identically, again and again" | Strings, explicit ids, mixed and a de-duplicated ask re-normalize to the same JSON; `[{1,Postgres},{2,SQLite}]` stays byte-identical. |
| `REQ-agent-045` | `tests/discord.ask-buttons.test.ts` › "ask-human args with one id twice give buttons with distinct custom ids" | `askFromToolArguments` with ids `x`, `x` → 2 distinct pick `custom_id`s; the second id finds `Drop`. |
| `REQ-discord-045` | `tests/discord.ask-ephemeral.test.ts` › "options with a repeated id open as distinct buttons and a pick resumes with the pressed label" | Stored ask has 2 distinct ids; the Choose press sends 2 distinct pick `custom_id`s; pressing the second resumes with `humanText` `Drop` and "Human answer:\nDrop". |
| `REQ-discord-044` | `tests/discord.ask-ephemeral.test.ts` › "a thin reply after the button ask timed out runs the agent, not a restated Choose" | After `expiresAt` passes, `ok` runs the agent (2 calls, no "Which DB?]" block), no reply carries the ask's `cvask:open` button or the Choose hint, and no ask is pending. |
| `REQ-discord-044` | `tests/discord.ask-ephemeral.test.ts` › "a thin reply after the newest button ask timed out restates the newest one still live" | Newest ask B timed out, earlier A live: `ok` runs no agent and restates A's Choose button (not B's); A is `pendingAsk`, `openAsks` empty. |
| `REQ-discord-044` | `tests/discord.ask-ephemeral.test.ts` › "a substantive reply after the button ask timed out runs the agent and clears it" | A substantive reply runs the agent and leaves no pending ask; a later `ok` runs the agent too. |
| `REQ-discord-044` | `tests/discord.ask-ephemeral.test.ts` › "cancel after the button ask timed out still gets the short ack and no agent run" | `cancel` → `ASK_CANCELLED_ACK`, no agent run, no pending ask. |
