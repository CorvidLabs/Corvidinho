---
change: my-own-memory-forget-and-override-by-id-ask-me-on-a-dm-card-with-approve-and-a-one-time-code-and-an-override-shows-the
artifact: testing
---

# Testing

New: `tests/memory.forget-card.test.ts` (17 tests; the real card engine with
`memoryApprovalKind`, recording DMs, the owner's presses and code submits via
`tests/fixtures/approval-code.ts`, a fake model through `createTaskExecute`;
temp data dir, no token, no network). Forget: the card's exact action /
target / amount, DMed to the owner; Approve alone forgets nothing; Approve +
code forgets once (request `used`, audit rows `memory-card`,
`approval-code-issue`, `memory-approve` started/ok, `memory-forget`
started/ok); Deny keeps it; a lapse and a late Approve keep it; a stopped run
(exit 130) keeps it; a memory changed after the card is not forgotten even
with the right code. Override: text first, verbatim as quoted data, then the
card; Approve + code stores exactly it; fence-safe; a secret scrubbed on the
card exactly as stored; Deny keeps the old text. No card: local CLI (also
with `--confirm` and a token in the env), the owner's schedule run, a typed
token in the owner's chat; a card that can't be raised or read refuses
with a SAFE-6 scrubbed reason; non-owners refused as before (also with a forged
ADMIN bit), their `memory-forget-me` still records its request; a card whose
waiting run is gone closes as a no. End to end: the fake model's
`memory-forget` call waits for the card and its tool result reports the
forget. The argv hint and descriptions name the card and no `--confirm`.

Changed: `tests/memory.plugins.test.ts` (two-phase cases replaced by card
cases with the owner answering through `setMemoryCardTestHooks`; ACL cases
unchanged), `tests/memory.spawn-env.test.ts` (the typed token is no longer
passed — regression), `tests/discord.session-thread.test.ts` (`humanText`
check without the removed helper). Removed: `tests/memory.confirm.test.ts`
(its module is gone).

Fail-on-base proof (base = `origin/main` `85871fa4`): (1) with every touched
source swapped back to main (`plugins/memory/commands.ts`,
`src/memory/index.ts`, `src/memory/confirm.ts` restored,
`src/discord/agent-client.ts`, `src/discord/approval-cards.ts`,
`src/discord/bridge.ts`, `src/agent/tools.ts`; `src/memory/card.ts` removed)
`tests/memory.forget-card.test.ts` and `tests/memory.plugins.test.ts` cannot
load (no `setMemoryCardTestHooks` / `memoryApprovalKind`) and the spawn-env
regression fails; (2) with only main's `plugins/memory/commands.ts`,
`src/discord/agent-client.ts` and `src/agent/tools.ts` (the card module kept
loadable), 21 of 43 tests in the three files fail (no card raised, a token
returned, `--confirm` accepted, the typed token passed to the run, the hint
names `--confirm`, the card-error reason not scrubbed) and the 22 unchanged
ACL / non-owner cases pass. Restored: 43 of 43 pass.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-183` | `tests/memory.forget-card.test.ts` (all forget / override / no-card / end-to-end cases); `tests/memory.plugins.test.ts` ("SAFE-18.a: the owner's forget asks on a DM card…", "--confirm is refused…", "override shows the new text word for word…", "SAFE-20: denied or unanswered cards change nothing") | One destructive `memory` card per owner call with the exact action / target / amount and the override text; only Approve + code changes the memory, once, while unchanged; Deny / lapse / stop / changed ⇒ nothing; local CLI and schedule refuse with the bridge line and no card; `--confirm` refused; non-owners refused as before; the fake model's call waits and succeeds once approved. |
| `REQ-plugins-011` | `tests/memory.plugins.test.ts` (ACL cases unchanged; card cases); `tests/memory.forget-card.test.ts` ("a typed token is refused in my chat as well…", "the local CLI fails closed…") | Identity / ADMIN only from the bridge env, owner-only, opaque refusals; the two-phase confirm is the card; `--confirm` in any form refused; a token in the env changes nothing. |
| `REQ-discord-183` | `tests/memory.forget-card.test.ts` (engine cases: card DM, buttons `cvok:memory:…`, text part first, Approve + code, Deny, lapse / late press, gone waiter) | The `memory` kind is destructive, DMs only the owner, shows the text first fence-safe and scrubbed, records `approved` for the waiting run to use once, closes as a no on Deny / expiry / gone waiter. |
| `REQ-plugins-010` | `tests/memory.plugins.test.ts` (ACL cases; "SAFE-18.a: the owner's forget asks on a DM card…", "SAFE-20: denied or unanswered cards change nothing") | The four memory commands stay registered with forget / override dangerous; they refuse without admin and change nothing without the owner's approved card (no token). |
| `REQ-discord-128` | `tests/memory.spawn-env.test.ts` ("SAFE-18.a: a confirm token the human typed is not passed to the run…", "tokens in the enriched prompt … are not human-supplied"); `tests/discord.session-thread.test.ts` ("the human's own words come only from the current message…") | Call sites still pass `humanText`; no confirm token reaches a run from it or from the enriched prompt. |
| `REQ-discord-021` | `tests/memory.spawn-env.test.ts` ("SAFE-18.a: a confirm token the human typed is not passed to the run…", the other spawn cases unchanged) | The Discord spawn clears `CORVIDINHO_ACTING_CONFIRM_TOKENS` even when the human's message holds a token; the actor / ADMIN / non-interactive overwrites are unchanged. |
| `REQ-agent-183` | `tests/memory.forget-card.test.ts` ("the memory tools' argv hint and descriptions name the card and no confirm token", "fake model calls memory-forget; I approve with the code; the tool result says it was forgotten") | The hint names the DM card and no `--confirm` (fails on main's `src/agent/tools.ts`); the model's call through `createTaskExecute` waits for the card and its `ToolResult` reports the forget. |
