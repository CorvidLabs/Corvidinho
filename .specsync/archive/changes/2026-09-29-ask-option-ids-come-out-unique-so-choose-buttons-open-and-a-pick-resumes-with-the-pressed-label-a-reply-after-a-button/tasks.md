---
change: ask-option-ids-come-out-unique-so-choose-buttons-open-and-a-pick-resumes-with-the-pressed-label-a-reply-after-a-button
artifact: tasks
---

# Tasks

- [x] Regression tests: 6 unit cases in `tests/discord.ask-buttons.test.ts` and 5 bridge cases in `tests/discord.ask-ephemeral.test.ts` (on the base `0f2e2c2` without the source change: 8 of the 11 fail; the 3 that pass are guards for unchanged behaviour).
- [x] `src/agent/ask-options.ts`: `normalizeAskOptions` gives a repeated id the first unused position number (`claimOptionId`); already-unique asks byte-identical.
- [x] `src/discord/bridge.ts` `onMessage`: a non-cancel continue clears a timed-out button `pendingAsk` with `clearPendingAsk` before the thin-ack/cancel branch.
- [x] Docs: `docs/discord.md` (thin reply after expiry, repeated option ids, `/work` thin reply).
- [x] Specs: discord and agent spec prose and testing notes; deltas modify REQ-agent-045 and REQ-discord-044.
- [x] SpecSync approve / check / audit / coverage, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.
