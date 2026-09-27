---
change: discord-channel-autocomplete-for-admin-and-announce-returns-no-choices-unless-the-invoker-is-admin-in-an-allowlisted
artifact: plan
---

# Plan

1. Re-check the gap on current `origin/main` (fbaa84b): the autocomplete
   handler has no gate.
2. Add fixture tests to `tests/discord.channel-autocomplete.test.ts` that call
   the exported `respondChannelAutocomplete` with handlers captured from a
   dry-run `startBridge`. Cover the owner, a non-owner, a user-allowlisted
   non-owner, a channel that is not allowlisted, a muted owner, an owner with
   a deny-listed role, no owner, and a gate that is missing, false or
   throwing.
3. Implement the gate in `gateway.ts` and wire it in `bridge.ts`.
4. Prove the tests fail with main's source (import error, then behavioural
   failures with only `export` added) and pass on the branch.
5. Add REQ-discord-431 (delta). Update `specs/discord/discord.spec.md`
   (Public API, invariant, scenario, error rows) and `docs/discord.md`.
6. Run SpecSync approve / check --commit / audit, `specsync check
   --require-coverage 100`, `bunx tsc --noEmit`, `bun test` and `fledge
   lanes run verify --non-interactive`.
