---
change: an-answer-typed-in-the-private-answer-form-is-fenced-and-scanned-like-a-chat-reply-a-non-owner-s-submit-that-looks-like
artifact: tasks
---

# Tasks

- [x] Research: every resume path with human-typed text (chat, slash, Answer form, pick, thin / cancel, schedule asks).
- [x] `SpeakerSurface` `ask-answer`; `refuseInjectedInteraction` shared by `refuseInjectedSlash` (unchanged output) and new `refuseInjectedAnswer` (`src/discord/injection-guard.ts`).
- [x] Bridge Answer form submit: role resolved before the branches, `inboundInjection` after thin / cancel, refusal + session tracking like chat, `fenceSpeakerText` on the accepted answer; picks unchanged (`src/discord/bridge.ts`).
- [x] Tests: new "SAFE-12/13 on the private Answer form" in `tests/safe.injection.test.ts`; `tests/discord.ask-answer-modal.test.ts` asserts the fence.
- [x] Fail-on-base proof (base `bridge.ts` + `injection-guard.ts` swapped in: 8 fail; restored: all pass).
- [x] Docs: `docs/discord.md` (SAFE-12/13 section, Questions section), `docs/DISCORD-GO-LIVE.md` E.6.a.
- [x] Spec: delta (REQ-discord-548, REQ-discord-071 Modified), `discord.spec.md` prose, exports and scenario, `testing.md`.
- [x] SpecSync approve / check / audit, coverage, `hi check`, tsc, `bun test`, fledge verify.
