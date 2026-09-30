---
change: a-non-owner-s-picked-choose-label-reaches-the-resumed-run-inside-the-untrusted-data-fence-like-their-typed-words-source
artifact: plan
---

# Plan

1. Capture SAFE-12.a with `hi` (own commit), `hi check`.
2. Research the pick path (label lookup, role, prompt, humanText, turn).
3. `injection-guard.ts`: `ask-pick` surface.
4. `bridge.ts`: refuse an unmatched option id as expired before the claim;
   fence the label with the press-time role.
5. Tests through the bridge harness (`tests/safe.injection.test.ts`), update
   `tests/discord.ask-ephemeral.test.ts` (community presser now fenced);
   prove fail on base; compare the owner's prompt byte for byte.
6. Docs (`docs/discord.md`, `docs/DISCORD-GO-LIVE.md`), spec prose, scenario,
   testing notes, delta (REQ-discord-548, REQ-discord-071 Modified).
7. Approve, `change check --commit`, audit, coverage, `hi check`, tsc,
   `bun test`, fledge verify.
