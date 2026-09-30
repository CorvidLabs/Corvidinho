---
change: the-bridge-s-update-post-bridge-live-note-on-every-restart-announcements-channel-only-is-a-short-note-in-persona-md-s
artifact: tasks
---

# Tasks

- [x] Capture PERSONA-1.a (`hi/persona.md`, `INTENT.md` index) with `hi` from Leif's 2026-09-28 interview (round 12); `hi check` green.
- [x] Confirm the gap on main 5aaf7f0: the ClientReady post is `bridge live **vX.Y.Z**` + up to five CHANGELOG bullets (838 characters for 0.0.34); the updater posts nothing to Discord.
- [x] `tests/discord.update-post.test.ts`: the bridge's ClientReady post through `startBridge`, the template, odd versions, `postAnnouncement`; 5 of 7 fail on the base sources.
- [x] `src/discord/announce.ts`: fixed in-voice template with the `<…/releases/tag/vX.Y.Z>` link, plain-version guard, scrub + defang; CHANGELOG / description readers removed. `src/discord/bridge.ts` comments.
- [x] `tests/discord.announce.test.ts`: CHANGELOG-bullet tests removed, announce-channel test on the new note.
- [x] Docs: `docs/discord.md`, `docs/DISCORD-GO-LIVE.md`, `README.md`; spec prose, `files:`, `specs/discord/testing.md`; delta Modified REQ-discord-024 / REQ-discord-025.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.
