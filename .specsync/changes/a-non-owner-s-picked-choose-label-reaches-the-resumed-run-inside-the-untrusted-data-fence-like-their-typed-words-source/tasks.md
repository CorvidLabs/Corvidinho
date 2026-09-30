---
change: a-non-owner-s-picked-choose-label-reaches-the-resumed-run-inside-the-untrusted-data-fence-like-their-typed-words-source
artifact: tasks
---

# Tasks

- [x] Capture SAFE-12.a with `hi` (own commit); `hi check` passes.
- [x] Research: the pick path from option id to prompt, `humanText`, turn and ack; the raw-id fallback.
- [x] `SpeakerSurface` `ask-pick` (`src/discord/injection-guard.ts`).
- [x] Bridge pick: an unmatched option id gets `ASK_CHOICE_EXPIRED` before the claim (no run, ask kept); the label is fenced with the press-time role (`src/discord/bridge.ts`).
- [x] Tests: new "SAFE-12.a on a Choose pick" in `tests/safe.injection.test.ts`; `tests/discord.ask-ephemeral.test.ts` asserts the fence for its community presser.
- [x] Fail-on-base proof (base `bridge.ts` + `injection-guard.ts` swapped in: 9 fail; restored: all pass) and the owner's prompt compared byte for byte (identical).
- [x] Docs: `docs/discord.md`, `docs/DISCORD-GO-LIVE.md` E.6.a.
- [x] Spec: delta (REQ-discord-548, REQ-discord-071 Modified), `discord.spec.md` prose, exports and scenario, `testing.md`.
- [x] SpecSync approve / check / audit, coverage, `hi check`, tsc, `bun test`, fledge verify.
