---
change: the-bridge-s-update-post-bridge-live-note-on-every-restart-announcements-channel-only-is-a-short-note-in-persona-md-s
artifact: testing
---

# Testing

Fixture tests only: `startBridge` with a null gateway whose reply is
recorded, an in-memory DB with the announcements channel set, and the
template directly; no live Discord, no token, no network, no model.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-024` | `tests/discord.update-post.test.ts` ("PERSONA-1.a: the bridge's update post on ClientReady") | After `onReady` with `version` 0.0.34 (a long section in the real CHANGELOG.md): exactly one reply, to the announcements channel, no pinged users, equal to `formatBridgeLiveAnnouncement("0.0.34")`; with no announcements channel nothing is posted anywhere. |
| `REQ-discord-025` | `tests/discord.update-post.test.ts` ("one short in-voice note …") | The posted text is under 400 characters, carries `**v0.0.34**`, `<https://github.com/CorvidLabs/Corvidinho/releases/tag/v0.0.34>` and 🐦‍⬛, has no `bridge live` header, bullet or heading line, newline or "changelog", none of the version's CHANGELOG bullets, and `scrubSecrets` leaves it unchanged. |
| `REQ-discord-025` | `tests/discord.update-post.test.ts` ("PERSONA-1.a: formatBridgeLiveAnnouncement") | Exact template for 0.0.34; ` v1.2.3 ` → v1.2.3; default = package version; `999999.999999.999999` under 400 with the full link; empty, blank, `0.0.34-rc.1`, `@everyone`, `1.0.0 @here`, a runtime-built fake key, a newline bullet, markdown link text and a 20-digit part all give the Releases-page note without the input; `postAnnouncement` sends it once, as is, to the announcements channel. |
| `REQ-discord-024` | `tests/discord.announce.test.ts` ("postAnnouncement") | Default-deny when no channel; posts only to the configured channel with the new note. |

Fail on base: with main 5aaf7f0's `src/discord/announce.ts` swapped in, 5 of
the 7 tests in `tests/discord.update-post.test.ts` fail (the bridge posted an
838-character `bridge live **v0.0.34**` + bullets note; the template, default,
long-version and odd-version tests fail); the two that pass on base are the
no-channel and `postAnnouncement` cases. All 7 pass on the branch, and
`tests/discord.announce.test.ts` passes (9).

Full suite: `bun test` green; `bunx tsc --noEmit` clean; `specsync check
--require-coverage 100` 100%; `hi check` green; `fledge lanes run verify
--non-interactive` completed.
