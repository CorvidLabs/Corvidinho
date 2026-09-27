---
change: discord-keeps-an-open-choose-button-ask-when-a-later-chat-run-asks-again-pending-asks-are-keyed-by-askid-not-one-per
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-044` | `tests/discord.ask-ephemeral.test.ts` › "a side-chat run that asks again keeps the earlier Choose buttons until pressed" | Ask A open, side-chat run asks B: B pending, A in `openAsks`; `ok` restates B; A's Choose opens "Which DB?"; A's pick resumes with A's question + "Postgres"; B stays pending; re-press of A is a no-op; B's pick resumes with "Redis". Fails on main (A replaced; press → "isn’t for you"). |
| `REQ-discord-044` | `tests/discord.ask-ephemeral.test.ts` › "a free-text answer clears only that ask; the earlier button ask stays open" | Free-text answer carries the prior question and clears only it; A pending again and its pick resumes. Fails on main. |
| `REQ-discord-044` | `tests/discord.ask-ephemeral.test.ts` › "a late press on an earlier ask expires only that ask" | Late press on A → `ASK_CHOICE_EXPIRED`, no run; B still pending and opens. Fails on main. |
| `REQ-discord-044` | `tests/discord.ask-ephemeral.test.ts` › "an earlier ask past its timeout is never promoted, so a thin reply after the newest pick runs the agent" | A timed out, B picked: A dropped (no pending ask, no `openAsks`); `ok` runs the agent instead of restating "Which DB?"; a press on A is a no-op. Fails on main (A replaced by B, so the test's A/B setup never holds). |
| `REQ-discord-044` | `tests/discord.ask-ephemeral.test.ts` › "an explicit cancel clears every open ask of the session" | Both asks open before the cancel; `cancel` → `ASK_CANCELLED_ACK`, no run, no open asks; presses on A and B are no-ops. Fails on main (A is not open before the cancel). |
| `REQ-discord-044` | `tests/discord.ask-ephemeral.test.ts` › "SessionStore keeps open asks by askId and persists them across a reopen" | One ask → object row; two → array row, reload as `pendingAsk` + `openAsks`; in-place update; `findPendingAsk`; promotion on clear; free-text replaced, button kept; `null` clears all. Fails on main. |

## Fail-on-main proof

Swapping main's `src/discord/{session-store,bridge,types}.ts` in: all 6 new
tests fail; restored branch source: 10/10 pass in the file.

## Automated coverage

- `bun test tests/discord.ask-ephemeral.test.ts`
- `bun test tests/discord.*.test.ts` (no regressions in existing pending-ask, slash, spend, collapse, inflight tests)
- `bunx tsc --noEmit`
