# Lesson bundle — discord-version-presence-rides-every-gateway-identify-via-the-client-presence-option-and-is-still-set-on-clientready

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Discord version presence rides every gateway IDENTIFY via the Client presence option and is still set on ClientReady (DISCORD-12)
- **Kind**: BugFix
- **Specs**: discord
- **Paths**: src/discord/gateway.ts, src/discord/presence.ts, src/discord/requester-perms.ts, tests/discord.presence.test.ts, specs/discord/discord.spec.md, specs/discord/testing.md, docs/discord.md
- **Acceptance**: The live discord.js Client is constructed with the version Custom Status (type 4, state vX.Y.Z from the shared package version, same as /status) as its presence option, so the presence discord.js copies into the gateway IDENTIFY payload at login carries it on the first IDENTIFY and on any non-resumable re-identify after an invalid or expired session, not an empty activity list. The short-lived DISCORD-8 requester-check Client that logs in with the same bot token identifies with the same presence. ClientReady still sets the same presence; a failure there is logged and does not abort slash registration or the bridge. No new slash command, env var, config key or allowlist change. Regression tests fail on main and pass after.

## Evidence

- Verification commit: `3d8c56d05dbfc4996f6c6265edfaaab78cf2cbd3`
- Base commit: `fbaa84b7cda1bf2b462baea44cad20ef93e0df4f`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

DISCORD-12 (hi/discord.md): "Under the bot name I always see the Corvidinho
version (same shared version as /status) as a short Discord presence or
custom status so I can tell which build is live at a glance."

On `origin/main` (fbaa84b) `createLiveGateway` builds the discord.js Client
with intents only, and the version Custom Status is set only in the
`ClientReady` handler through `ready.user.setPresence`. In discord.js
14.27.0, `Client#login` copies `options.presence` (default `{}`) into
`options.ws.presence`, which becomes `initialPresence` of the
@discordjs/ws manager; @discordjs/ws sends it as `d.presence` on every
IDENTIFY. With the default, that is `status: online` and an empty activity
list. `WebSocketManager#checkShardsReady` returns early once the client is
Ready, so `ClientReady` does not fire again after a non-resumable
re-identify (invalid or expired session): the gateway then shows no custom
status until the bridge restarts. That breaks "always".

The DISCORD-8 requester check (`verifyRequesterCanSend`, used by
`discord-post-message --requesting-user-id`) builds a second Client with the
same bot token and intents only, so its IDENTIFY has the same empty activity
list.

Scope: this slice only. Open PRs #232 (ask-button actor gate) and #233
(SAFE-3 clamp) are unrelated and untouched.

## From the change's design.md

# Design

`src/discord/presence.ts` gains `buildVersionPresenceData(version)` and its
type `VersionPresenceData`: `{ status: "online", activities: [the existing
buildVersionPresenceActivity(version)] }`, a fresh object per call because
discord.js mutates what it is given (`ClientPresence` assigns `user` onto
the options object; `_parse` may rewrite activities).

`createLiveGateway` passes `presence: buildVersionPresenceData(presenceVersion)`
in the Client options, so discord.js puts the version into the IDENTIFY
payload at login and reuses it for every re-identify. The `ClientReady`
handler keeps calling `setPresence`, now with `buildVersionPresenceData`
(same status and activity as before); its try/catch and log line are
unchanged. `ActivityType` is no longer destructured: the helper's type 4 is
`ActivityType.Custom`.

`verifyRequesterCanSend` (`src/discord/requester-perms.ts`, DISCORD-8) builds
its own short-lived Client and logs in with the same bot token, so it opens a
second gateway session. It now passes `presence: buildVersionPresenceData()`
too; without it that IDENTIFY sends `status: online` with an empty activity
list under the bot name.

No new slash command, env var, config key, table or column. The SQLite
schema is untouched. `/status` and the version source are unchanged.

## From the change's testing.md

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
- **Requester check IDENTIFY presence**: `verifyRequesterCanSend` (DISCORD-8)
  runs the real `login` with `client.ws.connect` stubbed to throw after the
  IDENTIFY presence is built; `client.options.ws.presence` carries the
  package-version Custom Status, the call rejects and the client is destroyed.

## Before and after

- `main`'s `src/discord/gateway.ts` with the new `presence.ts`: 9 pass,
  1 fail. The IDENTIFY test fails with "Expected length: 1, Received
  length: 0" (the IDENTIFY presence has no activity). The ready tests pass,
  which shows `setPresence` on ready is kept as it was.
- `main`'s `gateway.ts` and `presence.ts`: the file fails to load
  (`buildVersionPresenceData` not exported).
- `main`'s `src/discord/requester-perms.ts` with the rest of the branch:
  10 pass, 1 fail. The requester-check test fails with "Expected length: 1,
  Received length: 0".
- Branch: 11 pass, 0 fail.

Also run: `bun test`, `bunx tsc --noEmit`,
`specsync check --require-coverage 100` and
`fledge lanes run verify --non-interactive`.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-017` | `tests/discord.presence.test.ts` | The IDENTIFY presence discord.js builds at login carries the version Custom Status (fails on `main`: empty activity list); ClientReady still sets the same presence; a throwing `setPresence` does not stop the ready path; the DISCORD-8 requester-check login identifies with the same presence (fails on `main`); `buildVersionPresenceData` / `buildVersionPresenceActivity` shape from the shared VERSION. |

## Where these lessons go

- `specs/discord/context.md`
