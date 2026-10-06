---
change: the-fixed-bridge-live-note-it-posts-after-a-restart-is-system-text-not-an-announcement-so-it-posts-without-waiting-for
artifact: testing
---

# Testing

`tests/discord.update-post.test.ts` gains the block "AUTONOMY-10.b: the
bridge-live note is system text, so it posts without the owner's OK" (4
tests): `startBridge` with a null gateway (replies and DMs recorded,
`isPublicThread` true for every channel), an in-memory DB with the
announcements channel set, an owner configured, a 5 ms card-engine poll and an
agent that would answer with model text; `runPlugin` with the must-ask test
hook (`tests/fixtures/must-ask.ts`) and a temp data dir for the
`discord-post-message` case. No network, no token.

Fail-on-base proof: with main e1a24ed's `docs/discord.md`,
`docs/DISCORD-GO-LIVE.md`, `hi/autonomy.md`, `INTENT.md`,
`src/discord/announce.ts` and `src/discord/bridge.ts` swapped in,
`bun test tests/discord.update-post.test.ts` gave 10 pass, 1 fail: the doc /
hi citation case (no AUTONOMY-10.b on main). The three behaviour cases pass on
main, because the bridge already posted the note with no card and no model
text — this change records Leif's decision, it does not change behaviour.
Mutation check: routing the note through the public-thread reply gate
(`publicReplies.hold` before `postAnnouncement`) fails both bridge cases
(a card is recorded and the note waits). Restored: 11 of 11 pass.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-024` | `tests/discord.update-post.test.ts` "after every restart it posts at once with no Approve card, even with an owner set and an announcements channel that is a public thread" | two restarts on one DB: one post each, to the announcements channel, exactly the fixed template; no hold line, no `approval_requests` row, no DM, approved count 0, no agent call. |
| `REQ-discord-024` | same file, "it carries only the fixed template: a version that is not a plain release version, model text included, is never echoed" | `1.0.0` plus model-looking text gives the fixed Releases-page note with none of it and no agent call; the running build's note matches the template. |
| `REQ-discord-024` | same file, "the exemption is the bridge's own note only: a discord-post-message with the same words still waits for the owner's card (AUTONOMY-10.a)" | one `mustask-post` card showing exactly the note's text; a deny refuses it with `refused (AUTONOMY-10)`. |
| `REQ-discord-024` | same file, "docs/discord.md's must-ask list names the bridge-live note as system text that needs no card, citing AUTONOMY-10.b, which hi/autonomy.md holds" | the "Not on the list" line names the note and cites AUTONOMY-10.b; `hi/autonomy.md` holds Leif's text. Fails on the base sources. |
| `REQ-discord-024` | same file, "PERSONA-1.a: the bridge's update post on ClientReady" (2 tests, unchanged) | one in-voice post only in the announcements channel; none without one. |
| all | full `bun test`, `fledge lanes run verify --non-interactive` | Run on this branch before push. |
