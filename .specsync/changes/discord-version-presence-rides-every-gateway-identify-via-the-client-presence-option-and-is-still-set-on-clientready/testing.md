---
change: discord-version-presence-rides-every-gateway-identify-via-the-client-presence-option-and-is-still-set-on-clientready
artifact: testing
---

# Testing

Fixture tests only. No Discord token, no network: the tests patch
`Client.prototype.login` for the duration of one gateway start so the real
discord.js `login` runs (it copies `options.presence` into
`options.ws.presence`) with only `client.ws.connect` stubbed, then restore
it. Each test stops the gateway (`client.destroy()`).

`tests/discord.presence.test.ts`:

- **`buildVersionPresenceData`**: `online` with one activity (type 4,
  `Custom Status`, `v9.9.9`); default version is the package VERSION; each
  call returns fresh objects.
- **IDENTIFY presence**: after `createLiveGateway(..., { version: "9.9.9" })`
  and `start()`, `client.options.ws.presence` has status `online` and exactly
  one activity `{ type: 4, name: "Custom Status", state: "v9.9.9" }`.
- **Ready still sets it**: emitting `ClientReady` calls `setPresence` once with
  the same status and activity, sets `botUserId` and calls `onReady`.
- **Ready survives a failed set**: a throwing `setPresence` is logged and
  `onReady` still runs.

## Before and after

- `main`'s `src/discord/gateway.ts` with the new `presence.ts`: 9 pass,
  1 fail. The IDENTIFY test fails with "Expected length: 1, Received
  length: 0" (the IDENTIFY presence has no activity). The ready tests pass,
  which shows `setPresence` on ready is kept as it was.
- `main`'s `gateway.ts` and `presence.ts`: the file fails to load
  (`buildVersionPresenceData` not exported).
- Branch: 10 pass, 0 fail.

Also run: `bun test`, `bunx tsc --noEmit`,
`specsync check --require-coverage 100` and
`fledge lanes run verify --non-interactive`.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-017` | `tests/discord.presence.test.ts` | The IDENTIFY presence discord.js builds at login carries the version Custom Status (fails on `main`: empty activity list); ClientReady still sets the same presence; a throwing `setPresence` does not stop the ready path; `buildVersionPresenceData` / `buildVersionPresenceActivity` shape from the shared VERSION. |
