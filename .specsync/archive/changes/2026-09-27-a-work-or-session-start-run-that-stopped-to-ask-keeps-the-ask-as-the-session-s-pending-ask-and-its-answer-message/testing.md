---
change: a-work-or-session-start-run-that-stopped-to-ask-keeps-the-ask-as-the-session-s-pending-ask-and-its-answer-message
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-044` | `tests/discord.slash-pending-ask.test.ts` | 12 fixture tests through `startBridge` (fake gateway, in-memory thinking outbound with `editMessage` so the slash answer collapses as on the live gateway): `/work` clarify ask with structured options → task `blocked` (not `completed`), pending ask stored as free text, answer message maps to the session; reply `ok` → restated question with requester mention (allowed mentions exactly the requester) and reply hint, agent not run, pending kept; reply `cancel` → `ASK_CANCELLED_ACK`, pending cleared, agent not run; substantive reply → same session resumed with the prior question and `Human answer:` in the prompt, pending cleared; `/work` at the spend cap → `blocked`, no pending ask, a later `ok` runs the agent with no cap or prior-question text; `/session start` clarify → thin reply restates, substantive reply resumes with the question; `/session start` clarify with structured options → free-text pending, a substantive reply answers and clears it; `/work` stuck ask → task `failed`, pending stored, the owner notice is the one post that pings (allowed mentions exactly the owner), a thin reply restates to the owner only; another user's `ok` / `cancel` / substantive reply to the `/work` answer → agent not run, nothing posted, requester's pending ask kept; `/session start` at the cap → no pending ask; finished `/work` → `completed`, no pending ask, reply continues the session; fallback without `editMessage` → pending stored and an @mention `ok` restates without running the agent. On main (dc65cf7, and 3cdbb5c after the merge) all fail (answer message untracked, no pending ask): 0/12; 12/12 after. Mutations caught: dropping the spend-cap guard (work or session), keeping options (work or session), storing only clarify asks, removing the bridge tracking. |
| `REQ-discord-044` | `tests/discord.thin-ack.test.ts`, `tests/discord.spend.test.ts`, `tests/discord.slash-ask7.test.ts` | Existing chat thin-ack / cancel / substantive tests, the #160 spend-cap and slash ask tests, and the DISCORD-ASK-7 slash collapse tests pass unchanged. |

Also run: `bunx tsc --noEmit`, full `bun test`,
`specsync check --require-coverage 100`,
`fledge lanes run verify --non-interactive`.
