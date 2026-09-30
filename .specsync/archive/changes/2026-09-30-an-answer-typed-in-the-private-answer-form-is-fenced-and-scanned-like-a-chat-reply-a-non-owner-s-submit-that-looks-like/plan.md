---
change: an-answer-typed-in-the-private-answer-form-is-fenced-and-scanned-like-a-chat-reply-a-non-owner-s-submit-that-looks-like
artifact: plan
---

# Plan

1. Map every resume path that carries human-typed text into a run (research).
2. `injection-guard.ts`: `ask-answer` surface, shared interaction refusal,
   `refuseInjectedAnswer`.
3. `bridge.ts`: resolve the presser's role before the branches; scan then
   fence the form's answer; picks unchanged.
4. Tests through the bridge harness (`tests/safe.injection.test.ts`), update
   `tests/discord.ask-answer-modal.test.ts` for the fence; prove fail on base.
5. Docs (`docs/discord.md`, `docs/DISCORD-GO-LIVE.md`), spec prose, scenario,
   testing notes, delta.
6. Approve, `change check --commit`, audit, coverage, `hi check`, tsc,
   `bun test`, fledge verify.
