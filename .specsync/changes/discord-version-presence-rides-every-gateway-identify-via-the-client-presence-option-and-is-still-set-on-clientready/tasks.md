---
change: discord-version-presence-rides-every-gateway-identify-via-the-client-presence-option-and-is-still-set-on-clientready
artifact: tasks
---

# Tasks

- [x] Re-check the gap on current `main` (fbaa84b): the Client is built without `presence`; only `ClientReady` sets it.
- [x] Confirm in discord.js 14.27.0 / @discordjs/ws that `options.presence` becomes the IDENTIFY `d.presence` and that `ClientReady` does not fire again after a re-identify.
- [x] Add `buildVersionPresenceData` in `src/discord/presence.ts`.
- [x] Pass it as the Client `presence` option in `createLiveGateway`; keep `setPresence` on ready with the same data.
- [x] Regression tests in `tests/discord.presence.test.ts`; prove the IDENTIFY test fails with `main`'s gateway and the file passes after.
- [x] Review: the DISCORD-8 requester check (`verifyRequesterCanSend`) opens a second gateway session with the same bot token and identified with an empty activity list; pass the same presence there, with a regression test that fails on `main`.
- [x] Modified delta for REQ-discord-017; spec Public API line, `specs/discord/testing.md` and `docs/discord.md` presence row updated.
- [x] `specsync check --require-coverage 100`, `bunx tsc --noEmit`, `bun test` and `fledge lanes run verify --non-interactive`.
